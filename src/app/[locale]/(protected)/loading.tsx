import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
        <div className="flex w-full min-w-0 items-center gap-2 px-4 lg:px-6">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="mx-2 h-4 w-px" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="hidden h-4 w-28 md:block" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3 pl-4">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`loading-card-${index}`}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="size-8 rounded-md" />
                  </div>
                  <Skeleton className="mt-6 h-7 w-28" />
                  <Skeleton className="mt-3 h-3 w-36" />
                </div>
              ))}
            </div>

            <div className="px-4 lg:px-6">
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
                <Skeleton className="h-64 w-full rounded-md" />
              </div>
            </div>

            <div className="px-4 lg:px-6">
              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b p-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
                <div className="divide-y">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`loading-row-${index}`}
                      className="grid grid-cols-12 items-center gap-4 p-4"
                    >
                      <Skeleton className="col-span-5 h-4" />
                      <Skeleton className="col-span-3 h-4" />
                      <Skeleton className="col-span-2 h-4" />
                      <Skeleton className="col-span-2 h-7 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
