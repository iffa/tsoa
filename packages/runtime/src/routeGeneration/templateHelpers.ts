import isInt from 'validator/lib/isInt.js';
import isISO8601 from 'validator/lib/isISO8601.js';
import matches from 'validator/lib/matches.js';
import { assertNever } from '../utils/assertNever';
import { AdditionalProps } from './additionalProps';
import { RefRecursionGuard } from './refRecursionGuard';
import { TsoaRoute, isDefaultForAdditionalPropertiesAllowed } from './tsoa-route';
import { Tsoa } from '../metadataGeneration/tsoa';
import ValidatorKey = Tsoa.ValidatorKey;

/**
 * validator's isFloat builds this expression on every call, and its toFloat then calls
 * isFloat again, which made two regular expression compilations the dominant cost of
 * validating a numeric parameter. The expression and the values it has to reject anyway are
 * lifted verbatim from validator so the accepted set is unchanged.
 */
const floatPattern = /^(?:[-+])?(?:[0-9]+)?(?:\.[0-9]*)?(?:[eE][+-]?(?:[0-9]+))?$/;
const notFloats = new Set(['', '.', ',', '-', '+']);

/**
 * The finite number a string denotes, or undefined when it denotes no usable number. The
 * expression accepts a few strings that hold no digits at all - 'e3', '.e1' - which
 * parseFloat turns into NaN, so the result has to be checked rather than trusted.
 */
