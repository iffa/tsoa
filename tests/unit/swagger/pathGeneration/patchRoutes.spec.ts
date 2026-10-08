import 'mocha';
import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';
import { SpecGenerator3 } from '@tsoa/cli/swagger/specGenerator3';
import { getDefaultExtendedOptions } from '../../../fixtures/defaultOptions';
import { VerifyPathableParameter } from '../../utilities/verifyParameter';
import { expect } from 'chai';
import { defaultModelName, VerifyPath } from '../../utilities/verifyPath';
import { Swagger } from '@tsoa/runtime';

describe('PATCH route generation', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/patchController.ts').Generate();
  const spec = new SpecGenerator3(metadata, getDefaultExtendedOptions()).GetSpec();
  const baseRoute = '/PatchTest';

  it('should generate a path for a PATCH route with no path argument', () => {
    verifyPath(baseRoute);
  });

  it('should generate a path for a PATCH route with a path argument', () => {
    const actionRoute = `${baseRoute}/Location`;
    verifyPath(actionRoute);
  });

  it('should set a valid response type for collection responses', () => {
    const actionRoute = `${baseRoute}/Multi`;
    verifyPath(actionRoute, true);
  });

  const getValidatedParameters = (actionRoute: string): Array<Swagger.Parameter3 | Swagger.Parameter31> => {
    const path = verifyPath(actionRoute);
    if (!path.patch) {
      throw new Error('No patch operation.');
    }
    if (!path.patch.parameters) {
      throw new Error('No parameters');
    }

    return path.patch.parameters;
  };

  it('should generate a parameter for path parameters', () => {
    const actionRoute = `${baseRoute}/WithId/{id}`;
    const parameters = getValidatedParameters(actionRoute);

    VerifyPathableParameter(parameters, 'id', 'number', 'path', 'double');
  });

  it('should generate a parameter for body parameters', () => {
    expect(spec.paths[baseRoute].patch!.requestBody!.content['application/json'].schema!.$ref).to.equal(defaultModelName);
  });

  function verifyPath(route: string, isCollection?: boolean) {
    return VerifyPath(spec, route, path => path.patch, isCollection);
  }
});
