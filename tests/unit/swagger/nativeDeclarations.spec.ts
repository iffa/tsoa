import { MetadataGenerator } from '@iffa/tsoa-cli/metadataGeneration/metadataGenerator';
import { createNativeDeclarationHost, stubMethodBodies } from '@iffa/tsoa-cli/metadataGeneration/nativeDeclarations';
import { expect } from 'chai';
import 'mocha';
import { resolve } from 'path';

describe('native declarations', () => {
  describe('stubMethodBodies', () => {
    const declarations = `export declare class C { list(): Promise<Item[]>; other(): Promise<import("./other").Other>; }`;
    const source = `import { helper } from './helper';
import { Item } from './item';

export class C {
  @Get()
  public async list() {
    return helper();
  }

  @Get('other')
  @Middlewares(auth(), limit)
  public async other() {
    return helper();
  }
}
`;

    it('takes return types from the declarations and drops the bodies and the imports only they used', () => {
      const stubbed = stubMethodBodies('c.ts', source, declarations)!;

      expect(stubbed).to.include('list(): Promise<Item[]>');
      expect(stubbed).to.include("import { Item } from './item'");
      expect(stubbed).not.to.include('helper');
    });

    it('imports a type the declarations reached through import()', () => {
      const stubbed = stubMethodBodies('c.ts', source, declarations)!;

      expect(stubbed).to.include('import type { Other } from "./other"');
      expect(stubbed).to.include('other(): Promise<Other>');
    });

    it('drops middleware arguments', () => {
      const stubbed = stubMethodBodies('c.ts', source, declarations)!;

      expect(stubbed).to.include('@Middlewares()');
      expect(stubbed).not.to.include('auth');
    });

    it('keeps every method on its original line', () => {
      const multiLine = 'export declare class C { list(): Promise<{\n  a: Item;\n}>; other(): Promise<Item>; }';
      const stubbed = stubMethodBodies('c.ts', source, multiLine)!;
      const lineOf = (text: string, needle: string) => text.slice(0, text.indexOf(needle)).split('\n').length;

      expect(lineOf(stubbed, 'other(')).to.equal(lineOf(source, 'other('));
    });

    it('leaves the file alone when an imported type name is already taken', () => {
      const taken = source.replace("import { Item } from './item';", "import { Item, Other } from './item';");

      expect(stubMethodBodies('c.ts', taken, declarations)).to.equal(undefined);
    });

    it('leaves the file alone when the declarations have no type for a public method', () => {
      expect(stubMethodBodies('c.ts', source, 'export declare class C {}')).to.equal(undefined);
    });
  });

  describe('generation', () => {
    const fixtures = resolve(import.meta.dirname, '../../fixtures/native-declarations');
    const controller = resolve(fixtures, 'nativeController.ts');
    const tsconfig = resolve(import.meta.dirname, '../../tsconfig.json');
    const generate = () => new MetadataGenerator(controller, undefined, undefined, undefined, [], 'double', tsconfig).Generate();

    const withoutNative = <T>(run: () => T) => {
      process.env.TSOA_NATIVE = 'off';
      try {
        return run();
      } finally {
        delete process.env.TSOA_NATIVE;
      }
    };

    it('produces the same metadata as reading the sources', () => {
      expect(generate()).to.deep.equal(withoutNative(generate));
    }).timeout(30_000);

    it('serves declarations and never reads a module only method bodies import', () => {
      const host = createNativeDeclarationHost([controller], { experimentalDecorators: true }, undefined, tsconfig)!;
      const read = (name: string) => host.getSourceFile(resolve(fixtures, name), 99)?.text ?? '';

      expect(read('service.ts')).to.include('export declare function makeThing');
      expect(read('nativeController.ts')).not.to.include('onlyInBody');
    }).timeout(30_000);

    it('keeps the source of a constant that a decorator or parameter default reads, and of what that constant reads', () => {
      const host = createNativeDeclarationHost([controller], { experimentalDecorators: true }, undefined, tsconfig)!;
      const read = (name: string) => host.getSourceFile(resolve(fixtures, name), 99)?.text ?? '';

      expect(read('constants.ts')).to.include('= BASE_LIMIT');
      expect(read('baseLimit.ts')).to.include('= 25');
    }).timeout(30_000);

    it('reads sources when turned off', () => {
      expect(withoutNative(() => createNativeDeclarationHost([controller], {}, undefined, tsconfig))).to.equal(undefined);
    });
  });
});
