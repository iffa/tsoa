import { Controller, ExpressTemplateService } from '@iffa/tsoa-runtime';
import { expect } from 'chai';
import express from 'express';
import 'mocha';
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

  it('sends null as JSON when the controller set a JSON content type', async () => {
    const res = await serve(null, { 'Content-Type': 'application/json' });

    expect(res.status).to.equal(200);
    expect(res.text).to.equal('null');
  });
});
