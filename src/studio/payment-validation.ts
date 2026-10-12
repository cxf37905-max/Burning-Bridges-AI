import { z } from 'zod';
import { videoPacks } from './catalog';

export const checkoutInput = z
  .object({
    packId: z.enum(videoPacks.map((pack) => pack.id)),
    requestId: z.uuid(),
  })
  .strict();
