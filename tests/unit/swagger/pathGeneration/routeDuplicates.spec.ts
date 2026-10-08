import { expect } from 'chai';
import { MetadataGenerator } from '@tsoa/cli/metadataGeneration/metadataGenerator';

describe('Duplicate route diagnostics', () => {
  it('rejects identical routes with both source locations', () => {
    expect(() => new MetadataGenerator('./fixtures/controllers/duplicateMethodsController.ts').Generate()).to.throw(
      /Duplicate route GET \/gettest\/complex:[\s\S]*duplicateMethodsController.ts:\d+[\s\S]*DuplicateMethodsTestController.getModel[\s\S]*DuplicateMethodsTestController.duplicateGetModel/,
    );
  });

  it('rejects equivalent parameter routes', () => {
    expect(() => new MetadataGenerator('./fixtures/controllers/duplicatePathParamController.ts').Generate()).to.throw(
      /Duplicate route GET \/gettest\/\{\}:[\s\S]*getPathParamTest[\s\S]*getPathParamTest2/,
    );
  });

  it('rejects equivalent paths across controllers and different path syntax', () => {
    expect(() => new MetadataGenerator('./fixtures/route-ordering/duplicateController.ts').Generate()).to.throw(
      /Duplicate route GET \/duplicate\/\{\}:[\s\S]*FirstDuplicateController.get[\s\S]*SecondDuplicateController.get/,
    );
  });
});
