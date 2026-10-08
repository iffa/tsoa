import { Swagger, Tsoa } from '@tsoa/runtime';
import { GenerateMetadataError } from '../metadataGeneration/exceptions';

/** Resolve compiler utility types inside the application models that use them. */
export function inlineUtilitySchemas<T extends Swagger.Spec>(spec: T, metadata: Tsoa.Metadata): T {
  const utilities = new Set(
    Object.values(metadata.referenceTypeMap)
      .filter(type => type.isUtility)
      .map(type => type.refName),
  );
  if (utilities.size === 0) {
    return spec;
  }

  const root = spec as T & { components?: { schemas?: Record<string, unknown> } };
  const schemas = root.components?.schemas;
  if (!schemas) {
    return spec;
  }
  const prefix = '#/components/schemas/';
  const resolved = new Map<string, Record<string, unknown>>();
  const resolving = new Set<string>();

  function resolveUtility(name: string): Record<string, unknown> {
    const cached = resolved.get(name);
    if (cached) {
      return cached;
    }
    if (resolving.has(name)) {
      throw new GenerateMetadataError(`Circular compiler utility schema '${name}'.`);
    }
    const schema = schemas![name];
    if (!isObject(schema)) {
      throw new GenerateMetadataError(`Missing compiler utility schema '${name}'.`);
    }
    resolving.add(name);
    const shape = { ...schema };
    delete shape.description;
    const result = visit(shape);
    resolving.delete(name);
    resolved.set(name, result);
    return result;
  }

  function visit(value: Record<string, unknown>, isMap = false): Record<string, unknown> {
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
      if (utilities.has(name)) {
        const annotations = { ...transformed };
        delete annotations.$ref;
        return { ...resolveUtility(name), ...annotations };
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

  const cleanSchemas = Object.fromEntries(Object.entries(schemas).filter(([name]) => !utilities.has(name)));
  const cleanSpec = { ...root, components: { ...root.components, schemas: cleanSchemas } };
  return transform(cleanSpec) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
