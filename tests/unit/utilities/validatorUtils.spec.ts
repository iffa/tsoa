import { expect } from 'chai';
import 'mocha';
import * as ts from 'typescript';
import { getParameterValidators, getPropertyValidators } from '@tsoa/cli/utils/validatorUtils';

describe('Validator JSDoc utilities', () => {
  describe('@pattern', () => {
    const patternOf = (annotation: string) => {
      const sourceFile = ts.createSourceFile(
        'validators.ts',
        `
          interface Model {
            /** ${annotation} */
            value: string;
          }
        `,
        ts.ScriptTarget.Latest,
        true,
      );
      const model = sourceFile.statements[0] as ts.InterfaceDeclaration;
      return getPropertyValidators(model.members[0])!.pattern;
    };

    it('splits a plain annotation at the first space', () => {
      expect(patternOf('@pattern ^[a-z]+$ only lowercase letters')).to.deep.equal({
        errorMsg: 'only lowercase letters',
        value: '^[a-z]+$',
      });
    });

    it('keeps literal spaces in a regular expression literal', () => {
      expect(patternOf('@pattern /^[a-zA-Z0-9 ]*$/')).to.deep.equal({
        errorMsg: undefined,
        value: '^[a-zA-Z0-9 ]*$',
      });
    });

    it('reads the error message that follows a regular expression literal', () => {
      expect(patternOf('@pattern /^[a-z ]+$/ letters and spaces only')).to.deep.equal({
        errorMsg: 'letters and spaces only',
        value: '^[a-z ]+$',
      });
    });

    it('does not end the literal on a slash inside a character class', () => {
      expect(patternOf('@pattern /^[a-z/ ]+$/ a path segment')).to.deep.equal({
        errorMsg: 'a path segment',
        value: '^[a-z/ ]+$',
      });
    });

    it('does not end the literal on an escaped slash', () => {
      expect(patternOf('@pattern /^\\/v1\\/[a-z]+$/ a versioned path')).to.deep.equal({
        errorMsg: 'a versioned path',
        value: '^\\/v1\\/[a-z]+$',
      });
    });

    it('treats a slash-prefixed pattern that is not a literal as a plain annotation', () => {
      expect(patternOf('@pattern /etc/passwd no config paths')).to.deep.equal({
        errorMsg: 'no config paths',
        value: '/etc/passwd',
      });
    });
  });

  describe('@pattern on a parameter', () => {
    const sourceFile = ts.createSourceFile(
      'validators.ts',
      `
        /** @pattern value /^[a-zA-Z0-9 ]*$/ letters, numbers and spaces */
        function validate(value: string) {}
      `,
      ts.ScriptTarget.Latest,
      true,
    );
    const validate = sourceFile.statements[0] as ts.FunctionDeclaration;

    it('keeps literal spaces in a regular expression literal', () => {
      expect(getParameterValidators(validate.parameters[0], 'value').pattern).to.deep.equal({
        errorMsg: 'letters, numbers and spaces',
        value: '^[a-zA-Z0-9 ]*$',
      });
    });
  });
});
