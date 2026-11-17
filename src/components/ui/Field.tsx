import { forwardRef, useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

const controlClasses =
  'w-full rounded-md border border-line bg-base/70 px-3 text-[13px] text-ink transition-colors placeholder:text-ink-mute/80 hover:border-ink-mute/40 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50';

export function Label({
  children,
  htmlFor,
  hint,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between gap-3', className)}>
      <label htmlFor={htmlFor} className="text-[11.5px] font-medium text-ink-dim">
        {children}
      </label>
      {hint && <span className="font-mono text-[10px] text-ink-mute">{hint}</span>}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  wrapperClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, icon, className, wrapperClassName, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={wrapperClassName}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(controlClasses, 'h-9', icon ? 'pl-8' : false, className)}
          {...rest}
        />
      </div>
    </div>
  );
});

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  { label, hint, className, wrapperClassName, id, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className={wrapperClassName}>
      {label && (
        <Label htmlFor={selectId} hint={hint}>
          {label}
        </Label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(controlClasses, 'h-9 appearance-none pr-8', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
      </div>
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, className, wrapperClassName, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  return (
    <div className={wrapperClassName}>
      {label && (
        <Label htmlFor={areaId} hint={hint}>
          {label}
        </Label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        className={cn(controlClasses, 'resize-none py-2 leading-relaxed', className)}
        {...rest}
      />
    </div>
  );
});

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Accessible switch used for strategies and preferences. */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  const content = (
    <>
      {label && (
        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium text-ink">{label}</span>
          {description && (
            <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-mute">
              {description}
            </span>
          )}
        </span>
      )}
      <span
        className={cn(
          'relative ml-auto inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full border transition-colors duration-200',
          checked ? 'border-accent/50 bg-accent/25' : 'border-line bg-surface2',
        )}
      >
        <span
          className={cn(
            'absolute h-[12px] w-[12px] rounded-full transition-all duration-200',
            checked ? 'left-[17px] bg-accent shadow-[0_0_10px_rgb(var(--c-accent)/0.7)]' : 'left-[2px] bg-ink-mute',
          )}
        />
      </span>
    </>
  );

  if (label) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-ring flex w-full items-start gap-3 rounded-md text-left transition-opacity',
          disabled && 'cursor-not-allowed opacity-45',
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('focus-ring inline-flex rounded-md', disabled && 'cursor-not-allowed opacity-45', className)}
    >
      {content}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

interface SegmentedProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-line bg-base/50 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors',
              active
                ? 'bg-surface2 text-ink shadow-[inset_0_0_0_1px_rgb(var(--c-line)/0.9)]'
                : 'text-ink-mute hover:text-ink-dim',
            )}
          >
            {option.label}
            {typeof option.count === 'number' && (
              <span className={cn('readout text-[10px]', active ? 'text-accent' : 'text-ink-mute/70')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  description?: ReactNode;
  onChange: (value: number) => void;
}

/** Labelled slider with a live numeric readout. */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  description,
  onChange,
}: RangeFieldProps) {
  const id = useId();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[11.5px] font-medium text-ink-dim">
          {label}
        </label>
        <span className="readout text-[12px] text-ink">
          {value}
          {unit && <span className="ml-1 text-[10.5px] text-ink-mute">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="focus-ring w-full"
      />
      {description && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-mute">{description}</p>
      )}
    </div>
  );
}
