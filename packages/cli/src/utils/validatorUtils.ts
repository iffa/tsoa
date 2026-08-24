import { Tsoa } from '@tsoa/runtime';
import * as ts from 'typescript';
import validator from 'validator';
import { GenerateMetadataError } from './../metadataGeneration/exceptions';
import { commentToString, getJSDocTags, parameterValidatorTagNames } from './jsDocUtils';

export function getParameterValidators(parameter: ts.ParameterDeclaration, parameterName: string): Tsoa.Validators {
  if (!parameter.parent) {
    return {};
  }

  const getCommentValue = (comment?: string) => comment && comment.split(' ')[0];

  const tags = getJSDocTags(parameter.parent, tag => {
    const { comment } = tag;
    return parameterValidatorTagNames.some(value => !!commentToString(comment) && value === tag.tagName.text && getCommentValue(commentToString(comment)) === parameterName);
  });

  function getErrorMsg(comment?: string, isValue = true) {
    if (!comment) {
      return;
    }
    if (isValue) {
      const indexOf = comment.indexOf(' ');
      if (indexOf > 0) {
        return comment.substr(indexOf + 1);
      } else {
        return undefined;
      }
    } else {
      return comment;
    }
  }

  return tags.reduce(
    (validateObj, tag) => {
      if (!tag.comment) {
        return validateObj;
      }

      const name = tag.tagName.text;
      const comment = commentToString(tag.comment)
        ?.substring((commentToString(tag.comment)?.indexOf(' ') || -1) + 1)
        .trim();
      const value = getCommentValue(comment);

      switch (name) {
        case 'uniqueItems':
          validateObj[name] = {
            errorMsg: getErrorMsg(comment, false),
            value: undefined,
          };
          break;
        case 'minimum':
        case 'maximum':
        case 'exclusiveMinimum':
        case 'exclusiveMaximum':
        case 'minItems':
        case 'maxItems':
        case 'minLength':
        case 'maxLength':
          if (isNaN(value as any)) {
            throw new GenerateMetadataError(`${name} parameter use number.`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(comment),
            value: Number(value),
          };
          break;
        case 'minDate':
        case 'maxDate':
          if (!validator.isISO8601(String(value), { strict: true })) {
            throw new GenerateMetadataError(`${name} parameter use date format ISO 8601 ex. 2017-05-14, 2017-05-14T05:18Z`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(comment),
            value,
          };
          break;
        case 'pattern': {
          const pattern = getPatternValueAndErrorMsg(comment);
          if (typeof pattern.value !== 'string') {
            throw new GenerateMetadataError(`${name} parameter use string.`);
          }
          validateObj[name] = {
            errorMsg: pattern.errorMsg,
            value: pattern.value,
          };
          break;
        }
        default:
          if (name.startsWith('is')) {
            const errorMsg = getErrorMsg(comment, false);
            if (errorMsg) {
              validateObj[name] = {
                errorMsg,
                value: undefined,
              };
            }
          }
          break;
      }
      return validateObj;
    },
    {} as Tsoa.Validators & { [unknown: string]: { errorMsg: string; value: undefined } },
  );
}

export function getPropertyValidators(property: ts.Node): Tsoa.Validators | undefined {
  const tags = getJSDocTags(property, tag => {
    return parameterValidatorTagNames.some(value => value === tag.tagName.text);
  });
  function getValue(comment?: string) {
    if (!comment) {
      return;
    }
    return comment.split(' ')[0];
  }
  function getFullValue(comment?: string) {
    if (!comment) {
      return;
    }
    if (comment.includes('\n')) {
      return comment.split('\n')[0];
    }
    return comment;
  }
  function getErrorMsg(comment?: string, isValue = true) {
    if (!comment) {
      return;
    }
    if (isValue) {
      const indexOf = comment.indexOf(' ');
      if (indexOf > 0) {
        return comment.substr(indexOf + 1);
      } else {
        return undefined;
      }
    } else {
      return comment;
    }
  }

  return tags.reduce(
    (validateObj, tag) => {
      const name = tag.tagName.text;
      const comment = tag.comment;
      const value = getValue(commentToString(comment));

      switch (name) {
        case 'uniqueItems':
          validateObj[name] = {
            errorMsg: getErrorMsg(commentToString(comment), false),
            value: undefined,
          };
          break;
        case 'minimum':
        case 'maximum':
        case 'exclusiveMinimum':
        case 'exclusiveMaximum':
        case 'minItems':
        case 'maxItems':
        case 'minLength':
        case 'maxLength':
          if (isNaN(value as any)) {
            throw new GenerateMetadataError(`${name} parameter use number.`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(commentToString(comment)),
            value: Number(value),
          };
          break;
        case 'minDate':
        case 'maxDate':
          if (!validator.isISO8601(String(value), { strict: true })) {
            throw new GenerateMetadataError(`${name} parameter use date format ISO 8601 ex. 2017-05-14, 2017-05-14T05:18Z`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(commentToString(comment)),
            value,
          };
          break;
        case 'pattern': {
          const pattern = getPatternValueAndErrorMsg(commentToString(comment));
          if (typeof pattern.value !== 'string') {
            throw new GenerateMetadataError(`${name} parameter use string.`);
          }
          validateObj[name] = {
            errorMsg: pattern.errorMsg,
            value: pattern.value,
          };
          break;
        }
        case 'title':
          if (typeof value !== 'string') {
            throw new GenerateMetadataError(`${name} parameter use string.`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(commentToString(comment)),
            value: getFullValue(commentToString(comment)),
          };
          break;
        default:
          if (name.startsWith('is')) {
            const errorMsg = getErrorMsg(commentToString(comment), false);
            if (errorMsg) {
              validateObj[name] = {
                errorMsg,
                value: undefined,
              };
            }
          }
          break;
      }
      return validateObj;
    },
    {} as Tsoa.Validators & { [unknown: string]: { errorMsg: string; value: undefined } },
  );
}

function removeSurroundingQuotes(str: string) {
  if (str.startsWith('`') && str.endsWith('`')) {
    return str.substring(1, str.length - 1);
  }
  if (str.startsWith('```') && str.endsWith('```')) {
    return str.substring(3, str.length - 3);
  }
  return str;
}

/**
 * Splits a `@pattern` annotation into its regular expression and its optional error
 * message. A plain annotation is split at the first space, so a pattern that matches a
 * literal space has to be written as a regular expression literal - `/^[a-z ]+$/` - which
 * is lexed here the way JavaScript lexes one: a `/` ends the literal unless it is escaped
 * or inside a character class.
 */
function getPatternValueAndErrorMsg(comment?: string): { errorMsg?: string; value?: string } {
  if (!comment) {
    return { errorMsg: undefined, value: undefined };
  }

  const trimmed = comment.trim();
  const literal = trimmed.startsWith('/') ? readRegExpLiteral(trimmed) : undefined;
  if (literal) {
    return { errorMsg: trimmed.substring(literal.length + 2).trim() || undefined, value: literal };
  }

  const [value, ...errorMsg] = trimmed.split(' ');
  return {
    errorMsg: errorMsg.join(' ') || undefined,
    value: removeSurroundingQuotes(value),
  };
}

/**
 * The body of a regular expression literal at the start of `text`, or undefined when the
 * literal is unterminated or is followed by something other than a space - `/etc/passwd`
 * is a pattern, not a literal.
 */
function readRegExpLiteral(text: string): string | undefined {
  let inCharacterClass = false;

  for (let index = 1; index < text.length; index++) {
    const character = text[index];
    if (character === '\\') {
      index++;
    } else if (character === '[') {
      inCharacterClass = true;
    } else if (character === ']') {
      inCharacterClass = false;
    } else if (character === '/' && !inCharacterClass) {
      const rest = text.substring(index + 1);
      return rest === '' || rest.startsWith(' ') ? text.substring(1, index) : undefined;
    }
  }

  return undefined;
}

export function shouldIncludeValidatorInSchema(key: string): key is Tsoa.SchemaValidatorKey {
  return !key.startsWith('is') && key !== 'minDate' && key !== 'maxDate';
}
