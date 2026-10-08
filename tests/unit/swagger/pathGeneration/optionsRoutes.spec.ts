import 'mocha';
import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';
import { SpecGenerator3 } from '@tsoa/cli/swagger/specGenerator3';
import { getDefaultExtendedOptions } from 'fixtures/defaultOptions';
import { VerifyPath } from 'unit/utilities/verifyPath';

describe('OPTIONS route generation', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/optionsController.ts').Generate();
  const spec = new SpecGenerator3(metadata, getDefaultExtendedOptions()).GetSpec();
  const baseRoute = '/OptionsTest';

  it('should generate a path fro a OPTIONS route with no path argument', () => {
    verifyPath(baseRoute, false, true);
  });

  it('should generate a path for a OPTIONS route with a path argument', () => {
    const actionRoute = `${baseRoute}/Current`;
    verifyPath(actionRoute, false, true);
  });

  function verifyPath(route: string, isCollection?: boolean, isNoContent?: boolean) {
    return VerifyPath(spec, route, path => path.options, isCollection, isNoContent);
  }
});
