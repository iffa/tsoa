import { Request as ExRequest, Response as ExResponse, NextFunction as ExNext } from 'express';

import { Controller } from '../../../interfaces/controller';
import { FieldErrors } from '../../templateHelpers';
import { TsoaRoute } from '../../tsoa-route';
import { ValidateError } from '../../templateHelpers';
import { TemplateService } from '../templateService';
import { Readable, finished } from 'node:stream';

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
          const bodyArgs = this.validationService.ValidateParam(param, this.normalizeRequestBody(request), name, bodyFieldErrors, true, undefined);
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
   * `@Body()` would be validated against `{}` and fail on its required properties. An empty
   * plain object reads as absent only when the request carried no payload - a client that
   * sends `{}` did send a body. Only a plain object counts - an empty array or buffer body
   * is a body.
   */
  private normalizeRequestBody(request: ExRequest): unknown {
    const body = request.body;

    if (typeof body !== 'object' || body === null) {
      return body;
    }

    const prototype = Object.getPrototypeOf(body);
    const isPlainObject = prototype === Object.prototype || prototype === null;

    if (!isPlainObject || Object.keys(body).length > 0) {
      return body;
    }

    return this.hasPayload(request) ? body : undefined;
  }

  private hasPayload(request: ExRequest): boolean {
    if (request.headers['transfer-encoding'] !== undefined) {
      return true;
    }

    const contentLength = request.headers['content-length'];

    return contentLength !== undefined && contentLength !== '0';
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

    const contentType = response.get('Content-Type');
    const isJsonResponse = contentType?.includes('json') ?? false;

    if (data && typeof data.pipe === 'function' && data.readable && typeof data._read === 'function') {
      response.status(statusCode || 200);
      this.pipeStream(data as Readable, response, next);
    } else if (data === undefined || (data === null && !isJsonResponse)) {
      response.status(statusCode || 204).end();
    } else if (data instanceof Uint8Array) {
      // send() only recognises Buffer as binary and would JSON-encode any other Uint8Array
      response.status(statusCode || 200).send(Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    } else if (typeof data === 'string' && contentType !== undefined && !isJsonResponse) {
      response.status(statusCode || 200).send(data);
    } else {
      // The spec documents these as application/json. send() would emit a bare string as text/html.
      response.status(statusCode || 200).json(data);
    }
  }

  /**
   * stream.pipeline destroys the response as soon as the source fails, which leaves the error
   * handler nothing to answer with. An error before any data goes to next; after that the
   * response is destroyed, so the client sees a truncated transfer.
   */
  private pipeStream(stream: Readable, response: ExResponse, next?: ExNext) {
    stream.on('error', (error: Error) => {
      stream.unpipe(response);
      if (!response.headersSent && next) {
        next(error);
        return;
      }
      response.destroy();
    });
    finished(response, () => stream.destroy());
    stream.pipe(response);
  }
}
import type {} from 'multer';
