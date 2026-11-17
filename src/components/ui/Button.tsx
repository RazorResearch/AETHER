import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-[#041016] font-semibold hover:bg-accent/90 active:bg-accent/80 shadow-[0_0_0_1px_rgb(var(--c-accent)/0.4),0_10px_26px_-14px_rgb(var(--c-accent)/0.75)]',
  secondary:
    'bg-surface2 text-ink border border-line hover:border-ink-mute/50 hover:bg-surface2/70',
  outline:
    'bg-transparent text-ink-dim border border-line hover:text-ink hover:border-ink-mute/50 hover:bg-surface2/50',
  ghost: 'bg-transparent text-ink-dim hover:text-ink hover:bg-surface2/70',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
  icon: 'h-9 w-9',
  'icon-sm': 'h-8 w-8',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-flex select-none items-center justify-center rounded-md transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      )}
      {children}
      {iconRight && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{iconRight}</span>}
    </button>
  );
});
