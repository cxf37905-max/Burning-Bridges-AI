import { z } from 'zod';

const authOptionsSchema = z.object({
  email: z.boolean(),
  google: z.boolean(),
});

export async function readStudioAuthOptions() {
  const response = await fetch('/api/studio/auth-options', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load sign-in options.');
  return authOptionsSchema.parse(await response.json());
}
