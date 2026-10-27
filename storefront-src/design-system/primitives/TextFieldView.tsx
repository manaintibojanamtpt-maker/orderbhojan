import type { InputHTMLAttributes } from 'react';

export interface TextFieldViewProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly className?: string;
}

export function TextFieldView({
  label,
  hint,
  error,
  className = '',
  id,
  ...inputProps
}: TextFieldViewProps) {
  const fieldId = id ?? label.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <label htmlFor={fieldId} className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-secondary)]">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className="w-full rounded-xl border border-[var(--ob-border)] bg-[var(--ob-surface)] px-4 py-3 text-base text-[var(--ob-text-primary)] outline-none transition placeholder:text-[#6B5F52] focus:border-[#E8720C]/50 focus:ring-2 focus:ring-[#E8720C]/20"
        {...inputProps}
      />
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-sm text-[#F87171]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-sm text-[var(--ob-text-secondary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
