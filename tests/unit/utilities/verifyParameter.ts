import { expect } from 'chai';
import { Swagger } from '@tsoa/runtime';

type Parameters = Array<Swagger.Parameter3 | Swagger.Parameter31>;

function schemaOf(params: Parameters, name: string, location: string) {
  const parameter = params.find(param => param.name === name);
  expect(parameter, `Parameter '${name}' wasn't generated.`).to.exist;
  expect(parameter!.in).to.equal(location);
  return parameter!.schema;
}

export function VerifyPathableParameter(params: Parameters, name: string, type: string, location: string, format?: string) {
  const schema = schemaOf(params, name, location);
  expect(schema.type).to.equal(type);
  if (format) expect(schema.format).to.equal(format);
}

export function VerifyPathableStringParameter(params: Parameters, name: string, type: string, location: string, min?: number, max?: number, pattern?: string) {
  const schema = schemaOf(params, name, location);
  expect(schema.type).to.equal(type);
  if (min !== undefined) expect(schema.minLength).to.equal(min);
  if (max !== undefined) expect(schema.maxLength).to.equal(max);
  if (pattern) expect(schema.pattern).to.equal(pattern);
}

export function VerifyPathableNumberParameter(params: Parameters, name: string, type: string, location: string, format?: string, min?: number, max?: number) {
  const schema = schemaOf(params, name, location);
  expect(schema.type).to.equal(type);
  if (format) expect(schema.format).to.equal(format);
  if (min !== undefined) expect(schema.minimum).to.equal(min);
  if (max !== undefined) expect(schema.maximum).to.equal(max);
}
