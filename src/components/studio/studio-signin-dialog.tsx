'use client';
import { Suspense, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';

export function StudioSigninDialog({
  open,
  onOpenChange,
  initialMode = 'login',
  callbackUrl = '/#studio',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authReady?: boolean;
  initialMode?: 'login' | 'register';
  callbackUrl?: string;
}) {
  const [registering, setRegistering] = useState(initialMode === 'register');
  const dialogRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setRegistering(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        ref={dialogRef}
        tabIndex={-1}
        className="bb-dialog bb-auth-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialogRef.current?.focus();
        }}
      >
        <DialogTitle>
          {registering
            ? 'Join Burning Bridges AI'
            : 'Sign in to Burning Bridges AI'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Sign in with Google or email to create your video.
        </DialogDescription>
        <Suspense fallback={<p>Loading sign-in…</p>}>
          {registering ? (
            <RegisterForm
              embedded
              onAuthenticated={() => onOpenChange(false)}
              callbackUrl={callbackUrl}
              onLogin={() => setRegistering(false)}
            />
          ) : (
            <LoginForm
              embedded
              onAuthenticated={() => onOpenChange(false)}
              callbackUrl={callbackUrl}
              onRegister={() => setRegistering(true)}
            />
          )}
        </Suspense>
        <p className="bb-dialog-note">
          By continuing, you agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
