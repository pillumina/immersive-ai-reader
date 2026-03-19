import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.97]';
    const sizes =
      size === 'sm'
        ? 'h-8 px-3 text-[13px]'
        : size === 'lg'
          ? 'h-11 px-5 text-base'
          : 'h-10 px-4 text-sm';
    const variants =
      variant === 'primary'
        ? 'bg-[#E42313] text-white hover:bg-[#c71e10] shadow-sm hover:shadow focus-visible:ring-[#E42313]/30'
        : 'bg-white/90 text-[#1F2937] border border-[#D9DEE8] hover:bg-white hover:border-[#c5ccd8] focus-visible:ring-slate-400/30';

    return (
      <button
        ref={ref}
        className={`${base} ${sizes} ${variants} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
