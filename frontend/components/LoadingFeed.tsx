import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingFeed() {
  return (
    <div className="p-4">
      <div className="space-y-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 border-b border-border/50 pb-5">
            <Skeleton className="size-11 bg-stone-100/20" />
            <div className="w-full space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-28 bg-stone-100/20" />
                <Skeleton className="h-3 w-20 bg-stone-100/10" />
              </div>
              <Skeleton className="h-4 w-full bg-stone-100/10" />
              <Skeleton className="h-4 w-3/4 bg-stone-100/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
