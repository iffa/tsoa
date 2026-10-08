import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';
import { inlineTypeExpressions } from '@tsoa/cli/swagger/inlineTypeExpressions';
import { SpecGenerator3 } from '@tsoa/cli/swagger/specGenerator3';
import { SpecGenerator31 } from '@tsoa/cli/swagger/specGenerator31';
import { expect } from 'chai';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('Application schema names', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/resolvedTypeController.ts', { strict: true }).Generate();

  for (const Generator of [SpecGenerator3, SpecGenerator31]) {
    it(`resolves utility expressions inside named contracts for ${Generator.name}`, () => {
      const source = new Generator(metadata, getDefaultExtendedOptions()).GetSpec();
      const clean = inlineTypeExpressions(source, metadata);
      const schemas = clean.components.schemas!;
      expect(schemas.StoredState.enum).to.deep.equal(['accepted', 'dismissed']);
      expect(schemas.SelectedState.enum).to.deep.equal(['accepted', 'dismissed']);
      expect(schemas.SelectedFilter.properties!.limit.minimum).to.equal(1);
      expect(schemas.ResolvedPayload.properties!.state.$ref).to.equal('#/components/schemas/StoredState');
      expect(schemas.ResolvedPayload.properties!.dictionary.additionalProperties).to.deep.equal({ not: {} });
      expect(Object.keys(schemas)).not.to.include('Record_string.never_');
      expect(source.components.schemas!).to.have.property('Record_string.never_');
      expect(schemas.StoredState.description).not.to.equal('Exclude from T those types that are assignable to U');
      expect(schemas.InferredStatus.enum).to.deep.equal(['active', 'disabled']);
      expect(schemas.InferredRequest.properties!.status.enum).to.deep.equal(['active', 'disabled']);
      expect(schemas.InferredRequest.description).to.equal('A named inferred request.');
      expect(schemas.StatusPage.properties!.items.items).to.deep.equal({ $ref: '#/components/schemas/InferredRequest' });
      expect(schemas.ResolvedPayload.properties!.page.$ref).to.equal('#/components/schemas/StatusPage');
      expect(schemas.OtherStatusPage.properties).to.deep.equal(schemas.StatusPage.properties);
      expect(schemas.RequestTree.properties!.children.items).to.deep.equal({ $ref: '#/components/schemas/RequestTree' });
      expect(schemas.ResolvedPayload.properties!.statePage.properties!.items.items).to.deep.equal({ $ref: '#/components/schemas/State' });
      expect(schemas.ResolvedPayload.properties!.statePage.description).to.equal('Paginated application data.');
    });
  }

  it('resolves properties named like schema annotations without rewriting example data', () => {
    const source = new SpecGenerator3(metadata, getDefaultExtendedOptions()).GetSpec();
    const utility = Object.values(metadata.referenceTypeMap).find(type => type.isUtility && type.refName.startsWith('Exclude_'))!;
    const ref = { $ref: `#/components/schemas/${utility.refName}` };
    source.components.schemas!.PropertyNames = {
      type: 'object',
      properties: { default: ref, example: ref, 'x-value': ref },
      example: { ...ref },
      default: { ...ref },
      'x-example': { ...ref },
    };
    const clean = inlineTypeExpressions(source, metadata).components.schemas!.PropertyNames;
    expect(clean.properties!.default.$ref).to.equal('#/components/schemas/StoredState');
    expect(clean.properties!.example.$ref).to.equal('#/components/schemas/StoredState');
    expect(clean.properties!['x-value'].$ref).to.equal('#/components/schemas/StoredState');
    expect(clean.example).to.deep.equal(ref);
    expect(clean.default).to.deep.equal(ref);
    expect(clean['x-example']).to.deep.equal(ref);
  });
});
