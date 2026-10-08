import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';
import { DefaultRouteGenerator } from '@tsoa/cli/routeGeneration/defaultRouteGenerator';
import { SpecGenerator3 } from '@tsoa/cli/swagger/specGenerator3';
import { FieldErrors, Swagger, TsoaRoute, ValidationService } from '@tsoa/runtime';
import { expect } from 'chai';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('Resolved request contracts', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/resolvedTypeController.ts', { strict: true }).Generate();
  const spec = new SpecGenerator3(metadata, getDefaultExtendedOptions()).GetSpec();
  const models = new DefaultRouteGenerator(metadata, {
    entryFile: '',
    routesDir: '.',
    bodyCoercion: false,
    noImplicitAdditionalProperties: 'silently-remove-extras',
  }).buildModels();
  const service = new ValidationService(models, { bodyCoercion: false, noImplicitAdditionalProperties: 'silently-remove-extras' });

  function resolve(schema: Swagger.Schema3 | Swagger.Schema31): Swagger.Schema3 | Swagger.Schema31 {
    if (!schema.$ref) {
      return schema;
    }
    return resolve(spec.components.schemas![schema.$ref.replace('#/components/schemas/', '')]);
  }

  const validPayload = {
    state: 'accepted',
    selected: 'dismissed',
    actor: { type: 'user', userId: '123' },
    credential: 'RFID',
    aliasedCredential: 'PIN',
  };

  it('resolves named conditional aliases to finite schemas and validates their selected members', () => {
    const properties = spec.components.schemas!.ResolvedPayload.properties!;
    expect(resolve(properties.state).enum).to.deep.equal(['accepted', 'dismissed']);
    expect(resolve(properties.selected).enum).to.deep.equal(['accepted', 'dismissed']);
    const errors: FieldErrors = {};
    const result = service.ValidateParam({ ref: 'ResolvedPayload' }, { ...validPayload }, 'body', errors, true);
    expect(errors).to.deep.equal({});
    expect(result).to.deep.equal({ ...validPayload, timezone: 'Europe/Helsinki', lockType: 'EL402', enabled: false, offset: 0, description: '' });

    const invalid: FieldErrors = {};
    service.ValidateParam({ ref: 'ResolvedPayload' }, { ...validPayload, state: 'new', actor: { type: 'company', companyId: '123' } }, 'body', invalid, true);
    expect(invalid).to.have.keys('body.state', 'body.actor');
  });

  it('unwraps query aliases and preserves property validators', () => {
    const parameters = spec.paths['/ResolvedTypes'].get!.parameters!;
    expect(parameters.map(parameter => parameter.name)).to.have.members(['search', 'limit', 'state']);
    expect(parameters.find(parameter => parameter.name === 'limit')!.schema.minimum).to.equal(1);
    const queryType = metadata.controllers[0].methods.find(method => method.name === 'list')!.parameters[0].type;
    expect(queryType.dataType).to.equal('nestedObjectLiteral');
  });

  it('simplifies intersections with unknown while retaining literal constraints', () => {
    const properties = spec.components.schemas!.ResolvedPayload.properties!;
    expect(resolve(properties.credential).enum).to.deep.equal(['RFID', 'PIN']);
    expect(resolve(properties.aliasedCredential).enum).to.deep.equal(['RFID', 'PIN']);
    const errors: FieldErrors = {};
    service.ValidateParam({ ref: 'ResolvedPayload' }, { ...validPayload, credential: 'other' }, 'body', errors, true);
    expect(errors).to.have.keys('body.credential');
  });

  it('allows an omitted never property and rejects it when supplied', () => {
    expect(spec.components.schemas!.ResolvedPayload.properties!.forbidden.not).to.deep.equal({});
    const errors: FieldErrors = {};
    service.ValidateParam({ ref: 'ResolvedPayload' }, { ...validPayload, forbidden: 'supplied' }, 'body', errors, true);
    expect(errors['body.forbidden'].message).to.equal('value is not allowed');
  });

  it('rejects a required never value', () => {
    const schema: TsoaRoute.PropertySchema = { dataType: 'never', required: true };
    for (const value of [undefined, null, false, 'value']) {
      const errors: FieldErrors = {};
      service.ValidateParam(schema, value, 'value', errors, true);
      expect(errors).to.have.keys('value');
    }
  });

  it('rejects entries in a dictionary whose value type is never', () => {
    const errors: FieldErrors = {};
    const schema: TsoaRoute.PropertySchema = { ref: 'Record_string.never_' };
    expect(service.ValidateParam(schema, {}, 'dictionary', errors, true)).to.deep.equal({});
    expect(errors).to.deep.equal({});
    expect(service.ValidateParam(schema, { forbidden: 1 }, 'dictionary', errors, true)).to.equal(undefined);
    expect(errors).to.have.keys('dictionary.forbidden');
  });

  it('retains mapped fields inside optional union members', () => {
    const errors: FieldErrors = {};
    const payload = { ...validPayload, nestedRecord: { value: { id: '123' } }, nestedOmit: { value: { b: 'kept' } } };
    const result = service.ValidateParam({ ref: 'ResolvedPayload' }, payload, 'body', errors, true);
    expect(errors).to.deep.equal({});
    expect(result.nestedRecord).to.deep.equal(payload.nestedRecord);
    expect(result.nestedOmit).to.deep.equal(payload.nestedOmit);
    const invalid: FieldErrors = {};
    service.ValidateParam({ ref: 'ResolvedPayload' }, { ...validPayload, nestedRecord: { value: {} } }, 'body', invalid, true);
    expect(invalid).to.have.keys('body.nestedRecord.value');
    expect(invalid['body.nestedRecord.value'].message).to.include("'id' is required");
  });
});