function toFiniteNumber(value: string, parse: (value: string) => number): number | undefined {
  const parsed = parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFloatValue(value: string): number | undefined {
  if (notFloats.has(value) || !floatPattern.test(value)) {
    return undefined;
  }

  return toFiniteNumber(value, parseFloat);
}

/**
 * A model's property names, cached against the schema's `properties` object. The generated
 * routes declare that object once, so the name set behind it never changes, while validation
 * needs it for every object it walks.
 */
const propertyNames = new WeakMap<object, Set<string>>();

function propertyNamesOf(properties: { [name: string]: unknown }): Set<string> {
  let names = propertyNames.get(properties);

  if (!names) {
    names = new Set(Object.keys(properties));
    propertyNames.set(properties, names);
  }

  return names;
}

/**
 * A model's properties as an entry list, cached the same way, so walking them does not
 * rebuild the list per object.
 */
const propertyEntries = new WeakMap<object, Array<[string, TsoaRoute.PropertySchema]>>();

function propertyEntriesOf(properties: { [name: string]: TsoaRoute.PropertySchema }): Array<[string, TsoaRoute.PropertySchema]> {
  let entries = propertyEntries.get(properties);

  if (!entries) {
    entries = Object.entries(properties);
    propertyEntries.set(properties, entries);
  }

  return entries;
}

/** Whether any field failed, without building the array of keys to count it. */
function hasFieldErrors(fieldErrors: FieldErrors): boolean {
  for (const key in fieldErrors) {
    if (Object.prototype.hasOwnProperty.call(fieldErrors, key)) {
      return true;
    }
  }

  return false;
}

/** How many fields failed, without building the array of keys to count them. */
function countFieldErrors(fieldErrors: FieldErrors): number {
  let count = 0;

  for (const key in fieldErrors) {
    if (Object.prototype.hasOwnProperty.call(fieldErrors, key)) {
      count++;
    }
  }

  return count;
}

/**
 * Whether a model can reach itself, cached per model set. Only a model that can is able to
 * recurse, so only that one needs the guard ValidateParam keeps against circular values -
 * and the guard costs a string and two set operations at every reference it walks.
 */
const recursiveRefs = new WeakMap<object, Map<string, boolean>>();

function isRecursiveRef(models: TsoaRoute.Models, ref: string): boolean {
  let known = recursiveRefs.get(models);

  if (!known) {
    known = new Map();
    recursiveRefs.set(models, known);
  }

  const cached = known.get(ref);
  if (cached !== undefined) {
    return cached;
  }

  const recursive = canReachRef(models, ref, ref, new Set());
  known.set(ref, recursive);
  return recursive;
}

function canReachRef(models: TsoaRoute.Models, from: string, target: string, visited: Set<string>): boolean {
  if (visited.has(from)) {
    return false;
  }
  visited.add(from);

  const model = models[from];
  if (!model) {
    return false;
  }

  if (model.dataType === 'refEnum') {
    return false;
  }

  const schemas = model.dataType === 'refAlias' ? [model.type] : Object.values(model.properties);
  return schemas.some(schema => schemaReachesRef(models, schema, target, visited));
}

function schemaReachesRef(models: TsoaRoute.Models, schema: TsoaRoute.PropertySchema | boolean | undefined, target: string, visited: Set<string>): boolean {
  if (!schema || typeof schema === 'boolean') {
    return false;
  }

  if (schema.ref) {
    return schema.ref === target || canReachRef(models, schema.ref, target, visited);
  }

  const children: Array<TsoaRoute.PropertySchema | boolean | undefined> = [
    schema.array,
    schema.additionalProperties,
    ...(schema.subSchemas || []),
    ...Object.values(schema.nestedProperties || {}),
    ...(schema.tuple ? [...schema.tuple.items, schema.tuple.rest] : []),
  ];

  return children.some(child => schemaReachesRef(models, child, target, visited));
}

const PROTOTYPE_KEY = '__proto__';

function isBufferJson(value: unknown): value is { type: 'Buffer'; data: unknown } {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'Buffer' && 'data' in value;
}

function isByteArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

// Same identity semantics as an indexOf scan: NaN never matches, objects compare by reference.
function hasDuplicateItems(items: unknown[]): boolean {
  const seen = new Set<unknown>();
  for (const item of items) {
    if (Number.isNaN(item)) {
      continue;
    }
    if (seen.has(item)) {
      return true;
    }
    seen.add(item);
  }
  return false;
}

export class ValidationService {
  private readonly unionDiscriminators = new WeakMap<TsoaRoute.PropertySchema, { name: string; members: Map<string | number | boolean | null, TsoaRoute.PropertySchema> } | null>();

  constructor(
    private readonly models: TsoaRoute.Models,
    private readonly config: AdditionalProps,
    private readonly refRecursionGuard = new RefRecursionGuard(),
  ) {}

  public ValidateParam(property: TsoaRoute.PropertySchema, rawValue: any, name = '', fieldErrors: FieldErrors, isBodyParam: boolean, parent = '') {
    let value = rawValue;
    // If undefined is allowed type, we can move to value validation
    if (value === undefined && property.dataType !== 'undefined') {
      // If there's either default value or datatype is union with undefined valid, we can just set it and move to validation
      if (property.default !== undefined || (property.dataType === 'union' && property.subSchemas?.some(p => p.dataType === 'undefined'))) {
        value = property.default;
      } else if (property.required) {
        // If value can be typed as undefined, there's no need to check mandatoriness here.
        let message = `'${name}' is required`;
        if (property.validators) {
          const validators = property.validators;
          Object.keys(validators).forEach((key: string) => {
            const errorMsg = validators[key as ValidatorKey]?.errorMsg;
            if (key.startsWith('is') && errorMsg) {
              message = errorMsg;
            }
          });
        }
        fieldErrors[parent + name] = {
          message,
          value,
        };
        return;
      } else {
        return value;
      }
    }

    switch (property.dataType) {
      case 'string':
        return this.validateString(name, value, fieldErrors, property.validators as StringValidator, parent);
      case 'boolean':
        return this.validateBool(name, value, fieldErrors, isBodyParam, property.validators, parent);
      case 'integer':
      case 'long':
        return this.validateInt(name, value, fieldErrors, isBodyParam, property.validators as IntegerValidator, parent);
      case 'float':
      case 'double':
        return this.validateFloat(name, value, fieldErrors, isBodyParam, property.validators as FloatValidator, parent);
      case 'enum':
        return this.validateEnum(name, value, fieldErrors, property.enums, parent, isBodyParam);
      case 'array':
        return this.validateArray(name, value, fieldErrors, isBodyParam, property.array, property.validators as ArrayValidator, parent);
      case 'tuple':
        return this.validateTuple(name, value, fieldErrors, isBodyParam, property.tuple, parent);
      case 'date':
        return this.validateDate(name, value, fieldErrors, isBodyParam, property.validators as DateValidator, parent);
      case 'datetime':
        return this.validateDateTime(name, value, fieldErrors, isBodyParam, property.validators as DateTimeValidator, parent);
      case 'buffer':
        return this.validateBuffer(name, value, fieldErrors, parent);
      case 'union':
        return this.validateUnion(name, value, fieldErrors, isBodyParam, property, parent);
      case 'intersection':
        return this.validateIntersection(name, value, fieldErrors, isBodyParam, property.subSchemas, parent);
      case 'undefined':
        return this.validateUndefined(name, value, fieldErrors, parent);
      case 'never':
        fieldErrors[parent + name] = { message: 'value is not allowed', value };
        return;
      case 'any':
        return value;
      case 'nestedObjectLiteral':
        return this.validateNestedObjectLiteral(name, value, fieldErrors, isBodyParam, property.nestedProperties, property.additionalProperties, parent);
      default:
        if (property.ref) {
          const modelDefinition = this.models[property.ref];

          // Only a model that can reach itself is able to recurse, so the guard below is
          // skipped for the models that cannot.
          if (!isRecursiveRef(this.models, property.ref)) {
            return this.validateModel({ name, value, modelDefinition, fieldErrors, isBodyParam, parent });
          }

          if (!this.refRecursionGuard.enter(value, property.ref)) {
            fieldErrors[parent + name] = { message: `circular reference to '${property.ref}' cannot be validated` };
            return;
          }

          try {
            return this.validateModel({ name, value, modelDefinition, fieldErrors, isBodyParam, parent });
          } finally {
            this.refRecursionGuard.leave(value, property.ref);
          }
        }
        return value;
    }
  }

  public hasCorrectJsType(value: any, type: 'object' | 'boolean' | 'number' | 'string', isBodyParam: boolean) {
    return !isBodyParam || this.config.bodyCoercion || typeof value === type;
  }

  public validateNestedObjectLiteral(
    name: string,
    value: any,
    fieldErrors: FieldErrors,
    isBodyParam: boolean,
    nestedProperties: { [name: string]: TsoaRoute.PropertySchema } | undefined,
    additionalProperties: TsoaRoute.PropertySchema | boolean | undefined,
    parent: string,
  ) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fieldErrors[parent + name] = {
        message: `invalid object`,
        value,
      };
      return;
    }

    const previousErrors = countFieldErrors(fieldErrors);

    if (!nestedProperties) {
      throw new Error(
        'internal tsoa error: ' +
          'the metadata that was generated should have had nested property schemas since it’s for a nested object,' +
          'however it did not. ' +
          'Please file an issue with tsoa at https://github.com/lukeautry/tsoa/issues',
      );
    }

    const propHandling = this.config.noImplicitAdditionalProperties;
    if (propHandling !== 'ignore') {
      const excessProps = this.getExcessPropertiesFor({ dataType: 'refObject', properties: nestedProperties, additionalProperties }, Object.keys(value));
      if (excessProps.length > 0) {
        if (propHandling === 'silently-remove-extras') {
          excessProps.forEach(excessProp => {
            delete value[excessProp];
          });
        }
        if (propHandling === 'throw-on-extras') {
          fieldErrors[parent + name] = {
            message: `"${excessProps.join(',')}" is an excess property and therefore is not allowed`,
            value: excessProps.reduce((acc, propName) => ({ [propName]: value[propName], ...acc }), {}),
          };
        }
      }
    }

    const childPath = parent + name + '.';

    for (const [key, nestedProperty] of propertyEntriesOf(nestedProperties)) {
      const validatedProp = this.ValidateParam(nestedProperty, value[key], key, fieldErrors, isBodyParam, childPath);

      // Add value from validator if it's not undefined or if value is required and unfedined is valid type
      if (validatedProp !== undefined || (nestedProperty.dataType === 'undefined' && nestedProperty.required)) {
        value[key] = validatedProp;
      }
    }

    if (typeof additionalProperties === 'object' && typeof value === 'object') {
      // An own "__proto__" key was already rejected above, unless extras are ignored. Then it is validated like any other key.
      const keys = Object.keys(value).filter(key => !Object.hasOwn(nestedProperties, key) && (key !== PROTOTYPE_KEY || propHandling === 'ignore'));
      keys.forEach(key => {
        const validatedProp = this.ValidateParam(additionalProperties, value[key], key, fieldErrors, isBodyParam, childPath);
        // Add value from validator if it's not undefined or if value is required and unfedined is valid type
        if (validatedProp !== undefined || (additionalProperties.dataType === 'undefined' && additionalProperties.required)) {
          value[key] = validatedProp;
        }
      });
    }

    if (countFieldErrors(fieldErrors) > previousErrors) {
      return;
    }

    return value;
  }

  /**
   * The first numeric bound the value breaks, or undefined when it is within all of them.
   * `minimum`/`maximum` are inclusive; `exclusiveMinimum`/`exclusiveMaximum` are not.
   */
  private checkNumberBounds(numberValue: number, validators: IntegerValidator | FloatValidator): string | undefined {
    const bounds = [
      { validator: validators.minimum, broken: (bound: number) => bound > numberValue, message: (bound: number) => `min ${bound}` },
      { validator: validators.maximum, broken: (bound: number) => bound < numberValue, message: (bound: number) => `max ${bound}` },
      { validator: validators.exclusiveMinimum, broken: (bound: number) => bound >= numberValue, message: (bound: number) => `exclusiveMin ${bound}` },
      { validator: validators.exclusiveMaximum, broken: (bound: number) => bound <= numberValue, message: (bound: number) => `exclusiveMax ${bound}` },
    ];

    for (const bound of bounds) {
      if (bound.validator?.value !== undefined && bound.broken(bound.validator.value)) {
        return bound.validator.errorMsg || bound.message(bound.validator.value);
      }
    }

    return undefined;
  }

  public validateInt(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, validators?: IntegerValidator, parent = '') {
    const stringValue = String(value);
    const intValue = isInt(stringValue) ? toFiniteNumber(stringValue, text => parseInt(text, 10)) : undefined;
    if (!this.hasCorrectJsType(value, 'number', isBodyParam) || intValue === undefined) {
      let message = `invalid integer number`;
      if (validators) {
        if (validators.isInt && validators.isInt.errorMsg) {
          message = validators.isInt.errorMsg;
        }
        if (validators.isLong && validators.isLong.errorMsg) {
          message = validators.isLong.errorMsg;
        }
      }
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }

    const numberValue = intValue;
    if (!validators) {
      return numberValue;
    }

    const brokenBound = this.checkNumberBounds(numberValue, validators);
    if (brokenBound !== undefined) {
      fieldErrors[parent + name] = {
        message: brokenBound,
        value,
      };
      return;
    }

    return numberValue;
  }

  public validateFloat(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, validators?: FloatValidator, parent = '') {
    const stringValue = String(value);
    const floatValue = toFloatValue(stringValue);
    if (!this.hasCorrectJsType(value, 'number', isBodyParam) || floatValue === undefined) {
      let message = 'invalid float number';
      if (validators) {
        if (validators.isFloat && validators.isFloat.errorMsg) {
          message = validators.isFloat.errorMsg;
        }
        if (validators.isDouble && validators.isDouble.errorMsg) {
          message = validators.isDouble.errorMsg;
        }
      }
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }

    const numberValue = floatValue;
    if (!validators) {
      return numberValue;
    }

    const brokenBound = this.checkNumberBounds(numberValue, validators);
    if (brokenBound !== undefined) {
      fieldErrors[parent + name] = {
        message: brokenBound,
        value,
      };
      return;
    }

    return numberValue;
  }

  public validateEnum(
    name: string,
    value: unknown,
    fieldErrors: FieldErrors,
    members?: Array<string | number | boolean | null>,
    parent = '',
    isBodyParam = false,
  ): string | number | boolean | null | undefined {
    if (!members || members.length === 0) {
      fieldErrors[parent + name] = {
        message: 'no member',
        value,
      };
      return;
    }

    let enumMatchIndex = members.findIndex(member => member === value);
    if (enumMatchIndex === -1 && value !== null && value !== undefined && typeof value !== 'object' && (!isBodyParam || this.config.bodyCoercion)) {
      enumMatchIndex = members.findIndex(member => String(member) === String(value));
    }

    if (enumMatchIndex === -1) {
      const membersInQuotes = members.map(member => (typeof member === 'string' ? `'${member}'` : String(member)));
      fieldErrors[parent + name] = {
        message: `should be one of the following; [${membersInQuotes.join(',')}]`,
        value,
      };
      return;
    }

    return members[enumMatchIndex];
  }

  public validateDate(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, validators?: DateValidator, parent = '') {
    if (!this.hasCorrectJsType(value, 'string', isBodyParam) || !isISO8601(String(value), { strict: true })) {
      const message = validators && validators.isDate && validators.isDate.errorMsg ? validators.isDate.errorMsg : `invalid ISO 8601 date format, i.e. YYYY-MM-DD`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }

    const dateValue = new Date(String(value));
    if (!validators) {
      return dateValue;
    }
    if (validators.minDate && validators.minDate.value) {
      const minDate = new Date(validators.minDate.value);
      if (minDate.getTime() > dateValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.minDate.errorMsg || `minDate '${validators.minDate.value}'`,
          value,
        };
        return;
      }
    }
    if (validators.maxDate && validators.maxDate.value) {
      const maxDate = new Date(validators.maxDate.value);
      if (maxDate.getTime() < dateValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.maxDate.errorMsg || `maxDate '${validators.maxDate.value}'`,
          value,
        };
        return;
      }
    }
    return dateValue;
  }

  public validateDateTime(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, validators?: DateTimeValidator, parent = '') {
    if (!this.hasCorrectJsType(value, 'string', isBodyParam) || !isISO8601(String(value), { strict: true })) {
      const message = validators && validators.isDateTime && validators.isDateTime.errorMsg ? validators.isDateTime.errorMsg : `invalid ISO 8601 datetime format, i.e. YYYY-MM-DDTHH:mm:ss`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }

    const datetimeValue = new Date(String(value));
    if (!validators) {
      return datetimeValue;
    }
    if (validators.minDate && validators.minDate.value) {
      const minDate = new Date(validators.minDate.value);
      if (minDate.getTime() > datetimeValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.minDate.errorMsg || `minDate '${validators.minDate.value}'`,
          value,
        };
        return;
      }
    }
    if (validators.maxDate && validators.maxDate.value) {
      const maxDate = new Date(validators.maxDate.value);
      if (maxDate.getTime() < datetimeValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.maxDate.errorMsg || `maxDate '${validators.maxDate.value}'`,
          value,
        };
        return;
      }
    }
    return datetimeValue;
  }

  public validateString(name: string, value: any, fieldErrors: FieldErrors, validators?: StringValidator, parent = '') {
    if (typeof value !== 'string') {
      const message = validators && validators.isString && validators.isString.errorMsg ? validators.isString.errorMsg : `invalid string value`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }

    const stringValue = String(value);
    if (!validators) {
      return stringValue;
    }
    if (validators.minLength && validators.minLength.value !== undefined) {
      if (validators.minLength.value > stringValue.length) {
        fieldErrors[parent + name] = {
          message: validators.minLength.errorMsg || `minLength ${validators.minLength.value}`,
          value,
        };
        return;
      }
    }
    if (validators.maxLength && validators.maxLength.value !== undefined) {
      if (validators.maxLength.value < stringValue.length) {
        fieldErrors[parent + name] = {
          message: validators.maxLength.errorMsg || `maxLength ${validators.maxLength.value}`,
          value,
        };
        return;
      }
    }
    if (validators.pattern && validators.pattern.value) {
      if (!matches(String(stringValue), validators.pattern.value)) {
        fieldErrors[parent + name] = {
          message: validators.pattern.errorMsg || `Not match in '${validators.pattern.value}'`,
          value,
        };
        return;
      }
    }
    return stringValue;
  }

  public validateBool(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, validators?: BooleanValidator, parent = '') {
    if (value === true || value === false) {
      return value;
    }

    if (!isBodyParam || this.config.bodyCoercion === true) {
      if (String(value).toLowerCase() === 'true') {
        return true;
      }
      if (String(value).toLowerCase() === 'false') {
        return false;
      }
    }

    const message = validators && validators.isBoolean && validators.isBoolean.errorMsg ? validators.isBoolean.errorMsg : `invalid boolean value`;
    fieldErrors[parent + name] = {
      message,
      value,
    };
    return;
  }

  public validateUndefined(name: string, value: any, fieldErrors: FieldErrors, parent = '') {
    if (value === undefined) {
      return undefined;
    }

    const message = 'invalid undefined value';
    fieldErrors[parent + name] = {
      message,
      value,
    };
    return;
  }

  public validateArray(name: string, value: any[], fieldErrors: FieldErrors, isBodyParam: boolean, schema?: TsoaRoute.PropertySchema, validators?: ArrayValidator, parent = '') {
    if ((isBodyParam && this.config.bodyCoercion === false && !Array.isArray(value)) || !schema || value === undefined) {
      const message = validators && validators.isArray && validators.isArray.errorMsg ? validators.isArray.errorMsg : `invalid array`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }

    // Counted before the elements are validated, so an oversized array is rejected without processing it.
    const itemCount = Array.isArray(value) ? value.length : 1;
    if (validators?.minItems?.value !== undefined && validators.minItems.value > itemCount) {
      fieldErrors[parent + name] = {
        message: validators.minItems.errorMsg || `minItems ${validators.minItems.value}`,
        value,
      };
      return;
    }
    if (validators?.maxItems?.value !== undefined && validators.maxItems.value < itemCount) {
      fieldErrors[parent + name] = {
        message: validators.maxItems.errorMsg || `maxItems ${validators.maxItems.value}`,
        value,
      };
      return;
    }

    const previousErrors = countFieldErrors(fieldErrors);
    const childPath = parent + name + '.';
    const arrayValue: unknown[] = Array.isArray(value)
      ? value.map((elementValue, index) => this.ValidateParam(schema, elementValue, `$${index}`, fieldErrors, isBodyParam, childPath))
      : [this.ValidateParam(schema, value, '$0', fieldErrors, isBodyParam, childPath)];

    if (countFieldErrors(fieldErrors) > previousErrors) {
      return;
    }

    if (validators?.uniqueItems && hasDuplicateItems(arrayValue)) {
      fieldErrors[parent + name] = {
        message: validators.uniqueItems.errorMsg || `required unique array`,
        value,
      };
      return;
    }
    return arrayValue;
  }

  /** Validates each item against the schema for its position, with the same coercion as an array. */
  public validateTuple(name: string, value: unknown, fieldErrors: FieldErrors, isBodyParam: boolean, tuple: TsoaRoute.TupleSchema | undefined, parent = ''): unknown[] | undefined {
    if (!tuple) {
      throw new Error('internal tsoa error: the generated metadata of a tuple has no item schemas. Please file an issue with tsoa at https://github.com/iffa/tsoa/issues');
    }
    if (value === undefined || (isBodyParam && this.config.bodyCoercion === false && !Array.isArray(value))) {
      fieldErrors[parent + name] = { message: 'invalid array', value };
      return;
    }

    const items: unknown[] = Array.isArray(value) ? value : [value];
    const minItems = tuple.minItems ?? tuple.items.length;
    if (items.length < minItems) {
      fieldErrors[parent + name] = { message: `minItems ${minItems}`, value };
      return;
    }
    if (!tuple.rest && items.length > tuple.items.length) {
      fieldErrors[parent + name] = { message: `maxItems ${tuple.items.length}`, value };
      return;
    }

    const previousErrors = countFieldErrors(fieldErrors);
    const childPath = parent + name + '.';
    const validated: unknown[] = items.map((item, index) => this.ValidateParam(tuple.items[index] ?? tuple.rest!, item, `$${index}`, fieldErrors, isBodyParam, childPath));

    return countFieldErrors(fieldErrors) > previousErrors ? undefined : validated;
  }

  public validateBuffer(name: string, value: unknown, fieldErrors: FieldErrors, parent = '') {
    if (typeof value === 'string' || Buffer.isBuffer(value)) {
      return Buffer.from(value);
    }
    // Buffer#toJSON produces { type: 'Buffer', data: [...] }
    const bytes = isBufferJson(value) ? value.data : value;
    if (isByteArray(bytes)) {
      return Buffer.from(bytes);
    }
    fieldErrors[parent + name] = {
      message: 'invalid buffer value',
      value,
    };
    return;
  }

  public validateUnion(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, property: TsoaRoute.PropertySchema, parent = ''): any {
    if (!property.subSchemas) {
      throw new Error(
        'internal tsoa error: ' +
          'the metadata that was generated should have had sub schemas since it’s for a union, however it did not. ' +
          'Please file an issue with tsoa at https://github.com/lukeautry/tsoa/issues',
      );
    }

    // A declared null, directly or through aliases and nested unions, wins over coercive
    // members: `boolean | null` would otherwise coerce null to false.
    if (value === null && this.hasExplicitNull(property)) {
      return null;
    }

    // The union's own validators have to reach each member, but a union rarely carries any,
    // and without them the merged schema is the member itself.
    const unionValidators = property.validators && Object.keys(property.validators).length > 0 ? property.validators : undefined;
    const withUnionValidators = (subSchema: TsoaRoute.PropertySchema) => (unionValidators ? { ...subSchema, validators: { ...unionValidators, ...subSchema.validators } } : subSchema);

    const discriminator = this.getUnionDiscriminator(property);
    if (discriminator && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Every member requires the tag, so the tag alone decides the member, or the error.
      const tag = Object.hasOwn(value, discriminator.name) ? value[discriminator.name] : undefined;
      if (tag === undefined) {
        fieldErrors[parent + name + '.' + discriminator.name] = { message: `'${discriminator.name}' is required` };
        return;
      }
      let selected = discriminator.members.get(tag);
      if (!selected) {
        // Reports an unknown tag, or finds the member of a coerced tag.
        const coerced = this.validateEnum(discriminator.name, tag, fieldErrors, [...discriminator.members.keys()], parent + name + '.', isBodyParam);
        selected = coerced === undefined ? undefined : discriminator.members.get(coerced);
      }
      return selected && this.ValidateParam(withUnionValidators(selected), this.cloneForBranch(value), name, fieldErrors, isBodyParam, parent);
    }

    const subFieldErrors: FieldErrors[] = [];
    const propertyCount = this.countRetainedProperties(value, value);
    let best: { value: any; retained: number } | undefined;

    for (const subSchema of property.subSchemas) {
      const subFieldError: FieldErrors = {};

      // Clean value if it's not undefined or use undefined directly if it's undefined.
      // Value can be undefined if undefined is allowed datatype of the union
      const validateableValue = value !== undefined ? this.cloneForBranch(value) : value;
      const cleanValue = this.ValidateParam(withUnionValidators(subSchema), validateableValue, name, subFieldError, isBodyParam, parent);
      subFieldErrors.push(subFieldError);

      if (hasFieldErrors(subFieldError)) {
        continue;
      }

      // A member that keeps every property of the value is as good as it gets, so stop.
      // Otherwise keep looking: `Partial<A | B>` distributes into members that TypeScript
      // may order narrowest first, and matching that one silently drops the properties only
      // the wider member declares.
      const retained = this.countRetainedProperties(value, cleanValue);
      if (retained === propertyCount) {
        return cleanValue;
      }
      if (!best || retained > best.retained) {
        best = { value: cleanValue, retained };
      }
    }

    if (best) {
      return best.value;
    }

    this.addSummarizedError(fieldErrors, parent + name, 'Could not match the union against any of the items. Issues: ', subFieldErrors, value);
    return;
  }

  private getUnionDiscriminator(property: TsoaRoute.PropertySchema) {
    const cached = this.unionDiscriminators.get(property);
    if (cached !== undefined) {
      return cached;
    }
    const schemas = property.subSchemas || [];
    const properties = schemas.map(schema => this.getUnionMemberProperties(schema));
    const first = properties[0];
    if (schemas.length > 1 && first && properties.every(props => props !== undefined)) {
      for (const name of Object.keys(first)) {
        const members = new Map<string | number | boolean | null, TsoaRoute.PropertySchema>();
        const tagsEveryMember = properties.every((props, index) => {
          const candidate = props?.[name];
          const tags = candidate?.required ? this.getLiteralMembers(candidate) : undefined;
          if (!tags?.length || tags.some(tag => members.has(tag))) {
            return false;
          }
          tags.forEach(tag => members.set(tag, schemas[index]));
          return true;
        });
        if (tagsEveryMember) {
          const discriminator = { name, members };
          this.unionDiscriminators.set(property, discriminator);
          return discriminator;
        }
      }
    }
    this.unionDiscriminators.set(property, null);
    return null;
  }

  private getUnionMemberProperties(schema: TsoaRoute.PropertySchema): Record<string, TsoaRoute.PropertySchema> | undefined {
    if (schema.ref) {
      const model = this.models[schema.ref];
      if (model?.dataType === 'refObject') {
        return model.properties;
      }
      if (model?.dataType === 'refAlias') {
        return this.getUnionMemberProperties(model.type);
      }
    }
    if (schema.dataType === 'intersection') {
      const properties = schema.subSchemas?.map(member => this.getUnionMemberProperties(member));
      return properties?.every(props => props !== undefined) ? Object.assign({}, ...properties) : undefined;
    }
    return schema.nestedProperties;
  }

  private getLiteralMembers(schema: TsoaRoute.PropertySchema): Array<string | number | boolean | null> | undefined {
    if (schema.ref) {
      const model = this.models[schema.ref];
      if (model?.dataType === 'refEnum') {
        return model.enums;
      }
      if (model?.dataType === 'refAlias') {
        return this.getLiteralMembers(model.type);
      }
    }
    return schema.enums;
  }

  /**
   * Whether the union declares null itself, through nested unions or through alias
   * references. Visiting each schema once stops recursive aliases.
   */
  private hasExplicitNull(property: TsoaRoute.PropertySchema): boolean {
    const reachable = new Set([property]);

    for (const schema of reachable) {
      if (schema.dataType === 'enum' && schema.enums?.includes(null)) {
        return true;
      }
      if (schema.dataType === 'union') {
        for (const subSchema of schema.subSchemas ?? []) {
          reachable.add(subSchema);
        }
      } else if (schema.ref) {
        const model = this.models[schema.ref];
        if (model?.dataType === 'refAlias') {
          reachable.add(model.type);
        }
      }
    }

    return false;
  }

  /**
   * How many of the value's own properties survived validation against a union member.
   */
  private countRetainedProperties(value: unknown, cleanValue: unknown): number {
    if (value === null || typeof value !== 'object' || cleanValue === null || typeof cleanValue !== 'object') {
      return 0;
    }

    return Object.entries(value).reduce((retained, [key, child]) => {
      if (!Object.prototype.hasOwnProperty.call(cleanValue, key)) {
        return retained;
      }
      return retained + 1 + this.countRetainedProperties(child, (cleanValue as Record<string, unknown>)[key]);
    }, 0);
  }

  public validateIntersection(name: string, value: any, fieldErrors: FieldErrors, isBodyParam: boolean, subSchemas: TsoaRoute.PropertySchema[] | undefined, parent = ''): any {
    if (!subSchemas) {
      throw new Error(
        'internal tsoa error: ' +
          'the metadata that was generated should have had sub schemas since it’s for a intersection, however it did not. ' +
          'Please file an issue with tsoa at https://github.com/lukeautry/tsoa/issues',
      );
    }

    const subFieldErrors: FieldErrors[] = [];
    let cleanValues = {};

    subSchemas.forEach(subSchema => {
      const subFieldError: FieldErrors = {};
      const cleanValue = this.createChildValidationService({
        noImplicitAdditionalProperties: 'silently-remove-extras',
      }).ValidateParam(subSchema, this.cloneForBranch(value), name, subFieldError, isBodyParam, parent);
      cleanValues = {
        ...cleanValues,
        ...cleanValue,
      };
      subFieldErrors.push(subFieldError);
    });

    const filtered = subFieldErrors.filter(hasFieldErrors);

    if (filtered.length > 0) {
      this.addSummarizedError(fieldErrors, parent + name, 'Could not match the intersection against every type. Issues: ', filtered, value);
      return;
    }

    const schemas = this.selfIntersectionCombinations(subSchemas.map(subSchema => this.toModelLike(subSchema)));

    const getRequiredPropError = (schema: TsoaRoute.ModelSchema) => {
      const requiredPropError = {};
      this.createChildValidationService({
        noImplicitAdditionalProperties: 'ignore',
      }).validateModel({
        name,
        value: this.cloneForBranch(value),
        modelDefinition: schema,
        fieldErrors: requiredPropError,
        isBodyParam,
      });
      return requiredPropError;
    };

    const schemasWithRequiredProps = schemas.filter(schema => Object.keys(getRequiredPropError(schema)).length === 0);

    if (this.config.noImplicitAdditionalProperties === 'ignore') {
      return { ...value, ...cleanValues };
    }

    if (this.config.noImplicitAdditionalProperties === 'silently-remove-extras') {
      if (schemasWithRequiredProps.length > 0) {
        return cleanValues;
      } else {
        fieldErrors[parent + name] = {
          message: `Could not match intersection against any of the possible combinations: ${JSON.stringify(schemas.map(s => Object.keys(s.properties)))}`,
          value,
        };
        return;
      }
    }

    if (schemasWithRequiredProps.length > 0 && schemasWithRequiredProps.some(schema => this.getExcessPropertiesFor(schema, Object.keys(value)).length === 0)) {
      return cleanValues;
    } else {
      fieldErrors[parent + name] = {
        message: `Could not match intersection against any of the possible combinations: ${JSON.stringify(schemas.map(s => Object.keys(s.properties)))}`,
        value,
      };
      return;
    }
  }

  private toModelLike(schema: TsoaRoute.PropertySchema): TsoaRoute.RefObjectModelSchema[] {
    if (schema.ref) {
      const model = this.models[schema.ref];
      if (model.dataType === 'refObject') {
        return [model];
      } else if (model.dataType === 'refAlias') {
        return [...this.toModelLike(model.type)];
      } else if (model.dataType === 'refEnum') {
        throw new Error(`Can't transform an enum into a model like structure because it does not have properties.`);
      } else {
        return assertNever(model);
      }
    } else if (schema.nestedProperties) {
      return [{ dataType: 'refObject', properties: schema.nestedProperties, additionalProperties: schema.additionalProperties }];
    } else if (schema.subSchemas && schema.dataType === 'intersection') {
      const modelss: TsoaRoute.RefObjectModelSchema[][] = schema.subSchemas.map(subSchema => this.toModelLike(subSchema));

      return this.selfIntersectionCombinations(modelss);
    } else if (schema.subSchemas && schema.dataType === 'union') {
      const modelss: TsoaRoute.RefObjectModelSchema[][] = schema.subSchemas.map(subSchema => this.toModelLike(subSchema));
      return modelss.reduce((acc, models) => [...acc, ...models], []);
    } else {
      // There are no properties to check for excess here.
      return [{ dataType: 'refObject', properties: {}, additionalProperties: false }];
    }
  }

  /**
   * combine all schemas once, ignoring order ie
   * input: [[value1], [value2]] should be [[value1, value2]]
   * not [[value1, value2],[value2, value1]]
   * and
   * input: [[value1, value2], [value3, value4], [value5, value6]] should be [
   *   [value1, value3, value5],
   *   [value1, value3, value6],
   *   [value1, value4, value5],
   *   [value1, value4, value6],
   *   [value2, value3, value5],
   *   [value2, value3, value6],
   *   [value2, value4, value5],
   *   [value2, value4, value6],
   * ]
   * @param modelSchemass
   */
  private selfIntersectionCombinations(modelSchemass: TsoaRoute.RefObjectModelSchema[][]): TsoaRoute.RefObjectModelSchema[] {
    const res: TsoaRoute.RefObjectModelSchema[] = [];
    // Picks one schema from each sub-array
    const combinations = this.getAllCombinations(modelSchemass);

    for (const combination of combinations) {
      // Combine all schemas of this combination
      let currentCollector = { ...combination[0] };
      for (let subSchemaIdx = 1; subSchemaIdx < combination.length; subSchemaIdx++) {
        currentCollector = { ...this.combineProperties(currentCollector, combination[subSchemaIdx]) };
      }
      res.push(currentCollector);
    }
    return res;
  }

  private getAllCombinations<T>(arrays: T[][]): T[][] {
    function combine(current: T[], index: number) {
      if (index === arrays.length) {
        result.push(current.slice());
        return;
      }

      for (let i = 0; i < arrays[index].length; i++) {
        current.push(arrays[index][i]);
        combine(current, index + 1);
        current.pop();
      }
    }

    const result: T[][] = [];
    combine([], 0);
    return result;
  }

  private combineProperties(a: TsoaRoute.RefObjectModelSchema, b: TsoaRoute.RefObjectModelSchema): TsoaRoute.RefObjectModelSchema {
    return { dataType: 'refObject', properties: { ...a.properties, ...b.properties }, additionalProperties: a.additionalProperties || b.additionalProperties || false };
  }

  private getExcessPropertiesFor(modelDefinition: TsoaRoute.RefObjectModelSchema, properties: string[]): string[] {
    if (this.config.noImplicitAdditionalProperties === 'ignore') {
      return [];
    }

    const modelProperties = propertyNamesOf(modelDefinition.properties);
    const excessProperties = properties.filter(property => !modelProperties.has(property));
    return modelDefinition.additionalProperties ? excessProperties.filter(property => property === PROTOTYPE_KEY) : excessProperties;
  }

  public validateModel(input: { name: string; value: any; modelDefinition: TsoaRoute.ModelSchema; fieldErrors: FieldErrors; isBodyParam: boolean; parent?: string }): any {
    const { name, value, modelDefinition, fieldErrors, isBodyParam, parent = '' } = input;
    const previousErrors = countFieldErrors(fieldErrors);

    if (modelDefinition) {
      if (modelDefinition.dataType === 'refEnum') {
        return this.validateEnum(name, value, fieldErrors, modelDefinition.enums, parent, isBodyParam);
      }

      if (modelDefinition.dataType === 'refAlias') {
        return this.ValidateParam(modelDefinition.type, value, name, fieldErrors, isBodyParam, parent);
      }

      const fieldPath = parent + name;

      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fieldErrors[fieldPath] = {
          message: `invalid object`,
          value,
        };
        return;
      }

      const properties = modelDefinition.properties || {};
      const keysOnPropertiesModelDefinition = propertyNamesOf(properties);

      const childPath = fieldPath ? fieldPath + '.' : '';

      for (const [key, property] of propertyEntriesOf(properties)) {
        const validatedParam = this.ValidateParam(property, value[key], key, fieldErrors, isBodyParam, childPath);

        // Add value from validator if it's not undefined or if value is required and unfedined is valid type
        if (validatedParam !== undefined || (property.dataType === 'undefined' && property.required)) {
          value[key] = validatedParam;
        }
      }

      // Only keys read off the value reach this, and a key the loop above added is a model
      // property, so belonging to the value no longer has to be checked.
      const isAnExcessProperty = (objectKeyThatMightBeExcess: string) => !keysOnPropertiesModelDefinition.has(objectKeyThatMightBeExcess);

      const additionalProperties = modelDefinition.additionalProperties;
      const propHandling = this.config.noImplicitAdditionalProperties;

      const rejectExcessProperty = (key: string) => {
        if (propHandling === 'throw-on-extras') {
          fieldErrors[`${fieldPath}.${key}`] = {
            message: `"${key}" is an excess property and therefore is not allowed`,
            value: key,
          };
        } else if (propHandling === 'silently-remove-extras') {
          delete value[key];
        } else if (propHandling !== 'ignore') {
          assertNever(propHandling);
        }
      };

      // An own "__proto__" key is never an allowed additional property: any later assignment
      // or Object.assign of the validated value would make it the target's prototype.
      if (additionalProperties !== false && Object.prototype.hasOwnProperty.call(value, PROTOTYPE_KEY) && isAnExcessProperty(PROTOTYPE_KEY)) {
        rejectExcessProperty(PROTOTYPE_KEY);
      }

      if (additionalProperties === true || isDefaultForAdditionalPropertiesAllowed(additionalProperties)) {
        // then don't validate any of the additional properties
      } else if (additionalProperties === false) {
        if (propHandling !== 'ignore') {
          const keys = Object.keys(value);

          for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            if (isAnExcessProperty(key)) {
              rejectExcessProperty(key);
            }
          }
        }
      } else {
        Object.keys(value).forEach((key: string) => {
          if (isAnExcessProperty(key) && (key !== PROTOTYPE_KEY || propHandling === 'ignore')) {
            const validatedValue = this.ValidateParam(additionalProperties, value[key], key, fieldErrors, isBodyParam, childPath);
            // Add value from validator if it's not undefined or if value is required and unfedined is valid type
            if (validatedValue !== undefined || (additionalProperties.dataType === 'undefined' && additionalProperties.required)) {
              value[key] = validatedValue;
            } else {
              fieldErrors[`${fieldPath}.${key}`] = {
                message: `No matching model found in additionalProperties to validate ${key}`,
                value: key,
              };
            }
          }
        });
      }
    }

    if (countFieldErrors(fieldErrors) > previousErrors) {
      return;
    }

    return value;
  }

  /**
   * Creates a new ValidationService instance with specific configuration
   * @param overrides Configuration overrides
   * @returns New ValidationService instance
   */
  private createChildValidationService(overrides: Partial<AdditionalProps> = {}): ValidationService {
    return new ValidationService(this.models, { ...this.config, ...overrides }, this.refRecursionGuard);
  }

  /** Clones a value for a union or intersection branch, so the recursion guard still recognizes the value it copies. */
  private cloneForBranch<T>(value: T): T {
    const clone = this.deepClone(value);
    this.refRecursionGuard.registerBranchClone(clone, value);
    return clone;
  }

  /**
   * Deep clones an object without using JSON.stringify/parse to avoid:
   * 1. Loss of undefined values
   * 2. Loss of functions
   * 3. Conversion of dates to strings
   * 4. Exponential escaping issues with nested objects
   */
  private deepClone<T>(obj: T): T {
    // Fast path for primitives
    if (obj === null || obj === undefined) {
      return obj;
    }

    const type = typeof obj;
    if (type !== 'object') {
      return obj;
    }

    // Handle built-in object types
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as any;
    }

    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags) as any;
    }

    if (obj instanceof Array) {
      const cloneArr: any[] = new Array(obj.length);
      for (let i = 0; i < obj.length; i++) {
        cloneArr[i] = this.deepClone(obj[i]);
      }
      return cloneArr as any;
    }

    if (Buffer && obj instanceof Buffer) {
      return Buffer.from(obj) as any;
    }

    // Handle plain objects. Assigning an own "__proto__" key would replace the clone's prototype.
    const cloneObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const cloned = this.deepClone(obj[key]);
        if (key === PROTOTYPE_KEY) {
          Object.defineProperty(cloneObj, key, { value: cloned, enumerable: true, writable: true, configurable: true });
        } else {
          cloneObj[key] = cloned;
        }
      }
    }
    return cloneObj;
  }

  /**
   * Adds a summarized error to the fieldErrors object
   * @param fieldErrors The errors object to add to
   * @param errorKey The key for the error
   * @param prefix The error message prefix
   * @param subErrors Array of sub-errors to summarize
   * @param value The value that failed validation
   */
  private addSummarizedError(fieldErrors: FieldErrors, errorKey: string, prefix: string, subErrors: FieldErrors[], value: any): void {
    const maxErrorLength = this.config.maxValidationErrorSize ? this.config.maxValidationErrorSize - prefix.length : undefined;

    fieldErrors[errorKey] = {
      message: `${prefix}${this.summarizeValidationErrors(subErrors, maxErrorLength)}`,
      value: this.truncateErrorValue(value),
    };
  }

  /**
   * Replaces a value whose string or JSON form exceeds the error size limit with a truncated string
   */
  private truncateErrorValue(value: unknown): unknown {
    const maxLength = this.config.maxValidationErrorSize || 1000;
    let serialized: string | undefined;
    try {
      serialized = typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
      return value;
    }
    if (serialized === undefined || serialized.length <= maxLength) {
      return value;
    }
    return `${serialized.substring(0, maxLength)}...`;
  }

  /**
   * Summarizes validation errors to prevent extremely large error messages
   * @param errors Array of field errors from union/intersection validation
   * @param maxLength Maximum length of the summarized message
   * @returns Summarized error message
   */
  private summarizeValidationErrors(errors: FieldErrors[], maxLength?: number): string {
    const effectiveMaxLength = maxLength || this.config.maxValidationErrorSize || 1000;

    // If there are no errors, return empty
    if (errors.length === 0) {
      return '[]';
    }

    // Start with a count of total errors
    const errorCount = errors.length;
    const summary: string[] = [];

    // Try to include first few errors
    let currentLength = 0;
    let includedErrors = 0;

    // Calculate the size of the suffix if we need to truncate
    const truncatedSuffix = `,...and ${errorCount} more errors]`;
    const reservedSpace = truncatedSuffix.length + 10; // +10 for safety margin

    for (const error of errors) {
      const errorStr = JSON.stringify(error);
      const projectedLength = currentLength + errorStr.length + (summary.length > 0 ? 1 : 0) + 2; // +1 for comma if not first, +2 for brackets

      if (projectedLength + reservedSpace < effectiveMaxLength && includedErrors < 3) {
        summary.push(errorStr);
        currentLength = projectedLength;
        includedErrors++;
      } else {
        break;
      }
    }

    // Build final message
    if (includedErrors < errorCount) {
      const result = `[${summary.join(',')},...and ${errorCount - includedErrors} more errors]`;
      // Make sure we don't exceed the limit
      if (result.length > effectiveMaxLength) {
        // If still too long, remove the last error and try again
        if (summary.length > 0) {
          summary.pop();
          includedErrors--;
          return `[${summary.join(',')},...and ${errorCount - includedErrors} more errors]`;
        }
      }
      return result;
    } else {
      return `[${summary.join(',')}]`;
    }
  }
}

