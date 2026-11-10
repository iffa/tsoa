import { Get, Route, Security } from '@iffa/tsoa-runtime';

@Route('ProtoObject')
export class ProtoObjectController {
  @Security({ __proto__: [] })
  @Get()
  public get(): string {
    return 'anonymous';
  }
}
