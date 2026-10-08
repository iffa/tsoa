import { Swagger, Tsoa } from '@tsoa/runtime';
import { GenerateMetadataError } from '../metadataGeneration/exceptions';

/** Resolve instantiated type expressions inside the application models that use them. */
export function inlineTypeExpressions<T extends Swagger.Spec>(spec: T, metadata: Tsoa.Metadata): T {
  const expressions = new Set(
    Object.values(metadata.referenceTypeMap)
      .filter(type => type.isUtility || type.isTypeExpression)
      .map(type => type.refName),
  );
  if (expressions.size === 0) {
    return spec;
  }

  const root = spec as T & { components?: { schemas?: Record<string, unknown> } };
  const schemas = root.components?.schemas;
  if (!schemas) {
    return spec;
  }
  const prefix = '#/components/schemas/';
  const namedOwners = new Map<string, string>();
  for (const [name, schema] of Object.entries(schemas)) {
    if (!expressions.has(name) && isObject(schema) && typeof schema.$ref === 'string' && schema.$ref.startsWith(prefix)) {
      const target = schema.$ref.slice(prefix.length);
      if (expressions.has(target) && !namedOwners.has(target)) {
        namedOwners.set(target, name);
      }
    }
  }
  const resolved = new Map<string, Record<string, unknown>>();
  const resolving = new Set<string>();

  function resolveExpression(name: string): Record<string, unknown> {
    const cached = resolved.get(name);
    if (cached) {
      return cached;
    }
    if (resolving.has(name)) {
      throw new GenerateMetadataError(`Circular type expression schema '${name}'.`);
    }
    const schema = schemas![name];
    if (!isObject(schema)) {
      throw new GenerateMetadataError(`Missing type expression schema '${name}'.`);
    }
    resolving.add(name);
    const shape = { ...schema };
    if (metadata.referenceTypeMap[name]?.isUtility) {
      delete shape.description;
    }
    const result = visit(shape, false, name);
    resolving.delete(name);
    resolved.set(name, result);
    return result;
  }

  function visit(value: Record<string, unknown>, isMap = false, owner?: string): Record<string, unknown> {
    const transformed = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        !isMap && (key === 'example' || key === 'examples' || key === 'default' || key.startsWith('x-'))
          ? child
          : transform(child, !isMap && ['properties', 'schemas', 'definitions', '$defs', 'patternProperties', 'dependentSchemas'].includes(key)),
      ]),
    );
    const ref = transformed.$ref;
    if (typeof ref === 'string' && ref.startsWith(prefix)) {
      const name = decodeURIComponent(ref.slice(prefix.length)).replace(/~1/g, '/').replace(/~0/g, '~');
      if (expressions.has(name)) {
        const annotations = Object.fromEntries(Object.entries(transformed).filter(([key, value]) => key !== '$ref' && value !== undefined));
        const namedOwner = namedOwners.get(name);
        if (namedOwner && owner === undefined) {
          return { $ref: `${prefix}${namedOwner}`, ...annotations };
        }
        return { ...resolveExpression(name), ...annotations };
      }
    }
    return transformed;
  }

  function transform(value: unknown, isMap = false): unknown {
    if (Array.isArray(value)) {
      return value.map(child => transform(child));
    }
    return isObject(value) ? visit(value, isMap) : value;
  }

  const cleanSchemas = Object.fromEntries(
    Object.entries(schemas)
      .filter(([name]) => !expressions.has(name))
      .map(([name, schema]) => [name, isObject(schema) ? visit(schema, false, name) : schema]),
  );
  const cleanSpec = { ...root, components: { ...root.components, schemas: cleanSchemas } };
  return transform(cleanSpec) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
