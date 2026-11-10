import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as ts from 'typescript';

/** The part of the tsrs programmatic API this uses. It mirrors `typescript/sync` from TypeScript 7.1. */
interface NativeCompiler {
  API: new (options: { cwd: string }) => {
    parseConfigFile(file: string): { options: Record<string, unknown> };
    createProgram(rootFiles: readonly string[], options: Record<string, unknown>): NativeProgram;
    close(): void;
  };
}

interface NativeProgram {
  getSourceFileNames(): readonly string[];
  getDeclarationEmit(files: readonly string[]): {
    outputFiles: ReadonlyMap<string, { text?: string; sourceFileName?: string }>;
    diagnostics: ReadonlyArray<{ fileName?: string }>;
  };
}

type TextEdit = { start: number; end: number; text: string };

const loadNativeCompiler = (): NativeCompiler | undefined => {
  try {
    return createRequire(import.meta.url)('tsrs/sync') as NativeCompiler;
  } catch {
    return undefined;
  }
};

/** Compilers name files absolute and with forward slashes on every platform. */
const compilerPath = (fileName: string) => path.resolve(fileName).split(path.sep).join('/');

const isOverlayable = (fileName: string) => !fileName.includes('/node_modules/') && !fileName.endsWith('.d.ts') && /\.[cm]?tsx?$/.test(fileName);

/** tsoa reads decorators and class property initializers from the source, and declarations drop both. */
const needsSource = (text: string) => /^\s*@\w/m.test(text) || /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s/m.test(text);

const parse = (fileName: string, text: string) => ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);

/** Declarations drop the JSDoc on an initializer's object keys, such as a zod schema's, and tsoa reads it as the description. */
const documentsInitializerKeys = (fileName: string, source: string) => {
  if (!source.includes('/**')) {
    return false;
  }
  const documented = (node: ts.Node): boolean => (ts.isPropertyAssignment(node) && ts.getJSDocCommentsAndTags(node).length > 0) || (ts.forEachChild(node, documented) ?? false);
  return parse(fileName, source)
    .statements.filter(ts.isVariableStatement)
    .some(statement => statement.declarationList.declarations.some(declaration => declaration.initializer !== undefined && documented(declaration.initializer)));
};

/** Keeps line numbers, which tsoa records in its metadata and error messages. */
const blankLines = (text: string) => text.replace(/[^\n]/g, '');

const decoratorName = (decorator: ts.Decorator) => (ts.isCallExpression(decorator.expression) ? decorator.expression.expression.getText() : decorator.expression.getText());

const applyEdits = (text: string, edits: readonly TextEdit[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end), text);

const importedNames = (statement: ts.ImportDeclaration) => {
  const clause = statement.importClause;
  const bindings = clause?.namedBindings;
  const named = bindings && ts.isNamedImports(bindings) ? bindings.elements.map(element => element.name.text) : bindings ? [bindings.name.text] : [];
  return clause?.name ? [clause.name.text, ...named] : named;
};

const identifiersIn = (node: ts.Node, into = new Set<string>()) => {
  if (ts.isIdentifier(node)) {
    into.add(node.text);
  }
  ts.forEachChild(node, child => void identifiersIn(child, into));
  return into;
};

/**
 * Declaration emit writes a type the file doesn't import as `import("./x").Foo`, and tsoa's resolver
 * reads a written annotation by name. This names those types through imports, and returns undefined
 * when a name is taken or isn't a plain export.
 */
function nameImportTypes(type: ts.TypeNode, declarationFile: ts.SourceFile, taken: Set<string>, imports: Map<string, string>): string | undefined {
  const edits: TextEdit[] = [];
  let representable = true;
  const visit = (node: ts.Node) => {
    if (ts.isImportTypeNode(node)) {
      const name = node.qualifier && ts.isIdentifier(node.qualifier) ? node.qualifier.text : undefined;
      const specifier = ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal) ? node.argument.literal.text : undefined;
      if (!name || !specifier || node.isTypeOf || name === 'default' || (taken.has(name) && imports.get(name) !== specifier)) {
        representable = false;
        return;
      }
      imports.set(name, specifier);
      edits.push({ start: node.getStart(declarationFile), end: node.qualifier!.end, text: name });
    }
    ts.forEachChild(node, visit);
  };
  visit(type);
  return representable
    ? applyEdits(declarationFile.text, edits).slice(type.getStart(declarationFile), type.end - edits.reduce((removed, edit) => removed + (edit.end - edit.start - edit.text.length), 0))
    : undefined;
}

