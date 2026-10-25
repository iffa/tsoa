import { expect } from 'chai';
import 'mocha';
import { MetadataGenerator } from '@iffa/tsoa-cli/metadataGeneration/metadataGenerator';
import { SpecGenerator3 } from '@iffa/tsoa-cli/swagger/specGenerator3';
import { SpecGenerator31 } from '@iffa/tsoa-cli/swagger/specGenerator31';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('falsy @example values', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/falsyExampleController.ts').Generate();

  for (const [version, Generator] of [
    ['3.0', SpecGenerator3],
    ['3.1', SpecGenerator31],
  ] as const) {
    it(`keeps them in OpenAPI ${version} schemas`, () => {
      const schemas = new Generator(metadata, getDefaultExtendedOptions()).GetSpec().components.schemas!;

      expect(schemas['SkipNumber'].example).to.eq(0);
      expect(schemas['Flag'].example).to.eq(false);
      expect(schemas['Note'].example).to.eq('');
      expect(schemas['Level'].example).to.eq(0);
      expect(schemas['NullNote'].example).to.eq(null);
      expect(schemas['MergedCount'].example).to.eq(0);
    });
  }

  it('marks a type alias tagged @deprecated', () => {
    const schemas = new SpecGenerator3(metadata, getDefaultExtendedOptions()).GetSpec().components.schemas!;

    expect(schemas['OldFlag'].deprecated).to.eq(true);
    expect(schemas['Flag'].deprecated).to.eq(undefined);
  });
});
