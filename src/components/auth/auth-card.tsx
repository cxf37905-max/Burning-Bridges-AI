'use client';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  children: React.ReactNode;
  headerLabel: string;
  bottomButtonLabel: string;
  bottomButtonHref: string;
  className?: string;
  embedded?: boolean;
  onSwitch?: () => void;
}

export function AuthCard({
  children,
  headerLabel,
  bottomButtonLabel,
  bottomButtonHref,
  className,
  embedded = false,
  onSwitch,
}: AuthCardProps) {
  return (
    <section
      className={cn('bb-auth-form', !embedded && 'bb-auth-panel', className)}
    >
      {!embedded && (
        <header className="bb-auth-heading">
          <span className="bb-section-kicker">BURNING BRIDGES AI</span>
          <h1>{headerLabel}</h1>
        </header>
      )}
      {children}
      <footer className="bb-auth-footer">
        {onSwitch ? (
          <button type="button" className="bb-text-link" onClick={onSwitch}>
            {bottomButtonLabel}
          </button>
        ) : (
          <LocaleLink href={bottomButtonHref}>{bottomButtonLabel}</LocaleLink>
        )}
      </footer>
    </section>
  );
}