/**
 * Rewrites a file with classes so the checker never needs their method bodies, or the modules only
 * those bodies import. Inferred return types come from the declarations. Middleware arguments go
 * too, because generation doesn't read them. Returns undefined when a method needs a type the
 * declarations don't have.
 */
export function stubMethodBodies(fileName: string, source: string, declarations: string): string | undefined {
  const sourceFile = parse(fileName, source);
  const declarationFile = parse(`${fileName}.d.ts`, declarations);
  const edits: TextEdit[] = [];
  const taken = identifiersIn(sourceFile);
  const typeImports = new Map<string, string>();

  const visitDecorators = (node: ts.HasDecorators) => {
    for (const decorator of ts.getDecorators(node) ?? []) {
      if (decoratorName(decorator) === 'Middlewares' && ts.isCallExpression(decorator.expression)) {
        const { expression } = decorator;
        edits.push({ start: expression.expression.end, end: expression.end, text: `(${blankLines(source.slice(expression.expression.end, expression.end))})` });
      }
    }
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) {
      continue;
    }
    visitDecorators(statement);

    const declaredClass = declarationFile.statements.find((candidate): candidate is ts.ClassDeclaration => ts.isClassDeclaration(candidate) && candidate.name?.text === statement.name?.text);

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !member.body) {
        continue;
      }
      visitDecorators(member);

      if (!member.type) {
        const isPrivate = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private;
        const declared = declaredClass?.members.find((candidate): candidate is ts.MethodDeclaration => ts.isMethodDeclaration(candidate) && candidate.name.getText() === member.name.getText());
        if (!declared?.type && !isPrivate) {
          return undefined;
        }
        if (declared?.type) {
          const type = nameImportTypes(declared.type, declarationFile, taken, typeImports);
          if (type === undefined) {
            return undefined;
          }
          edits.push({ start: member.body.pos, end: member.body.pos, text: `: ${type.replace(/\s*\n\s*/g, ' ')}` });
        }
      }

      edits.push({ start: member.body.getStart(sourceFile), end: member.body.end, text: `{${blankLines(member.body.getText(sourceFile))}}` });
    }
  }

  const typeImportLines = [...typeImports].map(([name, specifier]) => `import type { ${name} } from ${JSON.stringify(specifier)}; `).join('');
  const stubbed = typeImportLines + applyEdits(source, edits);
  const stubbedFile = parse(fileName, stubbed);
  const used = new Set<string>();
  stubbedFile.statements.filter(statement => !ts.isImportDeclaration(statement)).forEach(statement => identifiersIn(statement, used));
  const unusedImports = stubbedFile.statements.filter(ts.isImportDeclaration).filter(statement => statement.importClause && !importedNames(statement).some(name => used.has(name)));

  return applyEdits(
    stubbed,
    unusedImports.map(statement => ({ start: statement.getStart(stubbedFile), end: statement.end, text: blankLines(statement.getText(stubbedFile)) })),
  );
}

/** Imports whose values a file's decorators or parameter defaults read. tsoa evaluates those, and declarations drop the values. */
function constantImports(fileName: string, source: string) {
  const sourceFile = parse(fileName, source);
  const read = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isDecorator(node) && decoratorName(node) !== 'Middlewares') {
      identifiersIn(node.expression, read);
    } else if ((ts.isParameter(node) || ts.isPropertyDeclaration(node)) && node.initializer) {
      identifiersIn(node.initializer, read);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return importsOf(sourceFile, read);
}

/** Imports a constant's own value reads, for a constant tsoa evaluates. */
function constantValueImports(fileName: string, source: string) {
  const sourceFile = parse(fileName, source);
  const read = new Set<string>();
  for (const statement of sourceFile.statements.filter(ts.isVariableStatement)) {
    statement.declarationList.declarations.forEach(declaration => declaration.initializer && identifiersIn(declaration.initializer, read));
  }
  return importsOf(sourceFile, read);
}

function importsOf(sourceFile: ts.SourceFile, read: ReadonlySet<string>) {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .filter(statement => importedNames(statement).some(name => read.has(name)))
    .flatMap(statement => (ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : []));
}

/**
 * Walks the project from the root files through the imports the checker will see, asking tsrs for
 * declarations one layer at a time. Files only their implementations reach are never emitted or
 * read. Returns the text to serve in place of each source file.
 */
