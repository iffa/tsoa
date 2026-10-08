import { validateRoutesConfig, validateSpecConfig } from '@tsoa/cli/cli';
import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';
import { fsWriteFileIfChanged } from '@tsoa/cli/utils/fs';
import { Config } from '@tsoa/runtime';
import { expect } from 'chai';
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Generation defaults', () => {
  function configuration(): Config {
    return { entryFile: 'tsoa.json', spec: { outputDirectory: 'dist' }, routes: { routesDir: 'dist' } };
  }

  it('defaults to Express, ESM, strict bodies, trimmed extra properties, and stable output files', async () => {
    const config = configuration();
    const spec = await validateSpecConfig(config);
    const routes = await validateRoutesConfig(config);
    expect(spec.specVersion).to.equal(3);
    expect(routes).to.include({ middleware: 'express', esm: true, bodyCoercion: false, noImplicitAdditionalProperties: 'silently-remove-extras', noWriteIfUnchanged: true });
  });

  it('reports invalid configuration values', async () => {
    const config = configuration();
    Object.assign(config, { noImplicitAdditionalProperties: 'remove' });
    try {
      await validateRoutesConfig(config);
      expect.fail('Expected invalid configuration to fail');
    } catch (error) {
      expect((error as Error).message).to.include('Invalid noImplicitAdditionalProperties');
    }
  });

  it('keeps existing files untouched when content is identical and writes new content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tsoa-output-'));
    const file = join(directory, 'openapi.json');
    try {
      await fsWriteFileIfChanged(file, '{}');
      await utimes(file, 1, 1);
      await fsWriteFileIfChanged(file, '{}');
      expect((await stat(file)).mtimeMs).to.equal(1000);
      await fsWriteFileIfChanged(file, '{"openapi":"3.0.0"}');
      expect(await readFile(file, 'utf8')).to.equal('{"openapi":"3.0.0"}');
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it('reports unreadable and malformed tsconfig files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tsoa-config-'));
    const file = join(directory, 'tsconfig.json');
    try {
      expect(() => new MetadataGenerator('fixtures/controllers/getController.ts', undefined, undefined, undefined, [], undefined, file)).to.throw(/Cannot read file/);
      await writeFile(file, '{"compilerOptions":');
      expect(() => new MetadataGenerator('fixtures/controllers/getController.ts', undefined, undefined, undefined, [], undefined, file)).to.throw();
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
