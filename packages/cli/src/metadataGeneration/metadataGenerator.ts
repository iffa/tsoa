import { Config, Tsoa } from '@iffa/tsoa-runtime';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as ts from 'typescript';
import { createProgram, forEachChild, isClassDeclaration, type ClassDeclaration, type CompilerOptions, type Program, type TypeChecker } from 'typescript';
import { getDecorators } from '../utils/decoratorUtils';
import { importClassesFromDirectories } from '../utils/importClassesFromDirectories';
import { ControllerGenerator } from './controllerGenerator';
import { GenerateMetadataError } from './exceptions';
import { createNativeDeclarationHost } from './nativeDeclarations';
import { TypeResolver } from './typeResolver';
import { routePath, routeSignature } from '../utils/routePaths';

const NO_INPUTS_FOUND = 18003;
const EMPTY_FILES_LIST = 18002;

export class MetadataGenerator {
  public readonly controllerNodes = new Array<ClassDeclaration>();
  public readonly typeChecker: TypeChecker;
  private readonly program: Program;
  private referenceTypeMap: Tsoa.ReferenceTypeMap = {};
  private modelDefinitionPosMap: { [name: string]: Array<{ fileName: string; pos: number }> } = {};
  private expressionOrigNameMap: Record<string, string> = {};

  constructor(
    entryFile: string,
    compilerOptions?: CompilerOptions,
    private readonly ignorePaths?: string[],
    controllers?: string[],
    private readonly rootSecurity: Tsoa.Security[] = [],
    public readonly defaultNumberType: NonNullable<Config['defaultNumberType']> = 'double',
    tsconfigPath?: string,
  ) {
    TypeResolver.clearCache();
    const resolvedOptions = tsconfigPath ? this.resolveCompilerOptionsFromTsconfig(tsconfigPath, compilerOptions) : compilerOptions || {};
    const rootFiles = controllers ? this.resolveControllerFiles(controllers) : [entryFile];
    this.program = createProgram(rootFiles, resolvedOptions, createNativeDeclarationHost(rootFiles, resolvedOptions, compilerOptions, tsconfigPath));
    this.typeChecker = this.program.getTypeChecker();
  }

  /**
   * Reads the provided tsconfig.json and merges its compiler options with any explicit
   * overrides. Explicit overrides take precedence over tsconfig settings.
   */
  static resolveTsconfigPath(entryFile: string | undefined): string | undefined {
    // A config that only lists controllerPathGlobs has no entry file, and its project is the working directory.
    const searchDir = entryFile ? path.dirname(path.resolve(entryFile)) : process.cwd();
    return ts.findConfigFile(searchDir, ts.sys.fileExists.bind(ts.sys), 'tsconfig.json');
  }

  private resolveCompilerOptionsFromTsconfig(tsconfigPath: string, overrides?: CompilerOptions): CompilerOptions {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile.bind(ts.sys));
    if (configFile.error) {
      throw new GenerateMetadataError(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
    }
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath), undefined, tsconfigPath);
    // tsoa picks its own root files, so a config without inputs still supplies valid options.
    const errors = parsed.errors.filter(error => error.code !== NO_INPUTS_FOUND && error.code !== EMPTY_FILES_LIST);
    if (errors.length) {
      throw new GenerateMetadataError(`Invalid tsconfig '${tsconfigPath}':\n${errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n')}`);
    }
    return { ...parsed.options, ...(overrides?.paths && { pathsBasePath: process.cwd() }), ...overrides };
  }

  public Generate(): Tsoa.Metadata {
    this.extractNodeFromProgramSourceFiles();

    const controllers = this.buildControllers();

    this.checkForDuplicateRoutes(controllers);

    return {
      controllers,
      referenceTypeMap: this.referenceTypeMap,
    };
  }

  private resolveControllerFiles(controllers: string[]): string[] {
    const allGlobFiles = importClassesFromDirectories(controllers, ['.mts', '.ts']);
    if (allGlobFiles.length === 0) {
      throw new GenerateMetadataError(`[${controllers.join(', ')}] globs found 0 controllers.`);
    }

    return allGlobFiles;
  }

  private extractNodeFromProgramSourceFiles() {
    this.program.getSourceFiles().forEach(sf => {
      if (this.ignorePaths && this.ignorePaths.length) {
        for (const path of this.ignorePaths) {
          if (minimatch(sf.fileName, path)) {
            return;
          }
        }
      }

      forEachChild(sf, node => {
        if (isClassDeclaration(node) && getDecorators(node, identifier => identifier.text === 'Route').length) {
          this.controllerNodes.push(node);
        }
      });
    });
  }

  private checkForDuplicateRoutes(controllers: Tsoa.Controller[]) {
    const routes = new Map<string, string>();
    for (const controller of controllers) {
      for (const method of controller.methods) {
        const signature = routeSignature(method.method, routePath(controller.path, method.path));
        const location = `${controller.location}:${method.sourceLine || 1} (${controller.name}.${method.name})`;
        const previous = routes.get(signature);
        if (previous) {
          throw new GenerateMetadataError(`Duplicate route ${signature}:\n  ${previous}\n  ${location}`);
        }
        routes.set(signature, location);
      }
    }
  }

  public TypeChecker() {
    return this.typeChecker;
  }

  public AddReferenceType(referenceType: Tsoa.ReferenceType) {
    if (!referenceType.refName) {
      throw new Error('no reference type name found');
    }
    this.referenceTypeMap[referenceType.refName] = referenceType;
  }

  public GetReferenceType(refName: string) {
    return this.referenceTypeMap[refName];
  }

  public CheckModelUnicity(refName: string, positions: Array<{ fileName: string; pos: number }>) {
    if (!this.modelDefinitionPosMap[refName]) {
      this.modelDefinitionPosMap[refName] = positions;
    } else {
      const origPositions = this.modelDefinitionPosMap[refName];
      if (!(origPositions.length === positions.length && positions.every(pos => origPositions.find(origPos => pos.pos === origPos.pos && pos.fileName === origPos.fileName)))) {
        throw new Error(`Found 2 different model definitions for model ${refName}: orig: ${JSON.stringify(origPositions)}, act: ${JSON.stringify(positions)}`);
      }
    }
  }

  public CheckExpressionUnicity(formattedRefName: string, refName: string) {
    if (!this.expressionOrigNameMap[formattedRefName]) {
      this.expressionOrigNameMap[formattedRefName] = refName;
    } else {
      if (this.expressionOrigNameMap[formattedRefName] !== refName) {
        throw new Error(`Found 2 different type expressions for formatted name "${formattedRefName}": orig: "${this.expressionOrigNameMap[formattedRefName]}", act: "${refName}"`);
      }
    }
  }

  private buildControllers() {
    if (this.controllerNodes.length === 0) {
      throw new Error('no controllers found, check tsoa configuration');
    }
    return this.controllerNodes
      .map(classDeclaration => new ControllerGenerator(classDeclaration, this, this.rootSecurity))
      .filter(generator => generator.IsValid())
      .map(generator => generator.Generate());
  }
}
