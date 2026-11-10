import { Controller, ExpressTemplateService } from '@iffa/tsoa-runtime';
import { expect } from 'chai';
import express from 'express';
import 'mocha';
import { Readable } from 'node:stream';
import request from 'supertest';

describe('ExpressTemplateService response serialization', () => {
  const templateService = new ExpressTemplateService({}, { noImplicitAdditionalProperties: 'throw-on-extras', bodyCoercion: true });

  class ReturningController extends Controller {
    constructor(
      private readonly data: unknown,
      headers: Record<string, string>,
    ) {
      super();
      Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value));
    }

    public async handle() {
      return this.data;
    }
  }

  function serve(data: unknown, headers: Record<string, string> = {}) {
    const app = express();
    app.get('/', (_req, res, next) => {
      void templateService.apiHandler({ methodName: 'handle', controller: new ReturningController(data, headers), response: res, next, validatedArgs: [], successStatus: undefined });
    });
    return request(app as Parameters<typeof request>[0])
      .get('/')
      .buffer(true);
  }

  it('sends a string as JSON when the controller set no content type', async () => {
    const res = await serve('<script>alert(1)</script>');

    expect(res.type).to.equal('application/json');
    expect(res.text).to.equal('"<script>alert(1)</script>"');
  });

  it('sends a string as-is when the controller set a non-JSON content type', async () => {
    const res = await serve('a,b', { 'Content-Type': 'text/csv' });

    expect(res.type).to.equal('text/csv');
    expect(res.text).to.equal('a,b');
  });

  it('quotes a string when the controller set a JSON content type', async () => {
    const res = await serve('a', { 'Content-Type': 'application/json' });

    expect(res.text).to.equal('"a"');
  });

  it('sends a number as JSON', async () => {
    const res = await serve(404);

    expect(res.status).to.equal(200);
    expect(res.body).to.equal(404);
  });

  it('sends a Buffer as binary', async () => {
    const res = await serve(Buffer.from('bytes'));

    expect(res.type).to.equal('application/octet-stream');
    expect(Buffer.from(res.body).toString()).to.equal('bytes');
  });

  it('sends a Uint8Array view as binary, keeping its offset and length', async () => {
    const res = await serve(new Uint8Array(Buffer.from('xxbytesxx')).subarray(2, 7));

    expect(res.type).to.equal('application/octet-stream');
    expect(Buffer.from(res.body).toString()).to.equal('bytes');
  });

  it('answers 204 for undefined, and for null without a JSON content type', async () => {
    expect((await serve(undefined)).status).to.equal(204);
    expect((await serve(null)).status).to.equal(204);
  });

  it('aborts the connection on a stream error after data was sent', async () => {
    let started = false;
    const stream = new Readable({
      read() {
        if (!started) {
          started = true;
          this.push('partial');
          setTimeout(() => this.destroy(new Error('stream_test_error')), 20);
        }
      },
    });

    const error = await serve(stream).then(
      () => undefined,
      (failure: NodeJS.ErrnoException) => failure,
    );

    expect(error?.code).to.equal('ECONNRESET');
  });

  it('sends null as JSON when the controller set a JSON content type', async () => {
    const res = await serve(null, { 'Content-Type': 'application/json' });

    expect(res.status).to.equal(200);
    expect(res.text).to.equal('null');
  });
});

describe('ExpressTemplateService stream errors before any data', () => {
  const templateService = new ExpressTemplateService({}, { noImplicitAdditionalProperties: 'throw-on-extras', bodyCoercion: true });

  class FailingDownloadController extends Controller {
    constructor() {
      super();
      this.setHeader('Content-Type', 'application/pdf');
      this.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
      this.setStatus(206);
    }

    public async download() {
      return new Readable({
        read() {
          this.destroy(new Error('stream_test_error'));
        },
      });
    }
  }

  function serve(errorHandler: express.ErrorRequestHandler, earlierMiddleware: express.RequestHandler = (_req, _res, next) => next()) {
    const app = express();
    app.get('/', earlierMiddleware, (_req, res, next) => {
      void templateService.apiHandler({ methodName: 'download', controller: new FailingDownloadController(), response: res, next, validatedArgs: [] });
    });
    app.use(errorHandler);
    return request(app as Parameters<typeof request>[0]).get('/');
  }

  it('hands the error handler a response without the controller status and headers', async () => {
    const res = await serve((error: Error, _req, res, _next) => {
      res.json({ message: error.message });
    });

    expect(res.status).to.equal(200);
    expect(res.type).to.equal('application/json');
    expect(res.headers).to.not.have.property('content-disposition');
    expect(res.body).to.deep.equal({ message: 'stream_test_error' });
  });

  it('keeps headers set by earlier middleware', async () => {
    const res = await serve(
      (error: Error, _req, res, _next) => {
        res.status(500).json({ message: error.message });
      },
      (_req, res, next) => {
        res.setHeader('X-Request-Id', 'abc');
        res.setHeader('Content-Disposition', 'inline');
        next();
      },
    );

    expect(res.status).to.equal(500);
    expect(res.headers['x-request-id']).to.equal('abc');
    expect(res.headers['content-disposition']).to.equal('inline');
  });
});
