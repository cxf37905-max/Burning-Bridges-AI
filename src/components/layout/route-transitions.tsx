'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';

type Direction = 'forward' | 'back';
type NavigationWindow = Window & {
  navigation?: EventTarget & {
    currentEntry: { index: number; key: string } | null;
  };
};
type HistoryNavigationEvent = Event & {
  navigationType: string;
  canIntercept: boolean;
  destination: {
    index: number;
    key: string;
    url: string;
    sameDocument: boolean;
  };
  intercept(options: {
    precommitHandler: () => Promise<void>;
    handler: () => Promise<void>;
    scroll: 'manual';
    focusReset: 'manual';
  }): void;
};
type TransitionNavigation = (navigate: () => void) => boolean;

// 这里只保存浏览器展示回调，不保存页面、业务数据或路由缓存。
let transitionNavigation: TransitionNavigation | undefined;

export function isRouteTransitionUrl(destination: string, current: string) {
  const from = new URL(current);
  const to = new URL(destination, from);
  return (
    (to.protocol === 'https:' || to.protocol === 'http:') &&
    to.origin === from.origin &&
    to.pathname !== from.pathname
  );
}

export function historyTransitionDirection(previous: number, next: number) {
  return next < previous ? 'back' : 'forward';
}

export function scrollTransitionDirection(
  scrollTop: number,
  documentHeight: number,
  viewportHeight: number
): Direction {
  const scrollRange = Math.max(0, documentHeight - viewportHeight);
  // 按新页面进入的位置选择：顶部从下方进入，底部从上方进入。
  return scrollRange > 0 && scrollTop > scrollRange / 2 ? 'back' : 'forward';
}

export function transitionRoute(navigate: () => void): boolean {
  return transitionNavigation?.(navigate) ?? false;
}

export function RouteTransitions() {
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  const active = useRef<{
    from: string;
    release: () => void;
    committed: Promise<void>;
    transition?: ViewTransition;
  } | null>(null);

  useLayoutEffect(() => {
    // 等路由真正提交 DOM 后再结束快照更新；滚动和焦点仍交给 Next.js。
    if (active.current && active.current.from !== pathname) {
      active.current.release();
    }
    lastPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const navigation = (window as NavigationWindow).navigation;
    // 只记本次会话里已知历史项的滚动坐标；不改 history.state，也不保存页面内容。
    const scrollPositions = new Map<string, [number, number]>();
    const rememberScroll = () => {
      const key = navigation?.currentEntry?.key;
      if (key) scrollPositions.set(key, [window.scrollX, window.scrollY]);
    };

    const cancelActive = () => {
      const previous = active.current;
      active.current = null;
      previous?.release();
      previous?.transition?.skipTransition();
      delete document.documentElement.dataset.routeTransition;
    };

    const begin = (navigate: () => void, direction: Direction) => {
      if (!document.startViewTransition || reducedMotion.matches) return false;
      rememberScroll();
      cancelActive();
      let release = () => {};
      const committed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pending = {
        from: lastPath.current,
        release,
        committed,
        transition: undefined as ViewTransition | undefined,
      };
      active.current = pending;
      document.documentElement.dataset.routeTransition = direction;
      const transition = document.startViewTransition(() => {
        navigate();
        return committed;
      });
      pending.transition = transition;

      const cleanup = () => {
        pending.release();
        if (active.current !== pending) return;
        active.current = null;
        delete document.documentElement.dataset.routeTransition;
      };
      // 这是失败兜底，不是导航延迟：慢请求/中断时取消视觉效果，导航照常继续。
      const deadline = AbortSignal.timeout(4000);
      const abandon = () => {
        pending.release();
        transition.skipTransition();
        cleanup();
      };
      deadline.addEventListener('abort', abandon, { once: true });
      const finish = () => {
        deadline.removeEventListener('abort', abandon);
        cleanup();
      };
      void transition.ready.catch(() => {
        // 浏览器可能因切后台、连续导航或快照不可用而跳过动画，不能阻断路由。
        abandon();
      });
      void transition.finished.then(finish, (error: unknown) => {
        console.warn('页面过渡已取消，保留正常路由导航：', error);
        finish();
      });
      return true;
    };

    const navigate = (callback: () => void) =>
      begin(
        callback,
        scrollTransitionDirection(
          window.scrollY,
          document.documentElement.scrollHeight,
          window.innerHeight
        )
      );
    transitionNavigation = navigate;

    const traverse = (notification: Event) => {
      const event = notification as HistoryNavigationEvent;
      const previousIndex = navigation?.currentEntry?.index;
      const position = scrollPositions.get(event.destination.key);
      // 只增强同文档的历史导航；没有提交前回调时，不接管浏览器历史行为。
      if (
        !('NavigationPrecommitController' in window) ||
        !document.startViewTransition ||
        reducedMotion.matches ||
        event.navigationType !== 'traverse' ||
        !event.canIntercept ||
        !event.cancelable ||
        !event.destination.sameDocument ||
        previousIndex === undefined ||
        !position ||
        !isRouteTransitionUrl(event.destination.url, window.location.href)
      )
        return;
      let contentCommitted = Promise.resolve();
      event.intercept({
        // 只等浏览器取得旧页快照，不添加固定导航延迟，也不自行重放 popstate。
        precommitHandler: () =>
          new Promise<void>((commit) => {
            if (
              begin(
                commit,
                historyTransitionDirection(
                  previousIndex,
                  event.destination.index
                )
              )
            ) {
              contentCommitted = active.current!.committed;
            } else {
              commit();
            }
          }),
        // 仅在历史切换时恢复该历史项的已知坐标，不影响普通导航和同页锚点。
        handler: async () => {
          await contentCommitted;
          window.scrollTo({
            left: position[0],
            top: position[1],
            behavior: 'instant',
          });
        },
        scroll: 'manual',
        focusReset: 'manual',
      });
    };
    navigation?.addEventListener('navigate', traverse);
    return () => {
      navigation?.removeEventListener('navigate', traverse);
      if (transitionNavigation === navigate) transitionNavigation = undefined;
      cancelActive();
    };
  }, []);

  // 可选的浏览器展示控制器，不包裹、不隐藏也不接管服务端页面内容。
  return null;
}
