import { expect } from 'chai';
import { Swagger } from '@tsoa/runtime';

export const defaultModelName = '#/components/schemas/TestModel';

export function VerifyPath(
  spec: Swagger.Spec3,
  route: string,
  getOperation: (path: Swagger.Path3 | Swagger.Path31) => Swagger.Operation3 | Swagger.Operation31 | undefined,
  isCollection?: boolean,
  isNoContent?: boolean,
  givenModelName?: string,
) {
  const modelName = givenModelName || defaultModelName;
  const path = spec.paths[route];
  expect(path, `Path object for ${route} route wasn't generated.`).to.exist;

  const operation = getOperation(path);
  if (!operation) {
    throw new Error(`Method for ${route} route wasn't generated.`);
  }
  if (!operation.responses) {
    throw new Error(`Response object for ${route} route wasn't generated.`);
  }

  if (isNoContent) {
    const successResponse = operation.responses['204'];
    expect(successResponse, `204 response for ${route} route wasn't generated.`).to.exist;
    return path;
  }

  const successResponse = operation.responses['200'];
  expect(successResponse, `200 response for ${route} route wasn't generated.`).to.exist;

  const schema = successResponse.content?.['application/json']?.schema;
  if (!schema) {
    throw new Error(`Schema for 200 response ${route} route wasn't generated.`);
  }

  if (isCollection) {
    expect(schema.type).to.equal('array');
    expect((schema.items as Swagger.Schema3)?.$ref).to.equal(modelName);
  } else {
    expect(schema.$ref).to.equal(modelName);
  }

  return path;
}
