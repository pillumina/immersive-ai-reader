import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full h-10 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-raised)]/95 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20 focus-visible:border-[var(--color-accent)] hover:border-[var(--color-border-strong)] ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
