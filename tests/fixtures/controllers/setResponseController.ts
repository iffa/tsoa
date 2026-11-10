import { Get, Route } from '@iffa/tsoa-runtime';

@Route('SetResponse')
export class SetResponseController {
  @Get()
  public async get(): Promise<{ tags: Set<string> }> {
    return null as never;
  }
}
