import { expect } from 'chai';
import 'mocha';
import { TsoaRoute, FieldErrors, ValidationService } from '@iffa/tsoa-runtime';
import { TypeAliasDate, TypeAliasDateTime, TypeAliasModel1, TypeAliasModel2 } from '../../fixtures/testModel';

describe('ValidationService', () => {
  describe('Model validate', () => {
    it('should validate a model with declared properties', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        properties: {
          a: { dataType: 'string', required: true },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      );
      const error: FieldErrors = {};
      const result = v.validateModel({
        fieldErrors: error,
        isBodyParam: true,
        name: '',
        modelDefinition,
        value: { a: 's' },
      });
      expect(Object.keys(error)).to.be.empty;
      expect(result).to.eql({ a: 's' });
    });

    it('should not allow additionalProperties if noImplicitAdditionalProperties is set to throw-on-extras', () => {
      // Arrange
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        additionalProperties: false,
        properties: {
          a: { dataType: 'string', required: true },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        },
      );
      const errorDictionary: FieldErrors = {};
      const nameOfAdditionalProperty = 'I am the bad key name';
      const dataToValidate = {
        a: 's',
        [nameOfAdditionalProperty]: 'something extra',
      };

      // Act
      v.validateModel({
        fieldErrors: errorDictionary,
        isBodyParam: true,
        name: '',
        modelDefinition,
        value: dataToValidate,
      });

      // Assert
      const errorKeys = Object.keys(errorDictionary);
      expect(errorKeys).to.have.lengthOf(1);
      const firstAndOnlyErrorKey = errorKeys[0];
      expect(errorDictionary[firstAndOnlyErrorKey].message).to.eq(`"${nameOfAdditionalProperty}" is an excess property and therefore is not allowed`);
      if (!dataToValidate[nameOfAdditionalProperty]) {
        throw new Error(
          `dataToValidate.${nameOfAdditionalProperty} should have been there because .validateModel should NOT have removed it since it took the more severe option of producing an error instead.`,
        );
      }
    });

    it('should allow (but remove) additionalProperties if noImplicitAdditionalProperties is set to silently-remove-extras', () => {
      // Arrange
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        additionalProperties: false,
        properties: {
          a: { dataType: 'string', required: true },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'silently-remove-extras',
          bodyCoercion: true,
        },
      );
      const errorDictionary: FieldErrors = {};
      const nameOfAdditionalProperty = 'I am the bad key name';
      const dataToValidate = {
        a: 's',
        [nameOfAdditionalProperty]: 'something extra',
      };

      // Act
      v.validateModel({
        fieldErrors: errorDictionary,
        isBodyParam: true,
        name: '',
        modelDefinition,
        value: dataToValidate,
      });

      // Assert
      if (dataToValidate[nameOfAdditionalProperty]) {
        throw new Error(`dataToValidate.${nameOfAdditionalProperty} should NOT have been present because .validateModel should have removed it due to it being an excess property.`);
      }
      expect(dataToValidate).not.to.have.ownProperty(nameOfAdditionalProperty, '');
      const errorKeys = Object.keys(errorDictionary);
      expect(errorKeys).to.have.lengthOf(0);
    });

    it('should allow additionalProperties if noImplicitAdditionalProperties is set to ignore', () => {
      // Arrange
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        additionalProperties: false,
        properties: {
          a: { dataType: 'string', required: true },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      );
      const errorDictionary: FieldErrors = {};
      const nameOfAdditionalProperty = 'I am the bad key name';
      const dataToValidate = {
        a: 's',
        [nameOfAdditionalProperty]: 'something extra',
      };

      // Act
      const result = v.validateModel({
        fieldErrors: errorDictionary,
        isBodyParam: true,
        name: '',
        modelDefinition,
        value: dataToValidate,
      });
      expect(Object.keys(errorDictionary)).to.be.empty;
      expect(result).to.eql({
        a: 's',
        [nameOfAdditionalProperty]: 'something extra',
      });
    });

    it('should not require optional properties', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        properties: {
          a: { dataType: 'string' },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      );
      const error: FieldErrors = {};
      const result = v.validateModel({ name: '', value: {}, modelDefinition, fieldErrors: error, isBodyParam: true });
      expect(Object.keys(error)).to.be.empty;
      expect(result).to.eql({});
    });

    it('should validate a model with additional properties', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        properties: {},
        additionalProperties: { dataType: 'any' },
      };
      const v = new ValidationService(
        {},
        {
          // we're setting this to the "throw" to demonstrate that explicit additionalProperties should always be allowed
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        },
      );
      const error: FieldErrors = {};
      const result = v.validateModel({
        name: '',
        value: { a: 's' },
        modelDefinition,
        fieldErrors: error,

        isBodyParam: true,
      });
      expect(Object.keys(error)).to.be.empty;
      expect(result).to.eql({ a: 's' });
    });

    it('should validate a model with optional and additional properties', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        additionalProperties: { dataType: 'any' },
        properties: {
          a: { dataType: 'string' },
        },
      };
      const v = new ValidationService(
        {},
        {
          // This test should ignore this, otherwise there's a problem the code
          //      when the model has additionalProperties, that should take precedence since it's explicit
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        },
      );
      const error: FieldErrors = {};
      const result = v.validateModel({ name: '', value: {}, modelDefinition, fieldErrors: error, isBodyParam: true });
      expect(Object.keys(error)).to.be.empty;
      expect(result).to.eql({});
    });

    it('should validate additional properties only against non-explicitly stated properties', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        additionalProperties: {
          dataType: 'integer',
          validators: { minimum: { value: 10 } },
        },
        properties: {
          a: { dataType: 'integer' },
        },
      };
      const v = new ValidationService(
        {},
        {
          // This test should ignore this, otherwise there's a problem the code
          //      when the model has additionalProperties, that should take precedence since it's explicit
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        },
      );
      const error: FieldErrors = {};
      const result = v.validateModel({ name: '', value: { a: 9 }, modelDefinition, fieldErrors: error, isBodyParam: true });
      expect(Object.keys(error)).to.be.empty;
      expect(result).to.eql({ a: 9 });
    });

    it('non provided parameters should not result in undefined', () => {
      const v = new ValidationService(
        {
          BEnum: {
            dataType: 'refEnum',
            enums: ['X', 'Y'],
          },
          General: {
            dataType: 'refObject',
            properties: {
              a: { dataType: 'string' },
              b: { ref: 'BEnum' },
              c: { dataType: 'string' },
            },
            additionalProperties: false,
          },
        },
        { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true },
      );

      const error: FieldErrors = {};

      const result = v.ValidateParam(
        { required: true, ref: 'General' },
        {
          a: 'value',
          b: undefined,
        },
        'body',
        error,
        true,
        undefined,
      );

      expect(result).to.deep.equal({ a: 'value', b: undefined });
      expect(Object.keys(error)).to.be.empty;
      expect('a' in result).to.be.true; // provided
      expect('b' in result).to.be.true; // provided, but empty
      expect('c' in result).to.be.false; // not provided
    });

    it('required provided parameters should result in required errors', () => {
      const v = new ValidationService(
        {
          General: {
            dataType: 'refObject',
            properties: {
              a: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
        },
        { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true },
      );

      const error: FieldErrors = {};

      v.ValidateParam(
        { required: true, ref: 'General' },
        {
          c: 'value',
        },
        'body',
        error,
        true,
        undefined,
      );

      expect(error['body.a'].message).to.equal(`'a' is required`);
    });
  });

  describe('Param validate', () => {
    it('should apply defaults for optional properties', () => {
      const value = undefined;
      const propertySchema: TsoaRoute.PropertySchema = { dataType: 'integer', default: '666', required: false, validators: {} };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).ValidateParam(propertySchema, value, 'defaultProp', {}, true, undefined);
      expect(result).to.equal(666);
    });

    it('should not override values with defaults', () => {
      const value = 123;
      const propertySchema: TsoaRoute.PropertySchema = { dataType: 'integer', default: '666', required: false, validators: {} };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).ValidateParam(propertySchema, value, 'defaultProp', {}, true, undefined);
      expect(result).to.equal(123);
    });

    it('should apply defaults for required properties', () => {
      const value = undefined;
      const propertySchema: TsoaRoute.PropertySchema = { dataType: 'integer', default: '666', required: true, validators: {} };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).ValidateParam(propertySchema, value, 'defaultProp', {}, true, undefined);
      expect(result).to.equal(666);
    });
  });

  describe('Integer validate', () => {
    it('should integer value', () => {
      const value = '10';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateInt('name', value, {}, true);
      expect(result).to.equal(Number(value));
    });

    it('should invalid integer format', () => {
      const name = 'name';
      const value = '10.0';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateInt(name, value, error, true);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`invalid integer number`);
    });

    it('should integer validate', () => {
      const name = 'name';
      const value = '11';
      const error: FieldErrors = {};
      const validator = { minimum: { value: 10 }, maximum: { value: 12 } };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateInt(name, value, error, true, validator);
      expect(result).to.equal(Number(value));
    });

    it('should invalid integer min validate', () => {
      const name = 'name';
      const value = '11';
      const error: FieldErrors = {};
      const validator = { minimum: { value: 12 } };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateInt(name, value, error, true, validator);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`min 12`);
    });

    it('should invalid integer max validate', () => {
      const name = 'name';
      const value = '11';
      const error: FieldErrors = {};
      const validator = { maximum: { value: 10 } };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateInt(name, value, error, true, validator);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`max 10`);
    });

    it('should return an error if bodyCoercion is false and a non-number value is provided', () => {
      const name = 'name';
      const value: any = '10';
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).validateInt(name, value, error, true);
      expect(result).to.deep.equal(undefined);
      expect(error[name].message).to.equal('invalid integer number');
      expect(error[name].value).to.equal('10');
    });
  });

  describe('Exclusive bounds validate', () => {
    const service = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });

    it('rejects a value that equals an exclusive bound', () => {
      for (const [validators, value, message] of [
        [{ exclusiveMinimum: { value: 5 } }, '5', 'exclusiveMin 5'],
        [{ exclusiveMaximum: { value: 10 } }, '10', 'exclusiveMax 10'],
      ] as const) {
        const intError: FieldErrors = {};
        expect(service.validateInt('name', value, intError, true, validators)).to.equal(undefined);
        expect(intError.name.message).to.equal(message);

        const floatError: FieldErrors = {};
        expect(service.validateFloat('name', value, floatError, true, validators)).to.equal(undefined);
        expect(floatError.name.message).to.equal(message);
      }
    });

    it('accepts a value just past an exclusive bound', () => {
      expect(service.validateInt('name', '6', {}, true, { exclusiveMinimum: { value: 5 } })).to.equal(6);
      expect(service.validateInt('name', '9', {}, true, { exclusiveMaximum: { value: 10 } })).to.equal(9);
      expect(service.validateFloat('name', '5.1', {}, true, { exclusiveMinimum: { value: 5 } })).to.equal(5.1);
      expect(service.validateFloat('name', '9.9', {}, true, { exclusiveMaximum: { value: 10 } })).to.equal(9.9);
    });

    it('accepts a value that equals an inclusive bound', () => {
      expect(service.validateInt('name', '5', {}, true, { minimum: { value: 5 } })).to.equal(5);
      expect(service.validateFloat('name', '10', {}, true, { maximum: { value: 10 } })).to.equal(10);
    });

    it('uses the annotation error message when there is one', () => {
      const error: FieldErrors = {};
      service.validateFloat('name', '5', error, true, { exclusiveMinimum: { value: 5, errorMsg: 'must be over five' } });
      expect(error.name.message).to.equal('must be over five');
    });
  });

  describe('Float validate', () => {
    it('should float value', () => {
      const value = '10';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateFloat('name', value, {}, true);
      expect(result).to.equal(Number(value));
    });

    it('rejects strings that hold no usable number', () => {
      const service = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });
      const accepted = ['0', '-0', '+0', '1.5', '1.', '.1', '-.5', '1e3', '1E3', '1e+3', '-1.5E-10'];
      // 'e3' and '.e1' hold no digits but still match the float expression, so they used to
      // reach the controller as NaN.
      const rejected = ['', '.', ',', '-', '+', 'e3', '.e1', '1e', '1e+', 'Infinity', 'NaN', '1,5', '0x10', '1_000', '1..2', ' 1', '1 ', '9'.repeat(400)];

      for (const value of accepted) {
        const error: FieldErrors = {};
        expect(service.validateFloat('name', value, error, true), value).to.equal(parseFloat(value));
        expect(error, value).to.deep.equal({});
      }

      for (const value of rejected) {
        const error: FieldErrors = {};
        expect(service.validateFloat('name', value, error, true), value).to.equal(undefined);
        expect(error.name?.message, value).to.equal('invalid float number');
      }
    });

    it('should invalid float format', () => {
      const name = 'name';
      const value = 'Hello';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateFloat(name, value, error, true);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`invalid float number`);
    });

    it('should float validate', () => {
      const name = 'name';
      const value = '11.5';
      const error: FieldErrors = {};
      const validator = { minimum: { value: 10 }, maximum: { value: 12 } };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateFloat(name, value, error, true, validator);
      expect(result).to.equal(Number(value));
    });

    it('should invalid float min validate', () => {
      const name = 'name';
      const value = '12.4';
      const error: FieldErrors = {};
      const validator = { minimum: { value: 12.5 } };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateFloat(name, value, error, true, validator);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`min 12.5`);
    });

    it('should invalid float max validate', () => {
      const name = 'name';
      const value = '10.6';
      const error: FieldErrors = {};
      const validator = { maximum: { value: 10.5 } };
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateFloat(name, value, error, true, validator);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`max 10.5`);
    });

    it('should return an error if bodyCoercion is false and a non-number value is provided', () => {
      const name = 'name';
      const value: any = '10.1';
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).validateFloat(name, value, error, true);
      expect(result).to.deep.equal(undefined);
      expect(error[name].message).to.equal('invalid float number');
      expect(error[name].value).to.equal('10.1');
    });
  });

  describe('Boolean validate', () => {
    it('should return true when submitted true', () => {
      const value = true;
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateBool('name', value, {}, true);
      expect(result).to.equal(true);
    });

    it('should return false when submitted false', () => {
      const value = false;
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateBool('name', value, {}, true);
      expect(result).to.equal(false);
    });

    it('should coerce strings to boolean values if body coercion is enabled', () => {
      const value = 'false';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateBool('name', value, {}, true);
      expect(result).to.equal(false);
    });

    it('should return an error a non-boolean value is provided and body coercion is disabled', () => {
      const name = 'name';
      const value = 'false';
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).validateBool(name, value, error, true);
      expect(result).to.deep.equal(undefined);
      expect(error[name].message).to.equal('invalid boolean value');
      expect(error[name].value).to.equal('false');
    });
  });

  describe('Enum validate', () => {
    type Enumeration = string[] | number[];

    it('should enum number value', () => {
      const name = 'name';
      const value = 1;
      const error: FieldErrors = {};
      const enumeration: Enumeration = [0, 1];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(value);
    });

    it('should enum empty string value', () => {
      const value = '';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum('name', value, {}, ['']);
      expect(result).to.equal(value);
    });

    it('should enum null is not empty string value', () => {
      const value = null;
      const error: FieldErrors = {};
      const name = 'name';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, ['']);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; ['']`);
    });

    it('should enum string value', () => {
      const name = 'name';
      const value = 'HELLO';
      const error: FieldErrors = {};
      const enumeration: Enumeration = ['HELLO'];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(value);
    });

    it('should enum no member', () => {
      const name = 'name';
      const value = 'HI';
      const error: FieldErrors = {};
      const enumeration: Enumeration = [];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`no member`);
    });

    it('should enum out of member', () => {
      const name = 'name';
      const value = 'SAY';
      const error: FieldErrors = {};
      const enumeration: Enumeration = ['HELLO', 'HI'];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; ['HELLO','HI']`);
    });

    it('does accept a string value for a numeric enum', () => {
      const name = 'name';
      const value = '1';
      const error: FieldErrors = {};
      const enumeration: Enumeration = [0, 1];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(1);
      expect(error).to.deep.equal({});
    });

    it('does not accept a wrong string value for a numeric enum', () => {
      const name = 'name';
      const value = '2';
      const error: FieldErrors = {};
      const enumeration: Enumeration = [0, 1];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [0,1]`);
    });

    it('does accept a numeric value for a string-numeric enum', () => {
      const name = 'name';
      const value = 1;
      const error: FieldErrors = {};
      const enumeration: Enumeration = ['0', '1'];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal('1');
      expect(error).to.deep.equal({});
    });

    it('does not accept an improper numeric value for a string-numeric enum', () => {
      const name = 'name';
      const value = 2;
      const error: FieldErrors = {};
      const enumeration: Enumeration = ['0', '1'];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; ['0','1']`);
    });

    it('should fail if the value is a non-numeric string for a numeric enum', () => {
      const name = 'name';
      const value = 'foo';
      const error: FieldErrors = {};
      const enumeration: Enumeration = [1, 2];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [1,2]`);
    });

    it('does accept a boolean value for a boolean enum', () => {
      const name = 'name';
      const value = false;
      const error: FieldErrors = {};
      const enumeration = [false];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(false);
      expect(error).to.deep.equal({});
    });

    it('does accept a stringified boolean value for a boolean enum', () => {
      const name = 'name';
      const value = 'true';
      const error: FieldErrors = {};
      const enumeration = [true];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(true);
      expect(error).to.deep.equal({});
    });

    it('does not accept a wrong members of a boolean enum', () => {
      const name = 'name';
      const value = false;
      const error: FieldErrors = {};
      const enumeration = [true];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [true]`);
    });

    it('does not accept a wrong members of a boolean enum', () => {
      const name = 'name';
      const value = 'false';
      const error: FieldErrors = {};
      const enumeration = [true];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [true]`);
    });

    it('accepts null in null enum', () => {
      const name = 'name';
      const value = null;
      const error: FieldErrors = {};
      const enumeration = [null];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(null);
      expect(error).to.deep.equal({});
    });

    it('accepts stringified null in null enum', () => {
      const name = 'name';
      const value = 'null';
      const error: FieldErrors = {};
      const enumeration = [null];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(null);
      expect(error).to.deep.equal({});
    });

    it('does not coerce null to 0', () => {
      const name = 'name';
      const value = 'null';
      const error: FieldErrors = {};
      const enumeration = [0];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [0]`);
    });

    it('does not coerce 0 to null', () => {
      const name = 'name';
      const value = 0;
      const error: FieldErrors = {};
      const enumeration = [null];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [null]`);
    });

    it('does not coerce null to false', () => {
      const name = 'name';
      const value = null;
      const error: FieldErrors = {};
      const enumeration = [false];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [false]`);
    });

    it('does not coerce false to null', () => {
      const name = 'name';
      const value = false;
      const error: FieldErrors = {};
      const enumeration = [null];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [null]`);
    });

    it('does not coerce 0 to false', () => {
      const name = 'name';
      const value = 0;
      const error: FieldErrors = {};
      const enumeration = [false];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [false]`);
    });

    it('does not coerce false to 0', () => {
      const name = 'name';
      const value = false;
      const error: FieldErrors = {};
      const enumeration = [0];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [0]`);
    });

    it("does not coerce null to ''", () => {
      const name = 'name';
      const value = null;
      const error: FieldErrors = {};
      const enumeration = [''];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; ['']`);
    });

    it("does not coerce '' to null", () => {
      const name = 'name';
      const value = '';
      const error: FieldErrors = {};
      const enumeration = [null];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [null]`);
    });

    it('does not coerce 1 to true', () => {
      const name = 'name';
      const value = 1;
      const error: FieldErrors = {};
      const enumeration = [true];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [true]`);
    });

    it('does not coerce true to 1', () => {
      const name = 'name';
      const value = true;
      const error: FieldErrors = {};
      const enumeration = [1];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; [1]`);
    });

    it("does not coerce true to '1'", () => {
      const name = 'name';
      const value = true;
      const error: FieldErrors = {};
      const enumeration = ['1'];
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateEnum(name, value, error, enumeration);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`should be one of the following; ['1']`);
    });
  });

  describe('String validate', () => {
    it('should string value', () => {
      const value = 'Hello';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateString('name', value, {});
      expect(result).to.equal(value);
    });

    it('should string minLength validate', () => {
      const name = 'name';
      const value = 'AB';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateString(name, value, error, { minLength: { value: 5 } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`minLength 5`);
    });

    it('should string maxLength validate', () => {
      const name = 'name';
      const value = 'ABCDE';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateString(name, value, error, { maxLength: { value: 3 } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`maxLength 3`);
    });

    it('should string pattern validate', () => {
      const name = 'name';
      const value = 'ABC';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateString(name, value, error, { pattern: { value: 'a-z' } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`Not match in 'a-z'`);
    });
  });

  describe('Date validate', () => {
    it('should date value', () => {
      const value = '2017-01-01';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDate('name', value, {}, true);
      expect(result).to.deep.equal(new Date(value));
    });

    it('should invalid date format', () => {
      const name = 'name';
      const value = '2017-33-11';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDate(name, value, error, true);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`invalid ISO 8601 date format, i.e. YYYY-MM-DD`);
    });

    it('should date minDate validate', () => {
      const name = 'name';
      const value = '2017-06-01';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDate(name, value, error, true, { minDate: { value: '2017-07-01' } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`minDate '2017-07-01'`);
    });

    it('should string maxDate validate', () => {
      const name = 'name';
      const value = '2017-06-01';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDate(name, value, error, true, { maxDate: { value: '2017-05-01' } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`maxDate '2017-05-01'`);
    });

    it('should return an error if bodyCoercion is false and a non-string value is provided', () => {
      const name = 'name';
      const value: any = 1234;
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).validateDate(name, value, error, true);
      expect(result).to.deep.equal(undefined);
      expect(error[name].message).to.equal('invalid ISO 8601 date format, i.e. YYYY-MM-DD');
      expect(error[name].value).to.equal(1234);
    });
  });

  describe('DateTime validate', () => {
    it('should datetime value', () => {
      const value = '2017-12-30T00:00:00';
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDateTime('name', value, {}, true);
      expect(result).to.deep.equal(new Date(value));
    });

    it('should invalid datetime format', () => {
      const name = 'name';
      const value = '2017-12-309i';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDateTime(name, value, error, true);
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`invalid ISO 8601 datetime format, i.e. YYYY-MM-DDTHH:mm:ss`);
    });

    it('should datetime minDate validate', () => {
      const name = 'name';
      const value = '2017-12-30T00:00:00';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDateTime(name, value, error, true, { minDate: { value: '2017-12-31T00:00:00' } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`minDate '2017-12-31T00:00:00'`);
    });

    it('should datetime maxDate validate', () => {
      const name = 'name';
      const value = '2017-12-30T00:00:00';
      const error: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).validateDateTime(name, value, error, true, { maxDate: { value: '2017-12-29T00:00:00' } });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`maxDate '2017-12-29T00:00:00'`);
    });

    it('should return an error if bodyCoercion is false and a non-string value is provided', () => {
      const name = 'name';
      const value: any = 1234;
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).validateDateTime(name, value, error, true);
      expect(result).to.deep.equal(undefined);
      expect(error[name].message).to.equal('invalid ISO 8601 datetime format, i.e. YYYY-MM-DDTHH:mm:ss');
      expect(error[name].value).to.equal(1234);
    });
  });

  describe('Array validate', () => {
    it('should array value', () => {
      const value = ['A', 'B', 'C'];
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).validateArray('name', value, {}, true, { dataType: 'string' });
      expect(result).to.deep.equal(value);
    });

    it('should invalid array value', () => {
      const name = 'name';
      const value = ['A', 10, true];
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).validateArray(name, value, error, true, { dataType: 'integer' });
      expect(result).to.deep.equal(undefined);
      expect(error[`${name}.$0`].message).to.equal('invalid integer number');
      expect(error[`${name}.$0`].value).to.equal('A');
      expect(error[`${name}.$2`].message).to.equal('invalid integer number');
      expect(error[`${name}.$2`].value).to.equal(true);
    });

    it('should invalid array nested value', () => {
      const name = 'name';
      const value = [{ a: 123 }, { a: 'bcd' }];
      const error: FieldErrors = {};
      const result = new ValidationService(
        {
          ExampleModel: {
            dataType: 'refObject',
            properties: {
              a: { dataType: 'string', required: true },
            },
          },
        },
        { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true },
      ).validateArray(name, value, error, true, { ref: 'ExampleModel' });
      expect(result).to.deep.equal(undefined);
      expect(error).to.deep.equal({
        [`${name}.$0.a`]: {
          message: 'invalid string value',
          value: 123,
        },
      });
    });

    it('should array minItems validate', () => {
      const name = 'name';
      const value = [80, 10, 199];
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).validateArray(
        name,
        value,
        error,
        true,
        { dataType: 'integer' },
        { minItems: { value: 4 } },
      );
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`minItems 4`);
    });

    it('should enforce maxItems of 0', () => {
      const error: FieldErrors = {};
      const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });

      const result = v.validateArray('name', ['x'], error, true, { dataType: 'string' }, { maxItems: { value: 0 } });

      expect(result).to.equal(undefined);
      expect(error.name.message).to.equal('maxItems 0');
    });

    it('should reject an oversized array before validating its elements', () => {
      const error: FieldErrors = {};
      const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });

      const result = v.validateArray('name', [1, 2, 3], error, true, { dataType: 'string' }, { maxItems: { value: 2 } });

      expect(result).to.equal(undefined);
      expect(Object.keys(error)).to.deep.equal(['name']);
    });

    it('should array maxItems validate', () => {
      const name = 'name';
      const value = [80, 10, 199];
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).validateArray(
        name,
        value,
        error,
        true,
        { dataType: 'integer' },
        { maxItems: { value: 2 } },
      );
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`maxItems 2`);
    });

    it('should array uniqueItems validate', () => {
      const name = 'name';
      const value = [10, 10, 20];
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).validateArray(name, value, error, true, { dataType: 'integer' }, { uniqueItems: {} });
      expect(result).to.equal(undefined);
      expect(error[name].message).to.equal(`required unique array`);
    });

    it('Should validate refEnum Arrays', () => {
      const enumModel: TsoaRoute.RefEnumModelSchema = {
        dataType: 'refEnum',
        enums: ['foo', 'bar'],
      };
      const v = new ValidationService(
        { enumModel },
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      );
      const fieldErrors = {};
      const result = v.validateArray('name', ['foo', 'bar', 'foo', 'foobar'], fieldErrors, true, { dataType: 'refEnum', ref: 'enumModel' });
      expect(Object.keys(fieldErrors)).to.not.be.empty;
      expect(result).to.be.undefined;
      expect(fieldErrors).to.deep.equal({ 'name.$3': { message: "should be one of the following; ['foo','bar']", value: 'foobar' } });
    });

    it('should return an error if bodyCoercion is false and a non-array value is provided', () => {
      const name = 'name';
      const value: any = 'some primitive string';
      const error: FieldErrors = {};
      const result = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).validateArray(name, value, error, true, { dataType: 'string' });
      expect(result).to.deep.equal(undefined);
      expect(error[name].message).to.equal('invalid array');
      expect(error[name].value).to.equal('some primitive string');
    });
  });

  describe('Union validate', () => {
    it('should validate discriminated union with silently-remove-extras on', () => {
      const v = new ValidationService(
        {
          TypeA: {
            dataType: 'refObject',
            properties: {
              type: { dataType: 'enum', enums: ['A'], required: true },
              a: { dataType: 'double', required: true },
            },
          },
          TypeB: {
            dataType: 'refObject',
            properties: {
              type: { dataType: 'enum', enums: ['B'], required: true },
              b: { dataType: 'double', required: true },
            },
          },
        },
        {
          noImplicitAdditionalProperties: 'silently-remove-extras',
          bodyCoercion: true,
        },
      );
      const name = 'name';
      const error: FieldErrors = {};
      const schema: TsoaRoute.PropertySchema = { subSchemas: [{ ref: 'TypeA' }, { ref: 'TypeB' }] };
      const resultA = v.validateUnion(name, { type: 'A', a: 100 }, error, true, schema);
      const resultB = v.validateUnion(name, { type: 'B', b: 20 }, error, true, schema);
      expect(resultA).to.deep.equal({ type: 'A', a: 100 });
      expect(resultB).to.deep.equal({ type: 'B', b: 20 });
    });

    it('validates parent validators', () => {
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'silently-remove-extras',
          bodyCoercion: true,
        },
      );
      const errors = {};
      const schema: TsoaRoute.PropertySchema = { dataType: 'union', subSchemas: [{ dataType: 'integer' }, { dataType: 'string' }], required: true, validators: { minimum: { value: 5 } } };

      const result = v.validateUnion('union', 2, errors, true, schema);
      expect(errors).to.deep.equal({
        union: {
          message: 'Could not match the union against any of the items. Issues: [{"union":{"message":"min 5","value":2}},{"union":{"message":"invalid string value","value":2}}]',
          value: 2,
        },
      });
      expect(result).to.be.undefined;
    });
  });

  describe('Union with a tag property', () => {
    const tagged = (tags: string[], fields: Record<string, TsoaRoute.PropertySchema>): TsoaRoute.ModelSchema => ({
      dataType: 'refObject',
      properties: { type: { dataType: 'enum', enums: tags, required: true }, ...fields },
      additionalProperties: false,
    });
    const models: TsoaRoute.Models = {
      TypeA: tagged(['A'], { a: { dataType: 'double', required: true } }),
      TypeB: tagged(['B', 'b'], { b: { dataType: 'string', required: true } }),
      TypeC: tagged(['constructor'], {}),
      TypeOne: tagged(['1'], {}),
      TypeD: {
        dataType: 'refAlias',
        type: { dataType: 'nestedObjectLiteral', nestedProperties: { type: { dataType: 'enum', enums: ['D'], required: true } }, additionalProperties: false },
      },
    };
    const union = (...refs: string[]): TsoaRoute.PropertySchema => ({ dataType: 'union', subSchemas: refs.map(ref => ({ ref })) });
    const validate = (value: unknown, schema = union('TypeA', 'TypeB', 'TypeC', 'TypeD'), bodyCoercion = false) => {
      const fieldErrors: FieldErrors = {};
      const result = new ValidationService(models, { noImplicitAdditionalProperties: 'throw-on-extras', bodyCoercion }).validateUnion('field', value, fieldErrors, true, schema, 'body.');
      return { result, fieldErrors };
    };

    it('selects the member by its tag, by any of its tags, and by a tag named like an Object.prototype member', () => {
      expect(validate({ type: 'A', a: 1 })).to.deep.equal({ result: { type: 'A', a: 1 }, fieldErrors: {} });
      expect(validate({ type: 'b', b: 'x' })).to.deep.equal({ result: { type: 'b', b: 'x' }, fieldErrors: {} });
      expect(validate({ type: 'constructor' })).to.deep.equal({ result: { type: 'constructor' }, fieldErrors: {} });
      expect(validate({ type: 'D' })).to.deep.equal({ result: { type: 'D' }, fieldErrors: {} });
    });

    it('reports an invalid field of the selected member at its own path', () => {
      const { result, fieldErrors } = validate({ type: 'A', a: 'nope' });
      expect(result).to.equal(undefined);
      expect(fieldErrors).to.have.all.keys('body.field.a');
    });

    it('reports a missing tag at the tag property', () => {
      expect(validate({ a: 1 }).fieldErrors).to.deep.equal({ 'body.field.type': { message: "'type' is required" } });
      expect(validate(JSON.parse('{"__proto__":{"type":"A"},"a":1}')).fieldErrors).to.have.all.keys('body.field.type');
    });

    it('reports an unknown tag at the tag property', () => {
      expect(validate({ type: 'Z' }).fieldErrors).to.deep.equal({ 'body.field.type': { message: "should be one of the following; ['A','B','b','constructor','D']", value: 'Z' } });
      expect(validate({ type: 'toString' }).fieldErrors).to.have.all.keys('body.field.type');
    });

    it('coerces the tag only with body coercion', () => {
      expect(validate({ type: 1 }, union('TypeA', 'TypeOne'), true)).to.deep.equal({ result: { type: '1' }, fieldErrors: {} });
      expect(validate({ type: 1 }, union('TypeA', 'TypeOne')).fieldErrors).to.have.all.keys('body.field.type');
    });

    it('matches members in turn when a tag value repeats across members', () => {
      const models: TsoaRoute.Models = { First: tagged(['A'], { a: { dataType: 'double', required: true } }), Second: tagged(['A'], { b: { dataType: 'string', required: true } }) };
      const fieldErrors: FieldErrors = {};
      const result = new ValidationService(models, { noImplicitAdditionalProperties: 'throw-on-extras', bodyCoercion: false }).validateUnion(
        'field',
        { type: 'A', b: 'x' },
        fieldErrors,
        true,
        union('First', 'Second'),
      );
      expect({ result, fieldErrors }).to.deep.equal({ result: { type: 'A', b: 'x' }, fieldErrors: {} });
    });
  });

  describe('Intersection Validate', () => {
    describe('throw on extras', () => {
      it('should validate intersection with 3 or more types', () => {
        const refName = 'ExampleModel';
        const subSchemas: TsoaRoute.PropertySchema[] = [{ ref: 'TypeAliasModel1' }, { ref: 'TypeAliasModel2' }, { ref: 'TypeAliasModelDateTime' }];
        const models: TsoaRoute.Models = {
          [refName]: {
            dataType: 'refObject',
            properties: {
              and: {
                dataType: 'intersection',
                subSchemas,
                required: true,
              },
            },
          },
          TypeAliasModel1: {
            dataType: 'refObject',
            properties: {
              value1: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          TypeAliasModel2: {
            dataType: 'refObject',
            properties: {
              value2: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          TypeAliasModelDateTime: {
            dataType: 'refObject',
            properties: {
              dateTimeValue: { dataType: 'datetime', required: true },
            },
            additionalProperties: false,
          },
          TypeAliasModelDate: {
            dataType: 'refObject',
            properties: {
              dateValue: { dataType: 'date', required: true },
            },
            additionalProperties: false,
          },
        };
        const v = new ValidationService(models, {
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        });
        const errorDictionary: FieldErrors = {};
        const dataToValidate: TypeAliasModel1 & TypeAliasModel2 & TypeAliasDateTime = {
          value1: 'this is value 1',
          value2: 'this is value 2',
          dateTimeValue: '2017-01-01T00:00:00' as unknown as Date,
        };

        // Act
        const name = 'dataToValidate';
        const validatedData = v.validateIntersection('and', dataToValidate, errorDictionary, true, subSchemas, name + '.');

        // Assert
        const expectedValues = { ...dataToValidate, dateTimeValue: new Date('2017-01-01T00:00:00') };
        expect(errorDictionary).to.deep.equal({});
        expect(validatedData).to.deep.equal(expectedValues);

        const errorDictionary2: FieldErrors = {};
        const dataToValidate2: TypeAliasModel1 & TypeAliasModel2 & TypeAliasDateTime & TypeAliasDate = {
          ...dataToValidate,
          dateValue: '2017-01-01' as unknown as Date,
        };

        const subSchemas2 = subSchemas.concat([{ ref: 'TypeAliasModelDate' }]);
        const validatedData2 = v.validateIntersection('and', dataToValidate2, errorDictionary2, true, subSchemas2, name + '.');

        const expectedValues2 = { ...expectedValues, dateValue: new Date('2017-01-01') };
        expect(errorDictionary2).to.deep.equal({});
        expect(validatedData2).to.deep.equal(expectedValues2);
      });

      it('should validate intersection of one union', () => {
        const withUnionsName = 'withUnions';
        const withUnionsSubSchemas = [{ ref: 'ServiceObject' }, { ref: 'BigUnion' }];
        const WithUnionModels: TsoaRoute.Models = {
          [withUnionsName]: {
            dataType: 'refObject',
            properties: {
              unions: {
                dataType: 'intersection',
                subSchemas: withUnionsSubSchemas,
                required: true,
              },
            },
          },
          ServiceObject: {
            dataType: 'refObject',
            properties: {
              service: { dataType: 'enum', enums: ['23'], required: false },
            },
          },
          BigUnion: {
            dataType: 'refAlias',
            type: {
              dataType: 'union',
              subSchemas: [{ ref: 'Union1' }, { ref: 'Union2' }, { ref: 'Union3' }],
            },
          },
          Union1: {
            dataType: 'refObject',
            properties: {
              model: { dataType: 'string', required: true },
              barcode_format: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          Union2: {
            dataType: 'refObject',
            properties: {
              model: { dataType: 'string', required: true },
              barcode_format: { dataType: 'string', required: true },
              aProperty: { dataType: 'string', required: true },
            },
          },
          Union3: {
            dataType: 'refObject',
            properties: {
              model: { dataType: 'string', required: true },
              aAnotherProperty: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
        };
        const withUnionValidationService = new ValidationService(WithUnionModels, {
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        });
        const withUnionDataToValidate1 = {
          model: 'model1',
          service: '23',
        };
        const withUnionErrorDictionary1 = {};

        withUnionValidationService.validateIntersection('union', withUnionDataToValidate1, withUnionErrorDictionary1, true, withUnionsSubSchemas, withUnionsName + '.');

        // Assert
        expect(withUnionErrorDictionary1).to.deep.equal({
          'withUnions.union': {
            message: `Could not match the intersection against every type. Issues: [{"withUnions.union":{"message":"Could not match the union against any of the items. Issues: [{\\"withUnions.union.barcode_format\\":{\\"message\\":\\"'barcode_format' is required\\"}},{\\"withUnions.union.barcode_format\\":{\\"message\\":\\"'barcode_format' is required\\"},\\"withUnions.union.aProperty\\":{\\"message\\":\\"'aProperty' is required\\"}},{\\"withUnions.union.aAnotherProperty\\":{\\"message\\":\\"'aAnotherProperty' is required\\"}}]","value":{"model":"model1","service":"23"}}}]`,
            value: withUnionDataToValidate1,
          },
        });

        const withUnionDataToValidate2 = {
          model: 'model2',
          barcode_format: 'none',
          aProperty: 'blabla',
          service: '23',
        };
        const withUnionErrorDictionary2 = {};

        const validatedResult2 = withUnionValidationService.validateIntersection('union', withUnionDataToValidate2, withUnionErrorDictionary2, true, withUnionsSubSchemas, withUnionsName + '.');

        // Assert
        expect(withUnionErrorDictionary2).to.deep.equal({});
        expect(validatedResult2).to.deep.equal(withUnionDataToValidate2);

        const withUnionDataToValidate3 = {
          model: 'model3',
          aAnotherProperty: 'blabla',
          service: '23',
        };
        const withUnionErrorDictionary3 = {};

        const validatedResult3 = withUnionValidationService.validateIntersection('union', withUnionDataToValidate3, withUnionErrorDictionary3, true, withUnionsSubSchemas, withUnionsName + '.');

        // Assert
        expect(withUnionErrorDictionary3).to.deep.equal({});
        expect(validatedResult3).to.deep.equal(withUnionDataToValidate3);
      });

      it('should validate intersection of 3+ unions', () => {
        const refName = 'ExampleModel';
        const subSchemas = [{ ref: 'TypeAliasUnion1' }, { ref: 'TypeAliasUnion2' }, { ref: 'TypeAliasUnion3' }];
        const models: TsoaRoute.Models = {
          [refName]: {
            dataType: 'refObject',
            properties: {
              and: {
                dataType: 'intersection',
                subSchemas,
                required: true,
              },
            },
          },
          TypeAliasUnion1: {
            dataType: 'refAlias',
            type: {
              dataType: 'union',
              subSchemas: [{ ref: 'UnionModel1a' }, { ref: 'UnionModel1b' }],
            },
          },
          TypeAliasUnion2: {
            dataType: 'refAlias',
            type: {
              dataType: 'union',
              subSchemas: [{ ref: 'UnionModel2a' }, { ref: 'UnionModel2b' }],
            },
          },
          TypeAliasUnion3: {
            dataType: 'refAlias',
            type: {
              dataType: 'union',
              subSchemas: [{ ref: 'UnionModel3a' }, { ref: 'UnionModel3b' }],
            },
          },
          UnionModel1a: {
            dataType: 'refObject',
            properties: {
              value1a: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          UnionModel1b: {
            dataType: 'refObject',
            properties: {
              value1a: { dataType: 'boolean', required: true },
              value1b: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          UnionModel2a: {
            dataType: 'refObject',
            properties: {
              value2a: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          UnionModel2b: {
            dataType: 'refObject',
            properties: {
              value2b: { dataType: 'string', required: true },
            },
            additionalProperties: false,
          },
          UnionModel3a: {
            dataType: 'refObject',
            properties: {
              dateTimeValue: { dataType: 'datetime', required: true },
            },
            additionalProperties: false,
          },
          UnionModel3b: {
            dataType: 'refObject',
            properties: {
              dateValue: { dataType: 'date', required: true },
            },
            additionalProperties: false,
          },
        };
        const v = new ValidationService(models, {
          noImplicitAdditionalProperties: 'throw-on-extras',
          bodyCoercion: true,
        });

        // Validate all schema combinations
        const validInputs = [
          {
            input: { value1a: 'value 1a', value2a: 'value 2a', dateTimeValue: '2017-01-01T00:00:00' },
            output: { value1a: 'value 1a', value2a: 'value 2a', dateTimeValue: new Date('2017-01-01T00:00:00') },
          },
          {
            input: { value1a: 'value 1a', value2a: 'value 2a', dateValue: '2017-01-01' },
            output: { value1a: 'value 1a', value2a: 'value 2a', dateValue: new Date('2017-01-01') },
          },
          {
            input: { value1a: 'value 1a', value2b: 'value 2b', dateTimeValue: '2017-01-01T00:00:00' },
            output: { value1a: 'value 1a', value2b: 'value 2b', dateTimeValue: new Date('2017-01-01T00:00:00') },
          },
          {
            input: { value1a: 'value 1a', value2b: 'value 2b', dateValue: '2017-01-01' },
            output: { value1a: 'value 1a', value2b: 'value 2b', dateValue: new Date('2017-01-01') },
          },
          {
            input: { value1a: false, value1b: 'value 1b', value2a: 'value 2a', dateTimeValue: '2017-01-01T00:00:00' },
            output: { value1a: false, value1b: 'value 1b', value2a: 'value 2a', dateTimeValue: new Date('2017-01-01T00:00:00') },
          },
          {
            input: { value1a: false, value1b: 'value 1b', value2a: 'value 2a', dateValue: '2017-01-01' },
            output: { value1a: false, value1b: 'value 1b', value2a: 'value 2a', dateValue: new Date('2017-01-01') },
          },
          {
            input: { value1a: false, value1b: 'value 1b', value2b: 'value 2b', dateTimeValue: '2017-01-01T00:00:00' },
            output: { value1a: false, value1b: 'value 1b', value2b: 'value 2b', dateTimeValue: new Date('2017-01-01T00:00:00') },
          },
          {
            input: { value1a: false, value1b: 'value 1b', value2b: 'value 2b', dateValue: '2017-01-01' },
            output: { value1a: false, value1b: 'value 1b', value2b: 'value 2b', dateValue: new Date('2017-01-01') },
          },
        ];

        for (let i = 0; i < validInputs.length; i++) {
          const { input, output } = validInputs[i];

          // Act
          const errorDictionary: FieldErrors = {};
          const validatedData = v.validateIntersection('and', input, errorDictionary, true, subSchemas, refName + '.');

          // Assert
          expect(errorDictionary, `validInputs[${i}] returned errors`).to.deep.equal({});
          expect(validatedData, `validInputs[${i}] did not match output`).to.deep.equal(output);
        }

        // Invalid inputs
        const invalidDataTypes: any[] = [];
        const excessProperties: any[] = [];
        const missingRequiredProperties: any[] = [];

        for (const validInput of validInputs) {
          // Invalid datatype per key
          for (const key in validInput.input) {
            invalidDataTypes.push({ ...validInput.input, [key]: 123 });
          }

          // Excess properties
          excessProperties.push({ ...validInput.input, excessProperty: 'excess' });

          // Missing required properties
          for (const key in validInput.input) {
            const invalidInput = { ...validInput.input };
            delete invalidInput[key];
            missingRequiredProperties.push(invalidInput);
          }
        }

        function testInvalidInputs(name: string, inputs: any[]) {
          for (let i = 0; i < inputs.length; i++) {
            const invalidInput = inputs[i];

            // Act
            const errorDictionary: FieldErrors = {};
            const validatedData = v.validateIntersection('and', invalidInput, errorDictionary, true, subSchemas, refName + '.');

            // Assert
            expect(errorDictionary, `${name}[${i}] did not return errors`).to.not.deep.equal({});
            expect(validatedData, `${name}[${i}] returned data`).to.equal(undefined);
          }
        }

        testInvalidInputs('invalidDataTypes', invalidDataTypes);
        testInvalidInputs('excessProperties', excessProperties);
        testInvalidInputs('missingRequiredProperties', missingRequiredProperties);
      });
    });
  });

  describe('undefined validate', () => {
    const replacer = (key, value) => (typeof value === 'undefined' ? null : value);

    it('returns undefined when not optional', () => {
      const value = undefined;
      const propertySchema: TsoaRoute.PropertySchema = { dataType: 'undefined', required: true, validators: {} };
      const fieldErrors: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).ValidateParam(propertySchema, value, 'defaultProp', fieldErrors, true, undefined);
      expect(Object.keys(fieldErrors)).to.be.empty;
      expect(result).to.be.undefined;
    });

    it('fail if value required and not undefined', () => {
      const value = 'undefined';
      const propertySchema: TsoaRoute.PropertySchema = { dataType: 'undefined', required: true, validators: {} };
      const fieldErrors: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).ValidateParam(propertySchema, value, 'defaultProp', fieldErrors, true, undefined);
      expect(Object.keys(fieldErrors)).to.not.be.empty;
      expect(result).to.be.undefined;
    });

    it('should not return undefined when optional inside object', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        properties: {
          a: { dataType: 'undefined' },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      );
      const error = {};
      const result = v.validateModel({ name: '', value: {}, modelDefinition, fieldErrors: error, isBodyParam: true });
      expect(Object.keys(error)).to.be.empty;
      // use JSON strngify to allow comparison of undefined values
      expect(JSON.stringify(result, replacer)).to.equal(JSON.stringify(result));
    });

    it('should return undefined when required in object', () => {
      const modelDefinition: TsoaRoute.ModelSchema = {
        dataType: 'refObject',
        properties: {
          a: { dataType: 'undefined', required: true },
        },
      };
      const v = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      );
      const error = {};
      const result = v.validateModel({ name: '', value: {}, modelDefinition, fieldErrors: error, isBodyParam: true });
      expect(Object.keys(error)).to.be.empty;
      // use JSON strngify to allow comparison of undefined values
      expect(JSON.stringify(result, replacer)).to.equal(JSON.stringify({ a: undefined }, replacer));
    });

    it('fail if value optional and not undefined', () => {
      const value = 'undefined';
      const propertySchema: TsoaRoute.PropertySchema = { dataType: 'undefined', required: false, validators: {} };
      const fieldErrors: FieldErrors = {};
      const result = new ValidationService(
        {},
        {
          noImplicitAdditionalProperties: 'ignore',
          bodyCoercion: true,
        },
      ).ValidateParam(propertySchema, value, 'defaultProp', fieldErrors, true, undefined);
      expect(Object.keys(fieldErrors)).to.not.be.empty;
      expect(result).to.be.undefined;
    });
  });

  describe('Circular reference handling', () => {
    it('should report a self-referencing refAlias instead of overflowing the stack', () => {
      const models: TsoaRoute.Models = {
        RecursiveType: {
          dataType: 'refAlias',
          type: { ref: 'RecursiveType' },
        },
      };

      const v = new ValidationService(models, {
        noImplicitAdditionalProperties: 'ignore',
        bodyCoercion: true,
      });

      const fieldErrors: FieldErrors = {};

      const result = v.validateModel({
        name: '',
        value: { some: 'data' },
        modelDefinition: models.RecursiveType,
        fieldErrors,
        isBodyParam: true,
      });

      expect(result).to.be.undefined;
      expect(fieldErrors).to.deep.equal({ '': { message: `circular reference to 'RecursiveType' cannot be validated` } });
    });

    it('should reject a value matching no branch of a union that recurses through a coerced array', () => {
      const models: TsoaRoute.Models = {
        Tree: {
          dataType: 'refAlias',
          type: { dataType: 'union', subSchemas: [{ dataType: 'string' }, { dataType: 'array', array: { ref: 'Tree' } }] },
        },
      };
      const fieldErrors: FieldErrors = {};

      const result = new ValidationService(models, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).ValidateParam(
        { ref: 'Tree', required: true },
        { unexpected: true },
        'body',
        fieldErrors,
        true,
      );

      expect(result).to.be.undefined;
      expect(fieldErrors).to.have.all.keys('body');
    });

    it('should report a schema loop through an intersection instead of overflowing the stack', () => {
      const models: TsoaRoute.Models = {
        Loop: {
          dataType: 'refAlias',
          type: { dataType: 'intersection', subSchemas: [{ ref: 'Loop' }, { dataType: 'nestedObjectLiteral', nestedProperties: {} }] },
        },
      };
      const fieldErrors: FieldErrors = {};

      const result = new ValidationService(models, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true }).ValidateParam(
        { ref: 'Loop', required: true },
        { a: 1 },
        'body',
        fieldErrors,
        true,
      );

      expect(result).to.be.undefined;
      expect(JSON.stringify(fieldErrors)).to.include(`circular reference to 'Loop' cannot be validated`);
    });

    it('should report a value that contains itself', () => {
      const models: TsoaRoute.Models = {
        Category: {
          dataType: 'refObject',
          properties: { children: { dataType: 'array', array: { ref: 'Category' }, required: true } },
          additionalProperties: false,
        },
      };
      const value: { children: unknown[] } = { children: [] };
      value.children.push(value);
      const fieldErrors: FieldErrors = {};

      const result = new ValidationService(models, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false }).ValidateParam(
        { ref: 'Category', required: true },
        value,
        'body',
        fieldErrors,
        true,
      );

      expect(result).to.be.undefined;
      expect(fieldErrors['body.children.$0'].message).to.equal(`circular reference to 'Category' cannot be validated`);
    });

    it('should handle deeply nested circular references', () => {
      const models: TsoaRoute.Models = {
        Widget: {
          dataType: 'refAlias',
          type: {
            dataType: 'union',
            subSchemas: [{ ref: 'Container' }, { ref: 'Wrapper' }],
          },
        },
        Container: {
          dataType: 'refObject',
          properties: {
            type: { dataType: 'string', required: true },
            items: {
              dataType: 'array',
              array: { ref: 'Widget' },
              required: true,
            },
          },
        },
        Wrapper: {
          dataType: 'refObject',
          properties: {
            type: { dataType: 'string', required: true },
            content: {
              ref: 'Widget',
              required: true,
            },
          },
        },
      };

      const v = new ValidationService(models, {
        noImplicitAdditionalProperties: 'ignore',
        bodyCoercion: true,
      });

      const fieldErrors: FieldErrors = {};

      const value = {
        type: 'container',
        items: [
          {
            type: 'wrapper',
            content: {
              type: 'nested-container',
              items: [
                {
                  type: 'deeply-nested-wrapper',
                  content: {
                    type: 'deeply-nested-container',
                    items: [],
                  },
                },
              ],
            },
          },
        ],
      };

      const result = v.validateModel({
        name: '',
        value,
        modelDefinition: models.Container,
        fieldErrors,
        isBodyParam: true,
      });

      expect(result).to.exist;
      expect(result.type).to.equal('container');
    });

    it('should handle circular references with arrays', () => {
      const models: TsoaRoute.Models = {
        Node: {
          dataType: 'refObject',
          properties: {
            id: { dataType: 'string', required: true },
            children: {
              dataType: 'array',
              array: { ref: 'Node' },
              required: false,
            },
          },
        },
      };

      const v = new ValidationService(models, {
        noImplicitAdditionalProperties: 'ignore',
        bodyCoercion: true,
      });

      const fieldErrors: FieldErrors = {};

      const value = {
        id: 'root',
        children: [
          {
            id: 'child1',
            children: [
              {
                id: 'grandchild1',
              },
            ],
          },
          {
            id: 'child2',
          },
        ],
      };

      const result = v.validateModel({
        name: '',
        value,
        modelDefinition: models.Node,
        fieldErrors,
        isBodyParam: true,
      });

      expect(result).to.exist;
      expect(result.id).to.equal('root');
      expect(result.children).to.have.lengthOf(2);
    });

    it('should properly fail validation for invalid data in circular types', () => {
      const models: TsoaRoute.Models = {
        Node: {
          dataType: 'refObject',
          properties: {
            id: { dataType: 'string', required: true },
            value: { dataType: 'integer', required: true },
            children: {
              dataType: 'array',
              array: { ref: 'Node' },
              required: false,
            },
          },
        },
      };

      const v = new ValidationService(models, {
        noImplicitAdditionalProperties: 'throw-on-extras',
        bodyCoercion: true,
      });

      const fieldErrors: FieldErrors = {};

      const value = {
        id: 'root',
        value: 1,
        children: [
          {
            value: 2,
            children: [
              {
                id: 'grandchild1',
                value: 3,
              },
            ],
          },
          {
            id: 'child2',
            value: 'not-a-number',
          },
        ],
      };

      const result = v.validateModel({
        name: '',
        value,
        modelDefinition: models.Node,
        fieldErrors,
        isBodyParam: true,
      });

      expect(Object.keys(fieldErrors)).to.not.be.empty;
      expect(fieldErrors).to.have.property('children.$0.id');
      expect(fieldErrors['children.$0.id'].message).to.include('required');
      expect(fieldErrors).to.have.property('children.$1.value');
      expect(fieldErrors['children.$1.value'].message).to.include('integer');
      expect(result).to.be.undefined;
    });

    it('should detect validation errors in deeply nested circular structures', () => {
      const models: TsoaRoute.Models = {
        Widget: {
          dataType: 'refAlias',
          type: {
            dataType: 'union',
            subSchemas: [{ ref: 'Container' }, { ref: 'Wrapper' }],
          },
        },
        Container: {
          dataType: 'refObject',
          properties: {
            type: { dataType: 'string', required: true },
            items: {
              dataType: 'array',
              array: { ref: 'Widget' },
              required: true,
            },
          },
        },
        Wrapper: {
          dataType: 'refObject',
          properties: {
            type: { dataType: 'string', required: true },
            content: {
              ref: 'Widget',
              required: true,
            },
          },
        },
      };

      const v = new ValidationService(models, {
        noImplicitAdditionalProperties: 'throw-on-extras',
        bodyCoercion: true,
      });

      const fieldErrors: FieldErrors = {};

      const value = {
        type: 'container',
        items: [
          {
            content: {
              type: 'nested-container',
              items: [],
            },
          },
        ],
      };

      const result = v.validateModel({
        name: '',
        value,
        modelDefinition: models.Container,
        fieldErrors,
        isBodyParam: true,
      });

      expect(Object.keys(fieldErrors)).to.not.be.empty;
      expect(result).to.be.undefined;
    });
  });

  describe('Own "__proto__" key', () => {
    const models: TsoaRoute.Models = {
      A: { dataType: 'refObject', properties: { kind: { dataType: 'enum', enums: ['a'], required: true } }, additionalProperties: false },
      B: { dataType: 'refObject', properties: { kind: { dataType: 'enum', enums: ['b'], required: true } }, additionalProperties: false },
      StringRecord: { dataType: 'refObject', properties: {}, additionalProperties: { dataType: 'string' } },
      AnyRecord: { dataType: 'refObject', properties: {}, additionalProperties: { dataType: 'any' } },
      Open: { dataType: 'refObject', properties: { kind: { dataType: 'string', required: true } } },
    };
    const unionOf = (...refs: string[]): TsoaRoute.PropertySchema => ({ dataType: 'union', subSchemas: refs.map(ref => ({ ref })) });
    const removing = () => new ValidationService(models, { noImplicitAdditionalProperties: 'silently-remove-extras', bodyCoercion: true });
    const throwing = () => new ValidationService(models, { noImplicitAdditionalProperties: 'throw-on-extras', bodyCoercion: true });
    const expectPlainObject = (result: Record<string, unknown>) => {
      expect(Object.getPrototypeOf(result)).to.equal(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).to.be.false;
      expect(result.isAdmin).to.be.undefined;
    };

    it('should remove it from the matching union member', () => {
      const errors: FieldErrors = {};

      const result = removing().validateUnion('body', JSON.parse('{"kind":"a","__proto__":{"isAdmin":true}}'), errors, true, unionOf('A', 'B'));

      expect(errors).to.deep.equal({});
      expect(result).to.deep.equal({ kind: 'a' });
      expectPlainObject(result);
    });

    it('should report it as an excess property of a union member with throw-on-extras', () => {
      const errors: FieldErrors = {};

      const result = throwing().validateUnion('body', JSON.parse('{"kind":"a","__proto__":{"isAdmin":true}}'), errors, true, unionOf('A', 'B'));

      expect(result).to.be.undefined;
      expect(errors).to.have.all.keys('body.__proto__');
    });

    it('should remove it from a record model inside a union', () => {
      const errors: FieldErrors = {};

      const stringResult = removing().validateUnion('body', JSON.parse('{"a":"b","__proto__":"x"}'), errors, true, unionOf('StringRecord'));
      const anyResult = removing().validateUnion('body', JSON.parse('{"a":"b","__proto__":{"isAdmin":true}}'), errors, true, unionOf('AnyRecord'));

      expect(errors).to.deep.equal({});
      expect(stringResult).to.deep.equal({ a: 'b' });
      expect(anyResult).to.deep.equal({ a: 'b' });
      expectPlainObject(stringResult);
      expectPlainObject(anyResult);
    });

    it('should remove it from a model with default additional properties', () => {
      const errors: FieldErrors = {};

      const result = removing().validateModel({
        name: 'body',
        value: JSON.parse('{"kind":"a","other":1,"__proto__":{"isAdmin":true}}'),
        modelDefinition: models.Open,
        fieldErrors: errors,
        isBodyParam: true,
      });

      expect(errors).to.deep.equal({});
      expect(result).to.deep.equal({ kind: 'a', other: 1 });
      expectPlainObject(result);
    });

    it('should report it as an excess property of a record model with throw-on-extras', () => {
      const errors: FieldErrors = {};

      const result = throwing().validateModel({ name: 'body', value: JSON.parse('{"a":"b","__proto__":"x"}'), modelDefinition: models.StringRecord, fieldErrors: errors, isBodyParam: true });

      expect(result).to.be.undefined;
      expect(errors).to.deep.equal({ 'body.__proto__': { message: '"__proto__" is an excess property and therefore is not allowed', value: '__proto__' } });
    });

    it('should treat it as an excess property of a nested object literal with additionalProperties', () => {
      const nestedProperties: { [name: string]: TsoaRoute.PropertySchema } = { kind: { dataType: 'string', required: true } };
      const removeErrors: FieldErrors = {};
      const throwErrors: FieldErrors = {};

      const removed = removing().validateNestedObjectLiteral('body', JSON.parse('{"kind":"a","__proto__":"x"}'), removeErrors, true, nestedProperties, { dataType: 'string' }, '');
      const thrown = throwing().validateNestedObjectLiteral('body', JSON.parse('{"kind":"a","__proto__":"x"}'), throwErrors, true, nestedProperties, { dataType: 'string' }, '');

      expect(removeErrors).to.deep.equal({});
      expect(removed).to.deep.equal({ kind: 'a' });
      expectPlainObject(removed);
      expect(thrown).to.be.undefined;
      expect(throwErrors.body.message).to.equal('"__proto__" is an excess property and therefore is not allowed');
    });

    it('should not change the prototype when additional properties are ignored', () => {
      const v = new ValidationService(models, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });
      const errors: FieldErrors = {};

      const result = v.validateModel({ name: 'body', value: JSON.parse('{"a":"b","__proto__":{"isAdmin":true}}'), modelDefinition: models.AnyRecord, fieldErrors: errors, isBodyParam: true });

      expect(errors).to.deep.equal({});
      expect(Object.getPrototypeOf(result)).to.equal(Object.prototype);
      expect(result.isAdmin).to.be.undefined;
    });

    it('should validate its value against the additional properties when additional properties are ignored', () => {
      const v = new ValidationService(models, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false });
      const modelErrors: FieldErrors = {};
      const literalErrors: FieldErrors = {};

      const model = v.validateModel({ name: 'body', value: JSON.parse('{"a":"b","__proto__":{"isAdmin":true}}'), modelDefinition: models.StringRecord, fieldErrors: modelErrors, isBodyParam: true });
      const literal = v.validateNestedObjectLiteral('body', JSON.parse('{"__proto__":{"isAdmin":true}}'), literalErrors, true, {}, { dataType: 'string' }, '');

      expect(model).to.be.undefined;
      expect(modelErrors['body.__proto__'].message).to.equal('No matching model found in additionalProperties to validate __proto__');
      expect(literal).to.be.undefined;
      expect(literalErrors['body.__proto__'].message).to.equal('invalid string value');
    });

    it('should keep other additional properties untouched', () => {
      const errors: FieldErrors = {};

      const result = removing().validateUnion('body', { a: 'b', constructor: 'c', prototype: 'd' }, errors, true, unionOf('StringRecord'));

      expect(errors).to.deep.equal({});
      expect(result).to.deep.equal({ a: 'b', constructor: 'c', prototype: 'd' });
    });
  });

  describe('Buffer validate', () => {
    const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false });

    it('should convert strings, buffers and byte arrays', () => {
      expect(v.validateBuffer('b', 'text', {})?.toString()).to.equal('text');
      expect(v.validateBuffer('b', Buffer.from('raw'), {})?.toString()).to.equal('raw');
      expect(v.validateBuffer('b', [104, 105], {})?.toString()).to.equal('hi');
      expect(v.validateBuffer('b', Buffer.from('hi').toJSON(), {})?.toString()).to.equal('hi');
    });

    for (const [label, value] of [
      ['an object with a length', { length: 1e9 }],
      ['a number', 5],
      ['an array holding a non-byte', [256]],
      ['the JSON form of a buffer holding a non-byte', { type: 'Buffer', data: [256] }],
      ['the JSON form of a buffer holding an object with a length', { type: 'Buffer', data: { length: 1e9 } }],
    ] as const) {
      it(`should report ${label} as a field error`, () => {
        const errors: FieldErrors = {};

        expect(v.validateBuffer('b', value, errors, 'body.')).to.be.undefined;
        expect(errors['body.b'].message).to.equal('invalid buffer value');
      });
    }
  });

  describe('Enum coercion', () => {
    it('should not match an array against a member when coercing a non-body value', () => {
      const errors: FieldErrors = {};
      const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });

      expect(v.validateEnum('role', ['admin'], errors, ['admin', 'user'])).to.be.undefined;
      expect(errors.role).to.exist;
    });
  });

  describe('Summarized errors', () => {
    it('should truncate an oversized value on a union error', () => {
      const errors: FieldErrors = {};
      const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false, maxValidationErrorSize: 50 });
      const subSchemas: TsoaRoute.PropertySchema[] = [{ dataType: 'integer' }, { dataType: 'boolean' }];

      v.validateUnion('body', 'x'.repeat(500), errors, true, { dataType: 'union', subSchemas });

      expect(errors.body.value).to.equal(`${'x'.repeat(50)}...`);
    });

    it('should keep a value that fits on a union error', () => {
      const errors: FieldErrors = {};
      const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: false });
      const subSchemas: TsoaRoute.PropertySchema[] = [{ dataType: 'integer' }, { dataType: 'boolean' }];

      v.validateUnion('body', 'short', errors, true, { dataType: 'union', subSchemas });

      expect(errors.body.value).to.equal('short');
    });
  });

  describe('uniqueItems', () => {
    it('should reject repeated values and keep distinct ones', () => {
      const v = new ValidationService({}, { noImplicitAdditionalProperties: 'ignore', bodyCoercion: true });
      const repeated: FieldErrors = {};

      expect(v.validateArray('name', ['a', 'a'], repeated, true, { dataType: 'string' }, { uniqueItems: {} })).to.be.undefined;
      expect(repeated.name.message).to.equal('required unique array');
      expect(v.validateArray('name', ['a', 'b'], {}, true, { dataType: 'string' }, { uniqueItems: {} })).to.deep.equal(['a', 'b']);
    });
  });
});
