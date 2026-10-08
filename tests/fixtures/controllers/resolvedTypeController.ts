import { Body, Controller, Get, Post, Queries, Route } from '@tsoa/runtime';

type State = 'new' | 'accepted' | 'dismissed';
type StoredState = Exclude<State, 'new'>;
type SelectedState = Extract<State, 'accepted' | 'dismissed'>;
type Actor = { type: 'user'; userId: string } | { type: 'guest'; name: string } | { type: 'company'; companyId: string };
type IndividualActor = Exclude<Actor, { type: 'company' }>;
// These intersections occur in generated declarations.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type Credential = ('RFID' | 'PIN') & unknown;

interface ListFilter {
  search?: string;
  state?: State[];
  /** @minimum 1 */
  limit?: number;
}
type SelectedFilter = Pick<ListFilter, 'search' | 'limit' | 'state'>;
type UnknownValue = unknown;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type AliasedCredential = ('RFID' | 'PIN') & UnknownValue;

export interface ResolvedPayload {
  state: StoredState;
  selected: SelectedState;
  actor: IndividualActor;
  credential: Credential;
  aliasedCredential: AliasedCredential;
  forbidden?: never;
  dictionary?: Record<string, never>;
  nestedRecord?: Partial<{ value: Record<'id', string> }>;
  nestedOmit?: Partial<{ value: Omit<Partial<{ a: string; b: string }>, 'a'> }>;
  /** @default Europe/Helsinki */
  timezone?: string;
  /** @default EL402 */
  lockType?: 'EL402' | 'EL404';
  /** @default false */
  enabled?: boolean;
  /** @default 0 */
  offset?: number;
  /** @default '' */
  description?: string;
}

@Route('ResolvedTypes')
export class ResolvedTypeController extends Controller {
  @Post()
  public async create(@Body() payload: ResolvedPayload): Promise<ResolvedPayload> {
    return payload;
  }

  @Get()
  public async list(@Queries() filter: SelectedFilter): Promise<SelectedFilter> {
    return filter;
  }
}
