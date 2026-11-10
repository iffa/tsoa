import { Get, Route, Security } from '@iffa/tsoa-runtime';

function makeScopes(): string[] {
  return ['read'];
}

@Route('UnresolvedScopes')
export class UnresolvedScopesController {
  @Security({ api_key: makeScopes() })
  @Get()
  public get(): string {
    return 'anonymous';
  }
}
