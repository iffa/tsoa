import { expect } from 'chai';
import 'mocha';
import { MissingCredentialsError, failureToReport, isAnonymousFallback } from '@iffa/tsoa-runtime';
import type { TsoaRoute } from '@iffa/tsoa-runtime';

describe('anonymous security helpers', () => {
  const failed = (reason: unknown) => {
    const attempt = Promise.reject(reason);
    attempt.catch(() => undefined);
    return attempt;
  };

  describe('isAnonymousFallback', () => {
    it('is true when anonymous access is allowed and every failure is a missing credential', async () => {
      expect(await isAnonymousFallback([{ api_key: [] }, {}], [failed(new MissingCredentialsError())])).to.be.true;
    });

    it('is true for an empty-entry-only security list without attempts', async () => {
      expect(await isAnonymousFallback([{}], [])).to.be.true;
    });

    it('is false for an unrelated error that only shares the name', async () => {
      const lookalike = Object.assign(new Error('no token'), { name: 'MissingCredentialsError' });

      expect(await isAnonymousFallback([{ api_key: [] }, {}], [failed(lookalike)])).to.be.false;
    });

    it('is false when any failure is not a missing credential', async () => {
      expect(await isAnonymousFallback([{ api_key: [] }, { tsoa_auth: [] }, {}], [failed(new MissingCredentialsError()), failed({ message: 'invalid' })])).to.be.false;
    });

    it('answers false at once, not as a promise, when the operation has no empty entry', () => {
      expect(isAnonymousFallback([{ api_key: [] }], [failed(new MissingCredentialsError())])).to.equal(false);
    });
  });

  describe('failureToReport', () => {
    const security: TsoaRoute.Security[] = [{ api_key: [] }, { tsoa_auth: [] }, {}];

    it('skips a missing credential and reports the invalid one', () => {
      const invalid = { message: 'invalid' };

      expect(failureToReport(security, [new MissingCredentialsError(), invalid])).to.equal(invalid);
    });

    it('reports the last failure when anonymous access is not allowed', () => {
      const last = { message: 'second' };

      expect(failureToReport([{ api_key: [] }], [{ message: 'first' }, last])).to.equal(last);
    });

    it('reports a stand-in that accepts a status when the failure is frozen', () => {
      const frozen = Object.freeze(new Error('denied'));
      const reported = failureToReport(security, [frozen]);

      reported.status = 403;

      expect(reported.status).to.equal(403);
      expect(reported.message).to.equal('denied');
    });
  });
});
