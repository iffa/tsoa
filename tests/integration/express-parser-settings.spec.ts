import { expect } from 'chai';
import 'mocha';
import request from 'supertest';
import { app } from '../fixtures/express/server';
import { TestModel } from '../fixtures/testModel';

const basePath = '/v1';

describe('Express parser settings', () => {
  it('parses bracket array and object query parameters', async () => {
    const arrays = await request(app).get(`${basePath}/GetTest/WildcardQueries?x[]=a&x[]=b`).expect(200);
    const objects = await request(app).get(`${basePath}/GetTest/WildcardQueries?filter[name]=a&filter[kind]=b`).expect(200);

    expect((arrays.body as TestModel).anyType).to.deep.equal({ x: ['a', 'b'] });
    expect((objects.body as TestModel).anyType).to.deep.equal({ filter: { name: 'a', kind: 'b' } });
  });

  it('parses nested urlencoded form bodies', async () => {
    const res = await request(app).post(`${basePath}/PostTest/Object`).type('form').send('obj[a]=1&obj[b]=2').expect(200);

    expect(res.body).to.deep.equal({ a: '1', b: '2' });
  });
});