export interface IntegerValidator {
  isInt?: { errorMsg?: string };
  isLong?: { errorMsg?: string };
  minimum?: { value: number; errorMsg?: string };
  maximum?: { value: number; errorMsg?: string };
  exclusiveMinimum?: { value: number; errorMsg?: string };
  exclusiveMaximum?: { value: number; errorMsg?: string };
}

export interface FloatValidator {
  isFloat?: { errorMsg?: string };
  isDouble?: { errorMsg?: string };
  minimum?: { value: number; errorMsg?: string };
  maximum?: { value: number; errorMsg?: string };
  exclusiveMinimum?: { value: number; errorMsg?: string };
  exclusiveMaximum?: { value: number; errorMsg?: string };
}

export interface DateValidator {
  isDate?: { errorMsg?: string };
  minDate?: { value: string; errorMsg?: string };
  maxDate?: { value: string; errorMsg?: string };
}

export interface DateTimeValidator {
  isDateTime?: { errorMsg?: string };
  minDate?: { value: string; errorMsg?: string };
  maxDate?: { value: string; errorMsg?: string };
}

export interface StringValidator {
  isString?: { errorMsg?: string };
  minLength?: { value: number; errorMsg?: string };
  maxLength?: { value: number; errorMsg?: string };
  pattern?: { value: string; errorMsg?: string };
  title?: { value: string; errorMsg?: string };
}

export interface BooleanValidator {
  isBoolean?: { errorMsg?: string };
}

export interface ArrayValidator {
  isArray?: { errorMsg?: string };
  minItems?: { value: number; errorMsg?: string };
  maxItems?: { value: number; errorMsg?: string };
  uniqueItems?: { errorMsg?: string };
}

export type Validator = IntegerValidator | FloatValidator | DateValidator | DateTimeValidator | StringValidator | BooleanValidator | ArrayValidator;

export interface FieldErrors {
  [name: string]: { message: string; value?: any };
}

export interface Exception extends Error {
  status: number;
}

export class ValidateError extends Error implements Exception {
  public status = 400;
  public name = 'ValidateError';

  constructor(
    public fields: FieldErrors,
    public message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, ValidateError.prototype);
  }
}
