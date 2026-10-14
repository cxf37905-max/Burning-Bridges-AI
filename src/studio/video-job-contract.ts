import { z } from 'zod';

export const publicVideoJobSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  sceneId: z.enum(['chandelier', 'after-hours']),
  status: z.enum(['reserved', 'processing', 'succeeded', 'failed']),
  videoUrl: z.url().nullable(),
  message: z.string().nullable(),
  refunded: z.boolean(),
  expired: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
});

export type PublicVideoJob = z.infer<typeof publicVideoJobSchema>;
