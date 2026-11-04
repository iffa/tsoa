import { Tsoa } from '@iffa/tsoa-runtime';
import * as ts from 'typescript';
import isISO8601 from 'validator/lib/isISO8601.js';
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
          if (!isISO8601(String(value), { strict: true })) {
            throw new GenerateMetadataError(`${name} parameter use date format ISO 8601 ex. 2017-05-14, 2017-05-14T05:18Z`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(comment),
            value,
          };
          break;
        case 'pattern':
          validateObj[name] = parsePattern(comment, tag);
          break;
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
          if (!isISO8601(String(value), { strict: true })) {
            throw new GenerateMetadataError(`${name} parameter use date format ISO 8601 ex. 2017-05-14, 2017-05-14T05:18Z`);
          }
          validateObj[name] = {
            errorMsg: getErrorMsg(commentToString(comment)),
            value,
          };
          break;
        case 'pattern':
          validateObj[name] = parsePattern(commentToString(comment), tag);
          break;
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

/**
 * Splits a `@pattern` annotation into its regular expression and its optional error
 * message, and rejects an expression JavaScript cannot compile. A plain annotation is split
 * at the first space, so a pattern that matches a literal space has to be wrapped: in
 * backticks or as a regular expression literal. See docs/patterns.md.
 */
function parsePattern(comment: string | undefined, tag: ts.Node): { errorMsg?: string; value: string } {
  if (!comment) {
    throw new GenerateMetadataError('pattern parameter use string.', tag);
  }

  const pattern = splitPattern(comment.trim());
  try {
    new RegExp(pattern.value);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GenerateMetadataError(`Invalid @pattern ${JSON.stringify(pattern.value)}. ${error.message}`, tag);
    }
    throw error;
  }
  return pattern;
}

function splitPattern(annotation: string): { errorMsg?: string; value: string } {
  const wrapped = annotation.startsWith('/') ? readRegExpLiteral(annotation) : readBacktickWrapper(annotation);
  if (wrapped) {
    return { errorMsg: annotation.substring(wrapped.length + 2).trim() || undefined, value: wrapped };
  }

  const [value, ...errorMsg] = annotation.split(' ');
  return {
    errorMsg: errorMsg.join(' ') || undefined,
    value: value.startsWith('`') && value.endsWith('`') ? value.substring(1, value.length - 1) : value,
  };
}

/**
 * The body of a single backtick pair at the start of `text`, or undefined when there is none.
 * The closing backtick is the first unescaped one followed by a space or the end of the
 * comment, and the pair stays on one line.
 */
function readBacktickWrapper(text: string): string | undefined {
  if (!text.startsWith('`') || text.startsWith('``')) {
    return undefined;
  }

  let escaped = false;
  for (let index = 1; index < text.length; index++) {
    const character = text[index];
    if (character === '\r' || character === '\n') {
      return undefined;
    }
    if (character === '`' && !escaped && (index + 1 === text.length || text[index + 1] === ' ')) {
      return text.substring(1, index);
    }
    escaped = character === '\\' && !escaped;
  }

  return undefined;
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
