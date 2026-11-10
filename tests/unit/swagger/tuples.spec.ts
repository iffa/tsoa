import { ExtendedSpecConfig } from '@iffa/tsoa-cli/cli';
import { MetadataGenerator } from '@iffa/tsoa-cli/metadataGeneration/metadataGenerator';
import { DefaultRouteGenerator } from '@iffa/tsoa-cli/routeGeneration/defaultRouteGenerator';
import { SpecGenerator3 } from '@iffa/tsoa-cli/swagger/specGenerator3';
import { SpecGenerator31 } from '@iffa/tsoa-cli/swagger/specGenerator31';
import { FieldErrors, TsoaRoute, ValidationService } from '@iffa/tsoa-runtime';
import { expect } from 'chai';
import 'mocha';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('Tuples', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/tupleController.ts').Generate();
  const options: ExtendedSpecConfig = { ...getDefaultExtendedOptions(), specVersion: 3.1 };

  describe('OpenAPI 3.1', () => {
    const schemas = new SpecGenerator31(metadata, options).GetSpec().components.schemas!;
    const properties = schemas.TupleModel.properties!;

    it('requires only the elements before the first optional one', () => {
      expect(properties.optional).to.deep.include({ type: 'array', minItems: 1, maxItems: 2, items: false });
      expect(properties.namedOptional).to.deep.include({ type: 'array', minItems: 1, maxItems: 2, items: false });
      expect(properties.pair).to.deep.include({ minItems: 2, maxItems: 2 });
    });

    it('validates the items after the prefix against the rest type', () => {
      expect(properties.rest).to.deep.include({ prefixItems: [{ $ref: '#/components/schemas/Locale' }], minItems: 1, items: { $ref: '#/components/schemas/Locale' } });
      expect(properties.namedRest).to.deep.include({ prefixItems: [{ type: 'string' }], minItems: 1, items: { type: 'number', format: 'double' } });
      expect(properties.namedRest).to.not.have.property('maxItems');
    });
  });

  it('is refused by OpenAPI 3.0', () => {
    expect(() => new SpecGenerator3(metadata, { ...options, specVersion: 3 }).GetSpec()).to.throw(/Tuple types are only supported in OpenAPI 3.1/);
  });

  describe('runtime validation', () => {
    const models = new DefaultRouteGenerator(metadata, { entryFile: '', routesDir: '', noImplicitAdditionalProperties: 'silently-remove-extras', bodyCoercion: false }).buildModels();
    const property = (name: string): TsoaRoute.PropertySchema => {
      const model = models.TupleModel;
      if (model.dataType !== 'refObject') {
        throw new Error('TupleModel should be a refObject');
      }
      return model.properties[name];
    };
    const validate = (name: string, value: unknown) => {
      const fieldErrors: FieldErrors = {};
      const result = new ValidationService(models, { noImplicitAdditionalProperties: 'silently-remove-extras', bodyCoercion: false }).ValidateParam(
        property(name),
        value,
        name,
        fieldErrors,
        true,
        'body.',
      );
      return { result, fieldErrors };
    };

    it('accepts a value of each tuple form', () => {
      expect(validate('pair', ['a', 1])).to.deep.equal({ result: ['a', 1], fieldErrors: {} });
      expect(validate('optional', ['a'])).to.deep.equal({ result: ['a'], fieldErrors: {} });
      expect(validate('rest', ['fi', 'en', 'fi'])).to.deep.equal({ result: ['fi', 'en', 'fi'], fieldErrors: {} });
      expect(validate('namedRest', ['a'])).to.deep.equal({ result: ['a'], fieldErrors: {} });
    });

    it('rejects a value shorter than the required elements', () => {
      expect(validate('pair', ['a']).fieldErrors).to.deep.equal({ 'body.pair': { message: 'minItems 2', value: ['a'] } });
      expect(validate('rest', []).fieldErrors['body.rest'].message).to.equal('minItems 1');
    });

    it('rejects extra items when there is no rest element', () => {
      expect(validate('optional', ['a', 1, 2]).fieldErrors['body.optional'].message).to.equal('maxItems 2');
    });

    it('reports an invalid item under its index', () => {
      expect(validate('pair', [1, 'a']).fieldErrors).to.have.all.keys('body.pair.$0', 'body.pair.$1');
      expect(validate('rest', ['fi', 'sv']).fieldErrors).to.have.all.keys('body.rest.$1');
    });

    it('removes extras from object items', () => {
      expect(
        validate('nested', [
          { id: 1, extra: true },
          { id: 2, extra: true },
        ]).result,
      ).to.deep.equal([{ id: 1 }, { id: 2 }]);
    });

    it('rejects a non-array body value without coercion', () => {
      expect(validate('pair', 'a').fieldErrors['body.pair'].message).to.equal('invalid array');
    });
  });
});
