import { ExtendedSpecConfig } from '@iffa/tsoa-cli/cli';
import { MetadataGenerator } from '@iffa/tsoa-cli/metadataGeneration/metadataGenerator';
import { SpecGenerator31 } from '@iffa/tsoa-cli/swagger/specGenerator31';
import { expect } from 'chai';
import 'mocha';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('OpenAPI 3.1 null types', () => {
  const options: ExtendedSpecConfig = { ...getDefaultExtendedOptions(), specVersion: 3.1 };

  const keyPaths = (value: unknown, key: string, path = ''): string[] => {
    if (typeof value !== 'object' || value === null) {
      return [];
    }
    return Object.entries(value).flatMap(([name, child]) => [...(name === key ? [`${path}/${name}`] : []), ...keyPaths(child, key, `${path}/${name}`)]);
  };

  it('writes no nullable keyword', () => {
    for (const controller of ['getController', 'postController31']) {
      const spec = new SpecGenerator31(new MetadataGenerator(`./fixtures/controllers/${controller}.ts`).Generate(), options).GetSpec();

      expect(keyPaths(spec, 'nullable'), controller).to.deep.equal([]);
    }
  });

  it('adds null to the type of a nullable parameter and keeps its validators', () => {
    const spec = new SpecGenerator31(new MetadataGenerator('./fixtures/controllers/nullableParametersController.ts').Generate(), options).GetSpec();
    const parameters = Object.fromEntries((spec.paths['/NullableParameters'].get?.parameters ?? []).map(parameter => [parameter.name, parameter.schema]));

    expect(parameters.search).to.deep.include({ type: ['string', 'null'], minLength: 2 });
    expect(parameters.order).to.deep.include({ anyOf: [{ $ref: '#/components/schemas/Ordering' }, { type: 'null' }] });
    expect(parameters.limit).to.deep.include({ type: ['number', 'null'], format: 'double' });
  });
});