function collectOverlay(program: NativeProgram, rootFiles: readonly string[], options: ts.CompilerOptions) {
  const known = new Set(program.getSourceFileNames());
  const moduleCache = ts.createModuleResolutionCache(process.cwd(), fileName => fileName, options);
  const resolve = (specifier: string, from: string) => ts.resolveModuleName(specifier, from, options, ts.sys, moduleCache).resolvedModule?.resolvedFileName;
  const overlay = new Map<string, string>();
  const keepSource = new Set<string>();
  const seen = new Set(rootFiles);
  let frontier = rootFiles.filter(fileName => known.has(fileName));

  const follow = (fileName: string, text: string, next: Set<string>) => {
    for (const imported of ts.preProcessFile(text, true, true).importedFiles) {
      const resolved = resolve(imported.fileName, fileName);
      if (resolved && isOverlayable(resolved) && known.has(resolved) && !seen.has(resolved)) {
        seen.add(resolved);
        next.add(resolved);
      }
    }
  };

  // A file's declarations expand the types its initializers build from imports, e.g. a zod `.extend()`, so the JSDoc goes with them.
  const documented = new Map<string, boolean>();
  const carriesDocumentedKeys = (fileName: string, source: string): boolean => {
    const known = documented.get(fileName);
    if (known !== undefined) {
      return known;
    }
    documented.set(fileName, false);
    const result =
      documentsInitializerKeys(fileName, source) ||
      constantValueImports(fileName, source).some(specifier => {
        const resolved = resolve(specifier, fileName);
        if (!resolved || !isOverlayable(resolved)) {
          return false;
        }
        const imported = ts.sys.readFile(resolved);
        return imported !== undefined && carriesDocumentedKeys(resolved, imported);
      });
    documented.set(fileName, result);
    return result;
  };

  const keep = (specifier: string, from: string, next: Set<string>) => {
    const resolved = resolve(specifier, from);
    if (!resolved || !isOverlayable(resolved) || keepSource.has(resolved)) {
      return;
    }
    keepSource.add(resolved);
    const source = ts.sys.readFile(resolved) ?? '';
    if (overlay.delete(resolved)) {
      follow(resolved, source, next);
    }
    constantValueImports(resolved, source).forEach(imported => keep(imported, resolved, next));
  };

  while (frontier.length > 0) {
    const output = program.getDeclarationEmit(frontier);
    // A declaration diagnostic means the emit replaced a type it couldn't name with `any`.
    const failed = new Set(output.diagnostics.map(diagnostic => diagnostic.fileName));
    const declarations = new Map([...output.outputFiles.values()].map(file => [file.sourceFileName, file.text]));
    const next = new Set<string>();

    for (const fileName of frontier) {
      const source = ts.sys.readFile(fileName);
      if (source === undefined) {
        continue;
      }
      const declared = failed.has(fileName) || keepSource.has(fileName) || carriesDocumentedKeys(fileName, source) ? undefined : declarations.get(fileName);
      const usesSource = needsSource(source);
      const text = declared === undefined ? undefined : usesSource ? stubMethodBodies(fileName, source, declared) : declared;

      if (usesSource) {
        constantImports(fileName, source).forEach(specifier => keep(specifier, fileName, next));
      }

      if (text !== undefined) {
        overlay.set(fileName, text);
      }
      follow(fileName, text ?? source, next);
    }

    frontier = [...next];
  }

  return overlay;
}

/**
 * A compiler host that serves declarations from tsrs in place of TypeScript sources. Inferring
 * through function bodies is most of what generation spends its time on, and the declarations
 * already hold the result. Returns undefined when tsrs isn't installed or can't handle the project,
 * and generation then reads the sources.
 */
export function createNativeDeclarationHost(
  rootFiles: readonly string[],
  options: ts.CompilerOptions,
  overrides: ts.CompilerOptions | undefined,
  tsconfigPath: string | undefined,
): ts.CompilerHost | undefined {
  const native = process.env.TSOA_NATIVE === 'off' ? undefined : loadNativeCompiler();
  if (!native) {
    return undefined;
  }

  const roots = rootFiles.map(compilerPath);
  let overlay: Map<string, string>;
  try {
    const api = new native.API({ cwd: tsconfigPath ? path.dirname(tsconfigPath) : process.cwd() });
    try {
      const program = api.createProgram(roots, {
        ...(tsconfigPath ? api.parseConfigFile(tsconfigPath).options : {}),
        ...overrides,
        composite: false,
        declaration: true,
        declarationMap: false,
        emitDeclarationOnly: true,
        incremental: false,
        noEmit: false,
        removeComments: false,
        stripInternal: false,
      });
      overlay = collectOverlay(program, roots, options);
    } finally {
      api.close();
    }
  } catch (error) {
    console.warn(`tsoa: reading TypeScript sources because tsrs failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }

  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const text = overlay.get(compilerPath(fileName));
    return text === undefined ? getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) : ts.createSourceFile(fileName, text, languageVersionOrOptions);
  };
  return host;
}
