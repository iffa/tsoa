import { Body, Get, Post, Route } from '@iffa/tsoa-runtime';
import { z } from 'zod';

const appConfig = { mode: 'a', retries: 3 } as const;
export type AppConfig = typeof appConfig;

export enum ParamKind {
  A = 'a',
  B = 'b',
}
export interface ParamsByKind {
  [ParamKind.A]: { foo: string };
  [ParamKind.B]: { bar: number };
}

export interface Profile {
  id: string;
  name: string;
  age: number;
}

export type Shout = Uppercase<'abc' | 'def'>;
export type PrefixedId = `user_${string}`;

const ROLES = { admin: 1, user: 2 } as const;
export type Role = keyof typeof ROLES;
export type RoleValue = (typeof ROLES)[Role];

/** @pattern ^[0-9a-f-]{36}$ */
export type UUID = string;
export interface WithUuid {
  id: UUID;
  label: string;
}

const SignupSchema = z.object({
  /** Where the confirmation goes */
  email: z.string(),
  plan: z.string().default('free'),
});
export type SignupInput = z.input<typeof SignupSchema>;
export type SignupOutput = z.output<typeof SignupSchema>;
export type Signup = z.infer<typeof SignupSchema>;

export interface Labeled<T> {
  value: T;
}

export const internalKey: unique symbol = Symbol('internal');
const constKey = 'fromConst';
export interface WithComputedKeys {
  [internalKey]: string;
  [constKey]: boolean;
  ['literal-key']: number;
  id: string;
}

/** Not the stream class */
export class Readable {
  public name!: string;
}

@Route('CheckedTypes')
export class CheckedTypesController {
  @Get('TypeofConst')
  public async getTypeofConst(): Promise<AppConfig> {
    return null as never;
  }

  @Get('IndexedByEnum')
  public async getIndexedByEnum(): Promise<ParamsByKind[ParamKind.A]> {
    return null as never;
  }

  @Get('IndexedByUnion')
  public async getIndexedByUnion(): Promise<{ value: Profile['id' | 'age'] }> {
    return null as never;
  }

  @Get('StringTypes')
  public async getStringTypes(): Promise<{ shout: Shout; id: PrefixedId }> {
    return null as never;
  }

  @Get('KeysAndValues')
  public async getKeysAndValues(): Promise<{ role: Role; value: RoleValue }> {
    return null as never;
  }

  @Get('Omit')
  public async getOmit(): Promise<Omit<WithUuid, 'label'>> {
    return null as never;
  }

  @Post('ZodInputOutput')
  public async postZodInputOutput(@Body() body: SignupInput): Promise<SignupOutput> {
    return null as never;
  }

  @Post('ZodInputInline')
  public async postZodInputInline(@Body() body: z.input<typeof SignupSchema>): Promise<void> {
    return;
  }

  @Post('ZodInfer')
  public async postZodInfer(@Body() body: Signup): Promise<void> {
    return;
  }

  @Get('Intersection')
  public async getIntersection(): Promise<{ a: string } & { b: number }> {
    return null as never;
  }

  @Get('GenericNames')
  public async getGenericNames(): Promise<{ user: Labeled<`user_${string}`>; org: Labeled<`org_${string}`>; numbered: Labeled<`user_${number}`> }> {
    return null as never;
  }

  @Get('ComputedKeys')
  public async getComputedKeys(): Promise<WithComputedKeys> {
    return null as never;
  }

  @Get('ReadonlyArray')
  public async getReadonlyArray(): Promise<{ labels: ReadonlyArray<Labeled<string>>; names: readonly string[] }> {
    return null as never;
  }

  @Post('OwnReadable')
  public async postOwnReadable(@Body() body: Readable): Promise<Readable> {
    return body;
  }
}
