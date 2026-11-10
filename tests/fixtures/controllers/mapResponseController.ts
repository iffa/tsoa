import { Get, Route } from '@iffa/tsoa-runtime';

@Route('MapResponse')
export class MapResponseController {
  @Get()
  public async get(): Promise<{ counts: Map<string, number> }> {
    return null as never;
  }
}
