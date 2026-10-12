'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { LoaderCircle } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google';
import { authClient } from '@/lib/auth-client';
import { authRedirect } from '@/lib/auth-redirect';
import { readStudioAccount } from '@/studio/account-query';

export function SocialLoginButton({
  callbackUrl,
  showDivider = true,
}: {
  callbackUrl?: string;
  showDivider?: boolean;
}) {
  const { data: account } = useSWR('/api/studio/account', readStudioAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signInWithGoogle() {
    setPending(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: authRedirect(callbackUrl),
        errorCallbackURL: '/auth/error',
      });
      if (result.error) {
        setError(result.error.message || 'Google sign-in could not start.');
        setPending(false);
      }
    } catch {
      setError('We could not connect to Google sign-in. Please try again.');
      setPending(false);
    }
  }
  return (
    <div className="bb-social-login">
      {showDivider && (
        <div className="bb-auth-divider">
          <span>or</span>
        </div>
      )}
      <button
        type="button"
        className="bb-auth-google"
        onClick={signInWithGoogle}
        disabled={pending || !account?.auth.google}
      >
        {pending ? (
          <LoaderCircle size={18} className="bb-spin" />
        ) : (
          <GoogleIcon className="size-5 shrink-0 object-contain" />
        )}
        Continue with Google
      </button>
      {error && (
        <p className="bb-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
