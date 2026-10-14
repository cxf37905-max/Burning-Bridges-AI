// 输入签名有效24小时；R2生命周期另设studio-inputs/满1天到期删除。
export const photoRetentionSeconds = 24 * 60 * 60;
// 站内成片访问14天；R2生命周期另设studio-results/满15天到期删除。
export const videoRetentionSeconds = 14 * 24 * 60 * 60;

export function videoExpiresAt(completedAt: Date) {
  return new Date(completedAt.getTime() + videoRetentionSeconds * 1000);
}

export function videoHasExpired(completedAt: Date, now = new Date()) {
  return now.getTime() >= videoExpiresAt(completedAt).getTime();
}
