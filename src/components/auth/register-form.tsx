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

const registrationInput = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
});

export function RegisterForm({
  callbackUrl,
  embedded,
  onLogin,
  onAuthenticated,
}: {
  callbackUrl?: string;
  embedded?: boolean;
  onLogin?: () => void;
  onAuthenticated?: () => void;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const formId = useId();
  const searchParams = useSearchParams();
  const destination = authRedirect(
    callbackUrl || searchParams.get('callbackUrl')
  );
  const { data: account } = useSWR('/api/studio/account', readStudioAccount);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof registrationInput>>({
    resolver: zodResolver(registrationInput),
    defaultValues: { name: '', email: '', password: '' },
  });

  async function register(values: z.infer<typeof registrationInput>) {
    setPending(true);
    setError('');
    try {
      const result = await authClient.signUp.email({
        ...values,
        callbackURL: authCallbackUrl(destination, window.location.origin),
      });
      if (result.error) {
        setError(result.error.message || 'Your account could not be created.');
        return;
      }
      await mutate('/api/studio/account');
      if (onAuthenticated && destination === '/#studio') {
        onAuthenticated();
        router.refresh();
      } else window.location.assign(destination);
    } catch {
      setError('We could not connect. Please try creating your account again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      headerLabel="Create your account."
      bottomButtonLabel="Already have an account? Sign in"
      bottomButtonHref="/auth/login"
      embedded={embedded}
      onSwitch={onLogin}
    >
      {!embedded && (
        <p className="bb-auth-lead">
          Keep your videos and purchased credits in one place.
        </p>
      )}
      <SocialLoginButton callbackUrl={destination} showDivider={false} />
      <div className="bb-auth-divider">
        <span>or use email</span>
      </div>
      <form onSubmit={form.handleSubmit(register)} className="bb-auth-fields">
        <label htmlFor={`${formId}-name`}>
          Name
          <Input
            id={`${formId}-name`}
            {...form.register('name')}
            autoComplete="name"
            placeholder="Your name"
            disabled={pending}
          />
        </label>
        {form.formState.errors.name && (
          <p className="bb-form-error" role="alert">
            {form.formState.errors.name.message}
          </p>
        )}
        <label htmlFor={`${formId}-email`}>
          Email
          <Input
            id={`${formId}-email`}
            {...form.register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled={pending}
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              disabled={pending}
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
          {pending ? 'Creating account…' : 'Create account'}
        </button>
        {account && !account.auth.email && (
          <p className="bb-dialog-note">
            Email registration is currently unavailable.
          </p>
        )}
      </form>
    </AuthCard>
  );
}
