import { websiteConfig } from '@/config/website';
import type { PagesType } from '@/lib/source';
import { getMDXComponents } from '../docs/mdx-components';
import { Card, CardContent } from '../ui/card';

interface CustomPageProps {
  page: PagesType;
}

export function CustomPage({ page }: CustomPageProps) {
  const { title, date } = page.data;
  const formattedDate =
    !date && websiteConfig.legal.lastUpdated.startsWith('REPLACE_WITH_')
      ? null
      : new Intl.DateTimeFormat('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(date ?? websiteConfig.legal.lastUpdated));
  const MDX = page.data.body;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {formattedDate && (
          <p className="text-center text-lg text-muted-foreground">
            Last updated: {formattedDate}
          </p>
        )}
      </div>

      {/* Content */}
      <Card className="mb-8">
        <CardContent>
          <div className="max-w-none prose prose-neutral dark:prose-invert prose-img:rounded-lg">
            <MDX components={getMDXComponents()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
