'use client';
import { useId, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { authCallbackUrl, authRedirect } from '@/lib/auth-redirect';
import { readStudioAccount } from '@/studio/account-query';
import { Input } from '@/components/ui/input';
import { AuthCard } from './auth-card';
import { SocialLoginButton } from './social-login-button';

const loginInput = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
});

export interface LoginFormProps {
  className?: string;
  callbackUrl?: string;
  embedded?: boolean;
  onRegister?: () => void;
  onAuthenticated?: () => void;
}

export function LoginForm({
  className,
  callbackUrl,
  embedded,
  onRegister,
  onAuthenticated,
}: LoginFormProps) {
  const router = useRouter();
  const formId = useId();
  const searchParams = useSearchParams();
  const destination = authRedirect(
    callbackUrl || searchParams.get('callbackUrl')
  );
  const { data: account } = useSWR('/api/studio/account', readStudioAccount);
  const { mutate } = useSWRConfig();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof loginInput>>({
    resolver: zodResolver(loginInput),
    defaultValues: { email: '', password: '' },
  });

  async function signIn(values: z.infer<typeof loginInput>) {
    setPending(true);
    setError('');
    try {
      const credentials = {
        ...values,
        callbackURL: authCallbackUrl(destination, window.location.origin),
      };
      const result = await authClient.signIn.email(credentials);
      if (result.error) {
        if (result.error.code !== 'INVALID_EMAIL_OR_PASSWORD') {
          setError(result.error.message || 'Sign-in failed. Please try again.');
          return;
        }
        // 注册接口负责检查邮箱是否已存在，已有账号不会被覆盖或重设密码。
        const registration = await authClient.signUp.email({
          ...credentials,
          name: values.email.split('@')[0],
        });
        if (registration.error) {
          const accountExists =
            registration.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ||
            registration.error.code === 'USER_ALREADY_EXISTS';
          setError(
            accountExists
              ? result.error.message || 'Invalid email or password.'
              : registration.error.message || 'Your account could not be created.'
          );
          return;
        }
      }
      await mutate('/api/studio/account');
      if (onAuthenticated && destination === '/#studio') {
        onAuthenticated();
        router.refresh();
      } else window.location.assign(destination);
    } catch {
      setError('We could not connect. Please try signing in again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      headerLabel="Welcome back."
      bottomButtonLabel="New here? Create an account"
      bottomButtonHref="/auth/register"
      className={className}
      embedded={embedded}
      onSwitch={onRegister}
    >
      {!embedded && (
        <p className="bb-auth-lead">
          Sign in to your credits and Burning Bridges AI videos.
        </p>
      )}
      <SocialLoginButton callbackUrl={destination} showDivider={false} />
      <div className="bb-auth-divider">
        <span>or use email</span>
      </div>
      <form onSubmit={form.handleSubmit(signIn)} className="bb-auth-fields">
        <label htmlFor={`${formId}-email`}>
          Email
          <Input
            id={`${formId}-email`}
            {...form.register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled={pending}
            aria-invalid={!!form.formState.errors.email}
          />
        </label>
        {form.formState.errors.email && (
          <p className="bb-form-error" role="alert">
            {form.formState.errors.email.message}
          </p>
        )}
        <label htmlFor={`${formId}-password`}>
          Password
          <span className="bb-password-field">
            <Input
              id={`${formId}-password`}
              {...form.register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={pending}
              aria-invalid={!!form.formState.errors.password}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {form.formState.errors.password && (
          <p className="bb-form-error" role="alert">
            {form.formState.errors.password.message}
          </p>
        )}
        <a href="/auth/forgot-password" className="bb-auth-forgot">
          Forgot password?
        </a>
        {error && (
          <p className="bb-form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="bb-button"
          disabled={pending || !account?.auth.email}
        >
          {pending && <LoaderCircle size={18} className="bb-spin" />}
          {pending ? 'Signing in…' : 'Sign in with email'}
        </button>
        <p className="bb-dialog-note">
          New here? We’ll create your account automatically. Your account keeps
          your credits and your recent videos. Your photo
          stays in the studio while you sign in.
        </p>
      </form>
    </AuthCard>
  );
}
