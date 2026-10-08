import { Get, Path, Route } from '@tsoa/runtime';

@Route('duplicate')
export class FirstDuplicateController {
  @Get('{id}')
  public get(@Path() id: string): string {
    return id;
  }
}

@Route('duplicate/:name')
export class SecondDuplicateController {
  @Get()
  public get(@Path() name: string): string {
    return name;
  }
}
