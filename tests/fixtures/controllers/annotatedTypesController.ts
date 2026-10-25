import {Route} from "@iffa/tsoa-runtime/decorators/route";
import {Get} from "@iffa/tsoa-runtime/decorators/methods";

@Route('AnnotatedTypesTest')
export class AnnotatedTypesController {

  @Get('/default')
  public async getDefault(): Promise<{
    number: number
  }> {
    return {
      number: 5
    }
  }

  @Get('/integer')
  public async getInteger(): Promise<{
    /** @isInt */
    number: number
  }> {
    return {
      number: 5
    }
  }

  @Get('/double')
  public async getDouble(): Promise<{
    /** @isDouble */
    number: number
  }> {
    return {
      number: 5
    }
  }
}
