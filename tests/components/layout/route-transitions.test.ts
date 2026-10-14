import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const fixtures = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  animate: true,
  transition: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: fixtures.push, replace: fixtures.replace }),
  usePathname: () => '/about',
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({ Link: 'a' }),
}));
vi.mock('@/i18n/routing', () => ({ routing: {} }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: null }),
}));
vi.mock('@/components/layout/route-transitions', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/components/layout/route-transitions')
    >();
  return {
    ...actual,
    transitionRoute: (navigate: () => void) => {
      fixtures.transition();
      if (!fixtures.animate) return false;
      navigate();
      return true;
    },
  };
});

import { LocaleLink, RouteLink } from '@/components/layout/locale-link';
import {
  historyTransitionDirection,
  isRouteTransitionUrl,
  scrollTransitionDirection,
} from '@/components/layout/route-transitions';

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.animate = true;
  vi.stubGlobal('window', { location: { href: 'https://example.com/about' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('只增强真实的站内页面切换', () => {
  it.each([
    ['/pricing', true],
    ['/zh/about', true],
    ['/contact#form', true],
    ['https://example.com/pricing', true],
    ['/about', false],
    ['#pricing', false],
    ['/about#pricing', false],
    ['/about?tab=second', false],
    ['https://external.example.com/pricing', false],
    ['http://example.com/pricing', false],
    ['mailto:support@example.com', false],
    ['tel:123456', false],
  ])('%s 是否参与过渡：%s', (href, expected) => {
    expect(isRouteTransitionUrl(href, 'https://example.com/about')).toBe(
      expected
    );
  });

  it('后退反向、前进正向，不维护另一套历史记录', () => {
    expect(historyTransitionDirection(5, 3)).toBe('back');
    expect(historyTransitionDirection(3, 5)).toBe('forward');
  });
});

describe('按离开页面时的滚动位置选择新页面进入方向', () => {
  it.each([
    ['顶部：从下方进入', 0, 3000, 1000, 'forward'],
    ['更靠近顶部：从下方进入', 999, 3000, 1000, 'forward'],
    ['恰好中点：从下方进入', 1000, 3000, 1000, 'forward'],
    ['更靠近底部：从上方进入', 1001, 3000, 1000, 'back'],
    ['底部：从上方进入', 2000, 3000, 1000, 'back'],
    ['不足一屏：从下方进入', 0, 600, 1000, 'forward'],
    ['恰好一屏：从下方进入', 0, 1000, 1000, 'forward'],
    ['顶部弹性越界：从下方进入', -50, 3000, 1000, 'forward'],
    ['底部弹性越界：从上方进入', 2050, 3000, 1000, 'back'],
    ['调整视口后无需滚动：从下方进入', 2000, 3000, 3000, 'forward'],
  ])('%s', (_, scrollTop, documentHeight, viewportHeight, expected) => {
    expect(
      scrollTransitionDirection(scrollTop, documentHeight, viewportHeight)
    ).toBe(expected);
  });
});

function link(props: Parameters<typeof LocaleLink>[0] = { href: '/pricing' }) {
  return LocaleLink(props) as ReactElement<{
    onClick: (event: any) => void;
    onNavigate: (event: { preventDefault: () => void }) => void;
    [key: string]: any;
  }>;
}

describe('保留 next-intl 和 Next Link 的原有契约', () => {
  it('保留真实 href、预取、ref、目标与下载属性', () => {
    const ref = vi.fn();
    const result = link({
      href: '/pricing',
      prefetch: false,
      target: '_blank',
      download: true,
      ref,
    });
    expect(result.props).toMatchObject({
      href: '/pricing',
      prefetch: false,
      target: '_blank',
      download: true,
      ref,
    });
    expect(fixtures.push).not.toHaveBeenCalled();
  });

  it('使用最终本地化 href 导航，保留 scroll 配置', () => {
    const result = link({ href: '/pricing', scroll: false });
    result.props.onClick({
      currentTarget: { href: 'https://example.com/zh/pricing' },
    });
    const preventDefault = vi.fn();
    result.props.onNavigate({ preventDefault });
    expect(fixtures.push).toHaveBeenCalledWith(
      'https://example.com/zh/pricing',
      { scroll: false }
    );
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('replace 不变成 push', () => {
    const result = link({ href: '/pricing', replace: true });
    result.props.onClick({
      currentTarget: { href: 'https://example.com/pricing' },
    });
    result.props.onNavigate({ preventDefault: vi.fn() });
    expect(fixtures.replace).toHaveBeenCalledOnce();
    expect(fixtures.push).not.toHaveBeenCalled();
  });

  it('缺少浏览器支持或减少动态效果时，让 Next Link 正常导航', () => {
    fixtures.animate = false;
    const result = link();
    result.props.onClick({
      currentTarget: { href: 'https://example.com/pricing' },
    });
    const preventDefault = vi.fn();
    result.props.onNavigate({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(fixtures.push).not.toHaveBeenCalled();
  });

  it('原调用方取消导航时不覆盖它的决定', () => {
    const result = link({
      href: '/pricing',
      onNavigate: (event) => event.preventDefault(),
    });
    result.props.onClick({
      currentTarget: { href: 'https://example.com/pricing' },
    });
    result.props.onNavigate({ preventDefault: vi.fn() });
    expect(fixtures.transition).not.toHaveBeenCalled();
    expect(fixtures.push).not.toHaveBeenCalled();
  });

  it('保留原点击处理器，不为同页锚点创建过渡', () => {
    const onClick = vi.fn();
    const result = link({ href: '/about#pricing', onClick });
    const click = {
      currentTarget: { href: 'https://example.com/about#pricing' },
    };
    result.props.onClick(click);
    result.props.onNavigate({ preventDefault: vi.fn() });
    expect(onClick).toHaveBeenCalledWith(click);
    expect(fixtures.transition).not.toHaveBeenCalled();
  });

  it('Fumadocs 使用原始 href，不重复添加语言前缀', () => {
    const result = RouteLink({ href: '/zh/docs/config' });
    expect(result.props.href).toBe('/zh/docs/config');
  });
});
