import { Body, Post, Route } from '@iffa/tsoa-runtime';

export type Locale = 'fi' | 'en';

export interface TupleModel {
  pair: [string, number];
  optional: [string, number?];
  namedOptional: [label: string, count?: number];
  rest: [Locale, ...Locale[]];
  namedRest: [head: string, ...tail: number[]];
  nested: [{ id: number }, ...Array<{ id: number }>];
}

const inferredPair = (): [string, boolean] => ['a', true];

@Route('Tuple')
export class TupleController {
  @Post()
  public post(@Body() body: TupleModel): TupleModel {
    return body;
  }

  @Post('Inferred')
  public inferred(@Body() body: { value: ReturnType<typeof inferredPair> }): { value: ReturnType<typeof inferredPair> } {
    return body;
  }
}
