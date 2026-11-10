import { z } from 'zod';

export const zSignup = z.object({
  /** Where the confirmation goes */
  email: z.string(),
});
export type Signup = z.infer<typeof zSignup>;
