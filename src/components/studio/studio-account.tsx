'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { readStudioAccount } from '@/studio/account-query';

import { StudioAccountMenu } from './studio-account-menu';
import { StudioSigninDialog } from './studio-signin-dialog';

export function StudioAccount({
  balanceOnly = false,
  authReady = false,
}: {
  balanceOnly?: boolean;
  authReady?: boolean;
}) {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('auth');
  const authRequested =
    requestedMode === 'login' || requestedMode === 'register';
  const [signinOpen, setSigninOpen] = useState(false);
  const { data } = useSWR('/api/studio/account', readStudioAccount, {
    revalidateOnFocus: true,
    refreshInterval: 15_000,
  });
  if (!data?.user)
    return balanceOnly ? null : (
      <>
        <button
          type="button"
          className="bb-signin"
          onClick={() => setSigninOpen(true)}
        >
          Sign in
        </button>
        <StudioSigninDialog
          key={requestedMode || 'default'}
          open={signinOpen || authRequested}
          initialMode={requestedMode === 'register' ? 'register' : 'login'}
          callbackUrl={searchParams.get('callbackUrl') || '/#studio'}
          onOpenChange={(next) => {
            setSigninOpen(next);
            if (!next && authRequested) {
              const url = new URL(window.location.href);
              url.searchParams.delete('auth');
              url.searchParams.delete('callbackUrl');
              // 由 Next.js 同步路由状态，避免登录参数清除后弹窗仍被旧参数撑开。
              window.history.replaceState(null, '', url);
            }
          }}
          authReady={authReady}
        />
      </>
    );
  if (balanceOnly)
    return (
      <div className="bb-library-balance">
        <strong>{data.user.credits}</strong>
        <span>credits available</span>
      </div>
    );
  return <StudioAccountMenu user={data.user} />;
}
