import { ExtendedSpecConfig } from '@tsoa/cli/cli';
import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';
import { SpecGenerator2 } from '@tsoa/cli/swagger/specGenerator2';
import { SpecGenerator3 } from '@tsoa/cli/swagger/specGenerator3';
import { SpecGenerator31 } from '@tsoa/cli/swagger/specGenerator31';
import { expect } from 'chai';
import 'mocha';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('@exclusiveMinimum and @exclusiveMaximum', () => {
  const options: ExtendedSpecConfig = getDefaultExtendedOptions();
  const metadata = new MetadataGenerator('./fixtures/controllers/validateController.ts').Generate();
  const conflicting = () => new MetadataGenerator('./fixtures/controllers/invalidExclusiveBoundsController.ts').Generate();

  const propertiesOf = (schema: any) => schema.properties;

  describe('Swagger 2.0', () => {
    const properties = propertiesOf(new SpecGenerator2(metadata, options).GetSpec().definitions!.ExclusiveBoundsModel);

    it('writes an exclusive bound as a boolean modifier on the inclusive one', () => {
      expect(properties.intAbove5).to.deep.include({ minimum: 5, exclusiveMinimum: true });
      expect(properties.floatBelow10).to.deep.include({ maximum: 10, exclusiveMaximum: true });
    });

    it('keeps an inclusive bound on the opposite side', () => {
      expect(properties.ratio).to.deep.include({ minimum: 0, maximum: 1, exclusiveMaximum: true });
    });

    it('refuses an inclusive and an exclusive bound on the same side', () => {
      expect(() => new SpecGenerator2(conflicting(), options).GetSpec()).to.throw(/uses both @minimum and @exclusiveMinimum/);
    });
  });

  describe('OpenAPI 3.0', () => {
    const properties = propertiesOf((new SpecGenerator3(metadata, options).GetSpec().components as any).schemas.ExclusiveBoundsModel);

    it('writes an exclusive bound as a boolean modifier on the inclusive one', () => {
      expect(properties.intAbove5).to.deep.include({ minimum: 5, exclusiveMinimum: true });
      expect(properties.floatBelow10).to.deep.include({ maximum: 10, exclusiveMaximum: true });
    });

    it('refuses an inclusive and an exclusive bound on the same side', () => {
      expect(() => new SpecGenerator3(conflicting(), options).GetSpec()).to.throw(/uses both @minimum and @exclusiveMinimum/);
    });
  });

  describe('OpenAPI 3.1', () => {
    const options31: ExtendedSpecConfig = { ...options, specVersion: 3.1 };
    const properties = propertiesOf((new SpecGenerator31(metadata, options31).GetSpec().components as any).schemas.ExclusiveBoundsModel);

    it('writes an exclusive bound as the bound itself', () => {
      expect(properties.intAbove5).to.deep.include({ exclusiveMinimum: 5 });
      expect(properties.intAbove5).to.not.have.property('minimum');
      expect(properties.floatBelow10).to.deep.include({ exclusiveMaximum: 10 });
      expect(properties.floatBelow10).to.not.have.property('maximum');
    });

    it('accepts an inclusive and an exclusive bound on the same side', () => {
      const properties31 = propertiesOf((new SpecGenerator31(conflicting(), options31).GetSpec().components as any).schemas.ConflictingBounds);
      expect(properties31.count).to.deep.include({ minimum: 1, exclusiveMinimum: 2 });
    });
  });
});
