'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LocaleLink } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { BlogCategory } from '@/types';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

export type BlogCategoryListDesktopProps = {
  categoryList: BlogCategory[];
};

export function BlogCategoryListDesktop({
  categoryList,
}: BlogCategoryListDesktopProps) {
  const { slug } = useParams() as { slug?: string };
  const activeCategory = slug ?? 'All';
  const t = useTranslations('BlogPage');

  return (
    <div className="flex items-center justify-center">
      <ToggleGroup
        size="sm"
        type="single"
        value={activeCategory}
        aria-label="Toggle blog category"
        className="h-9 overflow-hidden rounded-md space-x-1 border bg-background p-1 *:h-7 *:text-muted-foreground"
      >
        <ToggleGroupItem
          asChild
          key="All"
          value="All"
          className={cn(
            'rounded-sm px-6',
            'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
            'hover:bg-accent hover:text-accent-foreground'
          )}
          aria-label={'Toggle all blog categories'}
        >
          <LocaleLink
            href={'/blog'}
            aria-current={activeCategory === 'All' ? 'page' : undefined}
          >
            <span>{t('all')}</span>
          </LocaleLink>
        </ToggleGroupItem>

        {categoryList.map((category) => (
          <ToggleGroupItem
            asChild
            key={category.slug}
            value={category.slug}
            className={cn(
              'rounded-sm px-6',
              'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
              'hover:bg-accent hover:text-accent-foreground'
            )}
            aria-label={`Toggle blog category of ${category.name}`}
          >
            <LocaleLink
              href={`/blog/category/${category.slug}`}
              aria-current={
                activeCategory === category.slug ? 'page' : undefined
              }
            >
              <span>{category.name}</span>
            </LocaleLink>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
