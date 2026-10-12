export const photoRetentionSeconds = 24 * 60 * 60;
export const videoRetentionSeconds = 14 * 24 * 60 * 60;

export function videoExpiresAt(completedAt: Date) {
  return new Date(completedAt.getTime() + videoRetentionSeconds * 1000);
}

export function videoHasExpired(completedAt: Date, now = new Date()) {
  return now.getTime() >= videoExpiresAt(completedAt).getTime();
}
