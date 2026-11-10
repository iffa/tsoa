import { MetadataGenerator } from '@iffa/tsoa-cli/metadataGeneration/metadataGenerator';
import { expect } from 'chai';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import 'mocha';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CompilerOptions } from 'typescript';

describe('tsconfig resolution', () => {
  let projectDir: string;

  const controller = (returnType: string, imports = '') => `
    ${imports}
    const decorator = (..._args: unknown[]) => (..._target: unknown[]) => undefined;
    const Route = decorator;
    const Get = decorator;
    @Route('widgets')
    export class WidgetController {
      @Get()
      public async get(): Promise<${returnType}> {
        return undefined as never;
      }
    }
  `;

  const write = (relativePath: string, content: string) => {
    const file = join(projectDir, relativePath);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    return file;
  };

  const generate = (overrides?: CompilerOptions) => {
    const entryFile = join(projectDir, 'controller.ts');
    const tsconfigPath = MetadataGenerator.resolveTsconfigPath(entryFile);
    return new MetadataGenerator(entryFile, { experimentalDecorators: true, ...overrides }, undefined, undefined, [], 'double', tsconfigPath).Generate();
  };

  beforeEach(() => {
    projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'tsoa-tsconfig-')));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('accepts a solution-style tsconfig with an empty files list', () => {
    write('controller.ts', controller('string'));
    write('tsconfig.json', JSON.stringify({ files: [], references: [] }));

    expect(generate().controllers).to.have.length(1);
  });

  it('accepts a tsconfig whose include matches nothing', () => {
    write('controller.ts', controller('string'));
    write('tsconfig.json', JSON.stringify({ include: ['missing/**/*'] }));

    expect(generate().controllers).to.have.length(1);
  });

  it('still reports an invalid option', () => {
    write('controller.ts', controller('string'));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { moduleResolution: 'typo' } }));

    expect(() => generate()).to.throw(/moduleResolution/);
  });

  it('resolves types from the tsconfig directory when the working directory is elsewhere', () => {
    write('controller.ts', controller('GlobalWidget'));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { types: ['widget'] }, include: ['controller.ts'] }));
    write('node_modules/@types/widget/index.d.ts', 'interface GlobalWidget { name: string }');

    expect(generate().referenceTypeMap).to.have.property('GlobalWidget');
  });

  it('resolves override paths from the working directory, not the tsconfig', () => {
    write('controller.ts', controller('Widget', "import type { Widget } from 'alias';"));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { unrelated: ['./unrelated.ts'] } }, include: ['controller.ts'] }));
    write('nested/widget.ts', 'export interface Widget { name: string }');
    const workingDir = process.cwd();
    process.chdir(join(projectDir, 'nested'));

    try {
      expect(generate({ paths: { alias: ['./widget.ts'] } }).referenceTypeMap).to.have.property('Widget');
    } finally {
      process.chdir(workingDir);
    }
  });

  it('looks for the tsconfig in the working directory when there is no entry file', () => {
    write('tsconfig.json', '{}');
    const workingDir = process.cwd();
    process.chdir(projectDir);
    try {
      expect(MetadataGenerator.resolveTsconfigPath('')).to.equal(join(projectDir, 'tsconfig.json'));
      expect(MetadataGenerator.resolveTsconfigPath(undefined)).to.equal(join(projectDir, 'tsconfig.json'));
    } finally {
      process.chdir(workingDir);
    }
  });
});
