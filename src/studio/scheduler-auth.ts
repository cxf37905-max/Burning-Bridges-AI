import 'server-only';
import { timingSafeEqual } from 'node:crypto';

export function authorizeStudioScheduler(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return Response.json(
      { error: 'Task scheduler is not configured.' },
      { status: 503 }
    );
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json(
      { error: 'Scheduler authorization is required.' },
      { status: 401 }
    );
}
