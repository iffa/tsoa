import { z } from 'zod';
import { zSignup } from './schema';

export const zNamedSignup = zSignup.extend({ name: z.string() });
export type NamedSignup = z.infer<typeof zNamedSignup>;
