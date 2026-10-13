'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useMounted } from '@/hooks/use-mounted';
import { Skeleton } from '@/components/ui/skeleton';

import { StudioAccountMenu } from './studio-account-menu';
import { StudioSigninDialog } from './studio-signin-dialog';

export function StudioAccount({ authReady = false }: { authReady?: boolean }) {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('auth');
  const authRequested =
    requestedMode === 'login' || requestedMode === 'register';
  const [signinOpen, setSigninOpen] = useState(false);
  const mounted = useMounted();
  const { data: session, isPending, error, refetch } = authClient.useSession();
  // 尚未取得账户和加载失败都不代表用户已退出登录。
  if (!mounted || isPending)
    return <Skeleton className="size-8 rounded-full" />;
  if (!session?.user && error)
    return (
      <button
        type="button"
        className="bb-signin"
        onClick={() => void refetch()}
      >
        Retry account
      </button>
    );
  if (!session?.user)
    return (
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
  return <StudioAccountMenu user={session.user} />;
}
