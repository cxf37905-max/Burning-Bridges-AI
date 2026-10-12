import { z } from 'zod';

const accountSchema = z.object({
  auth: z.object({ email: z.boolean(), google: z.boolean() }),
  user: z
    .object({
      name: z.string().nullable(),
      credits: z.number().int().nonnegative(),
    })
    .nullable(),
});

export async function readStudioAccount() {
  const response = await fetch('/api/studio/account', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load your account.');
  return accountSchema.parse(await response.json());
}
