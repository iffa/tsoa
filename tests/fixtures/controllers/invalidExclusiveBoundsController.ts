import { Body, Post, Route } from '@tsoa/runtime';

@Route('InvalidExclusiveBounds')
export class InvalidExclusiveBoundsController {
  @Post()
  public async post(@Body() _body: ConflictingBounds): Promise<void> {
    return;
  }
}

interface ConflictingBounds {
  /**
   * @minimum 1
   * @exclusiveMinimum 2
   */
  count: number;
}
