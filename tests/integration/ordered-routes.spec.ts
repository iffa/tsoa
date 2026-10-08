import { expect } from 'chai';
import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { RegisterRoutes } from '../fixtures/route-ordering/routes';
import { Middlewares } from 'tsoa';
import { fetchMiddlewares } from '@tsoa/runtime';

const sharedMiddleware: express.RequestHandler = (_request, _response, next) => next();
@Middlewares(sharedMiddleware)
class SharedRuntimeController {}

describe('Generated Express routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/ordered/raw', express.raw({ type: 'application/octet-stream' }));
  RegisterRoutes(app);
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    const failure = error as { status?: number; fields?: unknown };
    response.status(failure.status || 500).json({ fields: failure.fields });
  };
  app.use(errors);

  it('shares middleware metadata across runtime entry points', () => {
    expect(fetchMiddlewares(SharedRuntimeController)).to.deep.equal([sharedMiddleware]);
  });

  it('matches literal routes before parameters across controllers', async () => {
    const bulk = await request(app).get('/ordered/items/bulk').expect(200);
    expect(bulk.body).to.deep.equal(['bulk']);
    const all = await request(app).get('/ordered/items/by-name/all').expect(200);
    expect(all.body).to.deep.equal(['all']);
    const item = await request(app).get('/ordered/items/123').expect(200);
    expect(item.body).to.deep.equal({ id: '123' });
    expect(item.headers['x-middleware']).to.equal('called');
  });

  it('uses an explicit HEAD handler before the GET fallback', async () => {
    const head = await request(app).head('/ordered/status').expect(204);
    expect(head.headers['x-handler']).to.equal('head');
    const get = await request(app).get('/ordered/status').expect(200);
    expect(get.headers['x-handler']).to.equal('get');
  });

  it('validates JSON bodies without coercion and parses URL parameters', async () => {
    const valid = await request(app).post('/ordered/body').send({ count: 12, enabled: false, extra: 'removed' }).expect(200);
    expect(valid.body).to.deep.equal({ count: 12, enabled: false });
    await request(app).post('/ordered/body').send({ count: '12', enabled: 'false' }).expect(400);
    const query = await request(app).get('/ordered/query/12?enabled=false').expect(200);
    expect(query.body).to.deep.equal({ count: 12, enabled: false });
  });

  it('parses multipart fields and preserves uploads', async () => {
    const result = await request(app).post('/ordered/upload').field('count', '12').attach('file', Buffer.from('file'), 'example.txt').expect(200);
    expect(result.body).to.deep.equal({ name: 'example.txt', count: 12 });
  });

  it('retains raw request bodies and streamed downloads', async () => {
    const raw = await request(app).post('/ordered/raw').set('Content-Type', 'application/octet-stream').send(Buffer.from('raw')).expect(200);
    expect(raw.body).to.deep.equal({ bytes: 3 });
    const download = await request(app).get('/ordered/download').expect(200);
    expect((download.body as Buffer).toString()).to.equal('download');
  });
});
