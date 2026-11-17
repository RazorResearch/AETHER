import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useToastStore } from '@/store/useToastStore';
import type { ToastTone } from '@/types';
import { cn } from '@/utils/cn';

const toneStyles: Record<ToastTone, { icon: ReactNode; className: string }> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: 'border-ok/35 text-ok',
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    className: 'border-accent/35 text-accent',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: 'border-warn/35 text-warn',
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    className: 'border-danger/35 text-danger',
  },
};

/** Bottom-right notification stack (local only). */
export function Toasts() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((item) => {
        const style = toneStyles[item.tone];
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex animate-toast-in items-start gap-3 rounded-md border bg-raised/95 px-3.5 py-3 shadow-modal backdrop-blur-sm',
              style.className,
            )}
          >
            <span className="mt-0.5 shrink-0">{style.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-ink">{item.title}</p>
              {item.description && (
                <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="focus-ring -mr-1 rounded p-1 text-ink-mute transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
