import { MetadataGenerator } from '@iffa/tsoa-cli/metadataGeneration/metadataGenerator';
import { SpecGenerator3 } from '@iffa/tsoa-cli/swagger/specGenerator3';
import { Swagger } from '@iffa/tsoa-runtime';
import { expect } from 'chai';
import 'mocha';
import { getDefaultExtendedOptions } from '../../fixtures/defaultOptions';

describe('Types the checker evaluates', () => {
  const metadata = new MetadataGenerator('./fixtures/controllers/checkedTypesController.ts', { strict: true }).Generate();
  const spec = new SpecGenerator3(metadata, { ...getDefaultExtendedOptions(), noImplicitAdditionalProperties: 'throw-on-extras' }).GetSpec();
  const schemas = spec.components.schemas!;
  type Schema = Swagger.Schema3 | Swagger.Schema31;
  const resolve = (schema: Schema | undefined): Schema => (schema?.$ref ? resolve(schemas[schema.$ref.replace('#/components/schemas/', '')]) : schema!);
  const response = (path: string) => resolve(spec.paths[`/CheckedTypes/${path}`].get!.responses['200'].content!['application/json'].schema);
  const body = (path: string) => resolve(spec.paths[`/CheckedTypes/${path}`].post!.requestBody!.content['application/json'].schema);

  it('resolves typeof a const object', () => {
    const config = response('TypeofConst');
    expect(config.properties!.mode).to.deep.include({ type: 'string', enum: ['a'] });
    expect(config.properties!.retries).to.deep.include({ type: 'number', enum: [3] });
  });

  it('resolves an indexed access by an enum member or a union of keys', () => {
    expect(response('IndexedByEnum').properties).to.have.all.keys('foo');
    expect(response('IndexedByUnion').properties!.value.anyOf).to.deep.equal([{ type: 'string' }, { type: 'number', format: 'double' }]);
  });

  it('resolves intrinsic string types and template literals', () => {
    const properties = response('StringTypes').properties!;
    expect(resolve(properties.shout)).to.deep.include({ type: 'string', enum: ['ABC', 'DEF'] });
    expect(resolve(properties.id)).to.deep.include({ type: 'string' });
  });

  it('resolves the keys and values of a const object', () => {
    const properties = response('KeysAndValues').properties!;
    expect(resolve(properties.role)).to.deep.include({ type: 'string', enum: ['admin', 'user'] });
    expect(resolve(properties.value)).to.deep.include({ type: 'number', enum: [1, 2] });
  });

  it('keeps the alias of a property through Omit', () => {
    expect(response('Omit').properties!.id).to.deep.include({ $ref: '#/components/schemas/UUID' });
    expect(schemas.UUID).to.deep.include({ type: 'string', pattern: '^[0-9a-f-]{36}$' });
  });

  it('resolves z.input and z.output, aliased or written inline', () => {
    const input = body('ZodInputOutput');
    const output = resolve(spec.paths['/CheckedTypes/ZodInputOutput'].post!.responses['200'].content!['application/json'].schema);
    expect(input.required).to.deep.equal(['email']);
    expect(output.required).to.have.members(['email', 'plan']);
    expect(body('ZodInputInline')).to.deep.equal(input);
  });

  it('describes a zod object key with its JSDoc', () => {
    expect(body('ZodInfer').properties!.email).to.deep.include({ type: 'string', description: 'Where the confirmation goes' });
  });

  it('writes the extras setting on an object literal, but not on an intersection member', () => {
    expect(body('ZodInfer').additionalProperties).to.equal(false);
    const intersection = response('Intersection');
    expect(intersection.allOf).to.have.length(2);
    expect(intersection.allOf!.every(member => !('additionalProperties' in member))).to.equal(true);
  });

  it('gives each instantiation with a template literal argument its own name', () => {
    const properties = response('GenericNames').properties!;
    expect([properties.user.$ref, properties.org.$ref, properties.numbered.$ref]).to.deep.equal([
      '#/components/schemas/Labeled_user__string__',
      '#/components/schemas/Labeled_org__string__',
      '#/components/schemas/Labeled_user__number__',
    ]);
  });

  it('names computed keys by their value and leaves out symbol keys', () => {
    expect(response('ComputedKeys').properties).to.have.all.keys('fromConst', 'literal-key', 'id');
  });

  it('resolves ReadonlyArray as an array', () => {
    const properties = response('ReadonlyArray').properties!;
    expect(properties.labels).to.deep.include({ type: 'array', items: { $ref: '#/components/schemas/Labeled_string_' } });
    expect(properties.names).to.deep.include({ type: 'array', items: { type: 'string' } });
  });

  it('resolves a project class named like a built-in as a model', () => {
    expect(body('OwnReadable')).to.deep.include({ type: 'object', description: 'Not the stream class' });
  });

  it('refuses a Set or a Map, which have no JSON form', () => {
    expect(() => new MetadataGenerator('./fixtures/controllers/setResponseController.ts').Generate()).to.throw(/Set has no JSON form.*Use an array instead/);
    expect(() => new MetadataGenerator('./fixtures/controllers/mapResponseController.ts').Generate()).to.throw(/Map has no JSON form.*Use a Record instead/);
  });
});
