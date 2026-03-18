import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
    const sizeClasses = size === 'sm'
      ? 'h-8 px-3 text-sm'
      : size === 'lg'
        ? 'h-11 px-5 text-base'
        : 'h-10 px-4 text-sm';
    const variantClasses = variant === 'primary'
      ? 'bg-[#E42313] text-white hover:bg-[#c71e10] shadow-sm hover:shadow'
      : 'bg-white/90 text-[#1F2937] border border-[#D9DEE8] hover:bg-white hover:border-[#c5ccd8]';

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
