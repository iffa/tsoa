import * as ts from 'typescript';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists.bind(ts.sys), 'tsconfig.json')!;
const config = ts.readConfigFile(configPath, ts.sys.readFile.bind(ts.sys));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const routes = globSync('fixtures/**/routes.ts').map(file => resolve(file));
if (routes.length === 0) {
  throw new Error('No generated route fixtures found. Run prepare-test first.');
}
const host = ts.createCompilerHost(parsed.options);
const readFile = host.readFile.bind(host);
const generated = new Set(routes);
host.readFile = file => {
  const source = readFile(file);
  return source && generated.has(resolve(file)) ? source.replace(/^\/\/ @ts-nocheck\r?\n/, '') : source;
};
const program = ts.createProgram(routes, { ...parsed.options, noEmit: true }, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: file => file,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
}
