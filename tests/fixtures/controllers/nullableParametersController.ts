import { Get, Query, Route } from '@iffa/tsoa-runtime';

export enum Ordering {
  ASC = 'asc',
  DESC = 'desc',
}

@Route('NullableParameters')
export class NullableParametersController {
  /**
   * @minLength search 2
   */
  @Get()
  public get(@Query() search: string | null, @Query() order: Ordering | null, @Query() limit?: number | null): string {
    return `${search}${order}${limit}`;
  }
}
