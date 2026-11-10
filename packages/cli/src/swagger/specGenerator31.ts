import { Swagger, Tsoa } from '@iffa/tsoa-runtime';
import { merge as mergeAnything } from 'merge-anything';
import { merge as deepMerge } from 'ts-deepmerge';

import { ExtendedSpecConfig } from '../cli';
import { UnspecifiedObject } from '../utils/unspecifiedObject';
import { shouldIncludeValidatorInSchema } from '../utils/validatorUtils';
import { ValidatorSchema } from './specGenerator';
import { SpecGenerator3 } from './specGenerator3';

/**
 * OpenAPI 3.1 Spec Generator
 *
 * Reuses SpecGenerator3 and overrides what 3.1 writes differently:
 * - tuples as prefixItems
 * - null as a type
 * - exclusive bounds as numbers
 */
export class SpecGenerator31 extends SpecGenerator3 {
  constructor(
    protected readonly metadata: Tsoa.Metadata,
    protected readonly config: ExtendedSpecConfig,
  ) {
    super(metadata, config);
  }

  // Override with OpenAPI 3.1 specific return type
  // The base class returns Swagger.Spec30, but this generator produces Swagger.Spec31
  public override GetSpec(): Swagger.Spec31 {
    let spec: Swagger.Spec31 = {
      openapi: '3.1.0',
      components: this.buildComponents() as Swagger.Components31,
      info: this.buildInfo(),
      paths: this.buildPaths() as { [name: string]: Swagger.Path31 },
      servers: this.buildServers(),
      tags: this.config.tags,
    };

    if (this.config.spec) {
      this.config.specMerging = this.config.specMerging || 'immediate';
      const mergeFuncs: { [key: string]: (spec: UnspecifiedObject, merge: UnspecifiedObject) => UnspecifiedObject } = {
        immediate: Object.assign,
        recursive: mergeAnything,
        deepmerge: (spec: UnspecifiedObject, merge: UnspecifiedObject): UnspecifiedObject => deepMerge(spec, merge),
      };

      spec = mergeFuncs[this.config.specMerging](spec as unknown as UnspecifiedObject, this.config.spec as UnspecifiedObject) as unknown as Swagger.Spec31;
    }

    return spec;
  }

  protected override get specVersionName(): string {
    return 'OpenAPI 3.1';
  }

  /**
   * OpenAPI 3.1 follows JSON Schema 2020-12, where an exclusive bound is a number rather
   * than a boolean modifier on minimum/maximum, so the validators pass straight through and
   * an inclusive and an exclusive bound can sit side by side.
   */
  protected override buildValidatorSchema(validators: Tsoa.Validators): ValidatorSchema {
    const schema: Record<string, unknown> = {};

    for (const key of Object.keys(validators).filter(shouldIncludeValidatorInSchema)) {
      schema[key] = validators[key]!.value;
    }

    return schema;
  }

  /**
   * Override to add tuple type support (OpenAPI 3.1 feature via prefixItems)
   */
  protected getSwaggerType(type: Tsoa.Type, title?: string): Swagger.BaseSchema {
    if (this.isTupleType(type)) {
      const prefixItems: Swagger.Schema31[] = type.types.map((t: Tsoa.Type) => this.getSwaggerType(t) as Swagger.Schema31);

      const schema: Swagger.Schema31 = {
        type: 'array',
        prefixItems,
        minItems: type.minItems ?? prefixItems.length,
        ...(type.restType
          ? {
              items: this.getSwaggerType(type.restType) as Swagger.Schema31,
            }
          : {
              maxItems: prefixItems.length,
              items: false,
            }),
      };

      return schema as unknown as Swagger.Schema3;
    }

    return super.getSwaggerType(type, title);
  }

  /**
   * OpenAPI 3.1 has no `nullable`. Null is a JSON Schema type, so a nullable union is built from its
   * other members and then given null as a type. The shared 3.0 code types a schema's `type` as one
   * string, so these overrides return their 3.1 schemas through a cast.
   */
  protected override getSwaggerTypeForUnionType(type: Tsoa.UnionType, title?: string): Swagger.BaseSchema | Swagger.Schema3 {
    const nonNullTypes = type.types.filter(member => !this.isNull(member));
    if (nonNullTypes.length === type.types.length) {
      return super.getSwaggerTypeForUnionType(type, title);
    }
    const schema = nonNullTypes.every(member => member.dataType === 'undefined')
      ? { ...(title && { title }), type: 'null' as const }
      : this.withNull(super.getSwaggerTypeForUnionType({ ...type, types: nonNullTypes }, title));
    return schema as unknown as Swagger.Schema3;
  }

  protected override getSwaggerTypeForEnumType(enumType: Tsoa.EnumType, title?: string): Swagger.Schema3 {
    const nonNullEnums = enumType.enums.filter(member => member !== null);
    if (nonNullEnums.length === 0) {
      return { ...(title && { title }), type: 'null' } as unknown as Swagger.Schema3;
    }
    const schema = super.getSwaggerTypeForEnumType({ ...enumType, enums: nonNullEnums }, title);
    delete schema.nullable;
    return nonNullEnums.length === enumType.enums.length ? schema : (this.withNull(schema) as unknown as Swagger.Schema3);
  }

  protected override buildParameter(source: Tsoa.Parameter): Swagger.Parameter3 {
    if (source.type.dataType !== 'union' || !source.type.types.some(member => this.isNull(member))) {
      return super.buildParameter(source);
    }
    const parameter = super.buildParameter({ ...source, type: { ...source.type, types: source.type.types.filter(member => !this.isNull(member)) } });
    return { ...parameter, schema: this.withNull(parameter.schema) as unknown as Swagger.Schema3 };
  }

  /** Adds null to a schema: to its type when it has a single one, otherwise as an alternative. */
  private withNull(schema: Swagger.BaseSchema): Swagger.Schema31 {
    const { title, ...rest } = schema as Swagger.Schema31;
    if (typeof rest.type === 'string' && !rest.$ref) {
      return { ...(title && { title }), ...rest, type: [rest.type, 'null'], ...(rest.enum && { enum: [...rest.enum, null] }) };
    }
    if (rest.anyOf && Object.keys(rest).length === 1) {
      return { ...(title && { title }), anyOf: [...rest.anyOf, { type: 'null' }] };
    }
    return { ...(title && { title }), anyOf: [rest, { type: 'null' }] };
  }

  private isTupleType(type: Tsoa.Type): type is Tsoa.TupleType {
    return type.dataType === 'tuple';
  }
}
