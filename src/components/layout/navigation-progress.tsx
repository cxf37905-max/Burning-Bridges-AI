'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type ProgressState = 'idle' | 'loading' | 'done';

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

function shouldShowProgress(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) {
    return false;
  }

  if (
    (anchor.target && anchor.target !== '_self') ||
    anchor.hasAttribute('download')
  ) {
    return false;
  }

  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) {
    return false;
  }

  return !(
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  );
}

export function NavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<ProgressState>('idle');
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    const clearTimers = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const finishProgress = () => {
      clearTimers();
      setState('done');
      timeoutRef.current = window.setTimeout(() => {
        setState('idle');
      }, 220);
    };

    const startProgress = () => {
      clearTimers();
      setState('idle');
      frameRef.current = window.requestAnimationFrame(() => {
        setState('loading');
      });
      timeoutRef.current = window.setTimeout(finishProgress, 6000);
    };

    const handleClick = (event: MouseEvent) => {
      if (!isPlainLeftClick(event)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a');
      if (!anchor || !shouldShowProgress(anchor)) {
        return;
      }

      startProgress();
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      setState('done');
      timeoutRef.current = window.setTimeout(() => {
        setState('idle');
      }, 220);
    }
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-x-0 top-0 z-[100] h-[3px] origin-left bg-primary transition-[opacity,width] ease-out dark:h-1 dark:shadow-[0_0_14px_var(--primary)] ${
        state === 'loading'
          ? 'w-2/3 opacity-100 duration-700'
          : state === 'done'
            ? 'w-full opacity-0 duration-200'
            : 'w-0 opacity-0 duration-0'
      }`}
    />
  );
}
