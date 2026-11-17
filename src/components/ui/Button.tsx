import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

const variants: Record<Variant, string> = {
  primary: 'border border-ink/10 bg-ink text-base font-medium hover:bg-ink/[0.88] active:bg-ink/80',
  secondary:
    'border border-line bg-transparent text-ink-dim hover:border-ink-mute/50 hover:bg-surface2/50 hover:text-ink',
  outline:
    'border border-line/80 bg-transparent text-ink-mute hover:border-ink-mute/40 hover:text-ink',
  ghost: 'border border-transparent text-ink-mute hover:bg-surface2/60 hover:text-ink',
  danger: 'border border-danger/30 bg-transparent text-danger hover:bg-danger/[0.07]',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13.5px] gap-1.5',
  md: 'h-8 px-3 text-[13.5px] gap-1.5',
  icon: 'h-8 w-8',
  'icon-sm': 'h-7 w-7',
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
        'focus-ring inline-flex select-none items-center justify-center rounded transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      )}
      {children}
      {iconRight && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{iconRight}</span>}
    </button>
  );
});
