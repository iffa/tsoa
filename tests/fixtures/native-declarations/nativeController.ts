import { Controller, Get, Middlewares, Query, Route, Tags } from '@iffa/tsoa-runtime';
import { DEFAULT_LIMIT, ROUTE_NAME, TAG } from './constants';
import { ClassModel, Color, Thing, Widget } from './model';
import { NamedSignup } from './extendedSchema';
import { Signup } from './schema';
import { onlyInBody } from './onlyInBody';
import { loadWidget, makeThing } from './service';

const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

@Route(ROUTE_NAME)
@Tags(TAG)
export class NativeController extends Controller {
  /** Lists widgets */
  @Get()
  public async list(@Query() limit = DEFAULT_LIMIT, @Query() color: Color = Color.Red): Promise<Widget[]> {
    return onlyInBody() && limit > 0 && color ? [] : [];
  }

  @Get('inferred')
  @Middlewares(passThrough)
  public async inferred() {
    return makeThing(true);
  }

  @Get('inferred-async')
  public async inferredAsync() {
    return loadWidget();
  }

  @Get('class')
  public async classModel(): Promise<ClassModel> {
    return new ClassModel();
  }

  @Get('thing')
  public async thing(): Promise<Thing> {
    return makeThing(false);
  }

  @Get('signup')
  public async signup(): Promise<Signup> {
    return { email: '' };
  }

  @Get('named-signup')
  public async namedSignup(): Promise<NamedSignup> {
    return { email: '', name: '' };
  }
}
