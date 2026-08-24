import { Request as ExRequest, Response as ExResponse, NextFunction as ExNext } from 'express';

import { Controller } from '../../../interfaces/controller';
import { FieldErrors } from '../../templateHelpers';
import { TsoaRoute } from '../../tsoa-route';
import { ValidateError } from '../../templateHelpers';
import { TemplateService } from '../templateService';
import { Readable, pipeline } from 'node:stream';

type ExpressApiHandlerParameters = {
  methodName: string;
  controller: Controller | object;
  response: ExResponse;
  next: ExNext;
  validatedArgs: any[];
  successStatus?: number;
};

type ExpressValidationArgsParameters = {
  args: Record<string, TsoaRoute.ParameterSchema>;
  request: ExRequest;
  response: ExResponse;
};

type ExpressReturnHandlerParameters = {
  response: ExResponse;
  headers: any;
  statusCode?: number;
  data?: any;
  next?: ExNext;
};

export class ExpressTemplateService extends TemplateService<ExpressApiHandlerParameters, ExpressValidationArgsParameters, ExpressReturnHandlerParameters> {
  /**
   * The generated routes build one `args` object per route at registration time and hand
   * back that same object on every request, so the parameter list derived from it is stable
   * and worth caching. A caller that builds a fresh object per request simply never hits.
   */
  private static readonly parameterLists = new WeakMap<object, TsoaRoute.ParameterSchema[]>();

  private getParameters(args: Record<string, TsoaRoute.ParameterSchema>): TsoaRoute.ParameterSchema[] {
    let parameters = ExpressTemplateService.parameterLists.get(args);

    if (!parameters) {
      parameters = Object.values(args);
      ExpressTemplateService.parameterLists.set(args, parameters);
    }

    return parameters;
  }

  async apiHandler(params: ExpressApiHandlerParameters) {
    const { methodName, controller, response, validatedArgs, successStatus, next } = params;

    try {
      const data = await this.buildPromise(methodName, controller, validatedArgs);
      let statusCode = successStatus;
      let headers;
      if (this.isController(controller)) {
        headers = controller.getHeaders();
        statusCode = controller.getStatus() || statusCode;
      }

      this.returnHandler({ response, headers, statusCode, data, next });
    } catch (error) {
      return next(error);
    }
  }

  getValidatedArgs(params: ExpressValidationArgsParameters): any[] {
    const { args, request, response } = params;

    const fieldErrors: FieldErrors = {};
    const values = this.getParameters(args).map(param => {
      const name = param.name;
      switch (param.in) {
        case 'request':
          return request;
        case 'request-prop': {
          const descriptor = Object.getOwnPropertyDescriptor(request, name);
          const value = descriptor ? descriptor.value : undefined;
          return this.validationService.ValidateParam(param, value, name, fieldErrors, false, undefined);
        }
        case 'query':
          return this.validationService.ValidateParam(param, request.query[name], name, fieldErrors, false, undefined);
        case 'queries':
          return this.validationService.ValidateParam(param, request.query, name, fieldErrors, false, undefined);
        case 'path':
          return this.validationService.ValidateParam(param, request.params[name], name, fieldErrors, false, undefined);
        case 'header':
          return this.validationService.ValidateParam(param, request.header(name), name, fieldErrors, false, undefined);
        case 'body': {
          const bodyFieldErrors: FieldErrors = {};
          const bodyArgs = this.validationService.ValidateParam(param, this.normalizeRequestBody(request.body), name, bodyFieldErrors, true, undefined);
          Object.keys(bodyFieldErrors).forEach(key => {
            fieldErrors[key] = { message: bodyFieldErrors[key].message };
          });
          return bodyArgs;
        }
        case 'body-prop': {
          const bodyPropFieldErrors: FieldErrors = {};
          const bodyPropArgs = this.validationService.ValidateParam(param, request.body?.[name], name, bodyPropFieldErrors, true, 'body.');
          Object.keys(bodyPropFieldErrors).forEach(key => {
            fieldErrors[key] = { message: bodyPropFieldErrors[key].message };
          });
          return bodyPropArgs;
        }
        case 'formData': {
          const files = this.getParameters(args).filter(p => p.dataType === 'file' || (p.dataType === 'array' && p.array && p.array.dataType === 'file'));
          if ((param.dataType === 'file' || (param.dataType === 'array' && param.array && param.array.dataType === 'file')) && files.length > 0) {
            const requestFiles = request.files as { [fileName: string]: Express.Multer.File[] } | undefined;

            const fileArgs = this.validationService.ValidateParam(param, requestFiles?.[name], name, fieldErrors, false, undefined);
            if (param.dataType === 'array') {
              return fileArgs;
            }
            return Array.isArray(fileArgs) && fileArgs.length === 1 ? fileArgs[0] : fileArgs;
          }
          return this.validationService.ValidateParam(param, request.body?.[name], name, fieldErrors, false, undefined);
        }
        case 'res':
          return (status: number | undefined, data: any, headers: any) => {
            // request.next is express's own handle on the middleware chain; getValidatedArgs
            // is not handed one.
            this.returnHandler({ response, headers, statusCode: status, data, next: request.next });
          };
      }
    });

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidateError(fieldErrors, '');
    }
    return values;
  }

  /**
   * body-parser represents an absent request body as an empty object, so an optional
   * `@Body()` would be validated against `{}` and fail on its required properties. A client
   * that posts `{}` is indistinguishable from one that posts nothing, so both read as absent.
   * Only a plain object counts - an empty array or buffer body is a body.
   */
  private normalizeRequestBody(body: unknown): unknown {
    if (typeof body !== 'object' || body === null) {
      return body;
    }

    const prototype = Object.getPrototypeOf(body);
    const isPlainObject = prototype === Object.prototype || prototype === null;

    return isPlainObject && Object.keys(body).length === 0 ? undefined : body;
  }

  protected returnHandler(params: ExpressReturnHandlerParameters) {
    const { response, statusCode, data, next } = params;
    let { headers } = params;
    headers = headers || {};

    if (response.headersSent) {
      return;
    }
    Object.keys(headers).forEach((name: string) => {
      response.set(name, headers[name]);
    });

    // Check if the response is marked to be JSON
    const isJsonResponse = response.get('Content-Type')?.includes('json') || false;

    if (data && typeof data.pipe === 'function' && data.readable && typeof data._read === 'function') {
      response.status(statusCode || 200);
      // pipeline, unlike pipe, destroys the response when the stream fails, so a failing
      // stream aborts the request instead of raising an unhandled error event.
      pipeline(data as Readable, response, error => {
        // A client that hangs up mid-stream is not an application error.
        if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          next?.(error);
        }
      });
    } else if (data !== undefined && (data !== null || isJsonResponse)) {
      // allow null response when it is a json response
      if (typeof data === 'number' || isJsonResponse) {
        // express treats number data as status code so use the json method instead
        // or if the response was marked as json then use the json so for example strings are quoted
        response.status(statusCode || 200).json(data);
      } else {
        // do not use json for every type since internally the send will invoke json if needed
        // but for string data it will not quote it, so we can send string as plain/text data
        response.status(statusCode || 200).send(data);
      }
    } else {
      response.status(statusCode || 204).end();
    }
  }
}
