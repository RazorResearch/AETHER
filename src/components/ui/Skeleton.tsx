import { cn } from '@/utils/cn';

/** Neutral loading block. Used while demo datasets are being "loaded". */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-sm bg-surface2/60', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-sweep bg-gradient-to-r from-transparent via-ink/[0.035] to-transparent" />
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}
