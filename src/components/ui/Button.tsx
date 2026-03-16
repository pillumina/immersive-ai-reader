import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', children, ...props }, ref) => {
    const baseClasses = 'px-4 py-2 font-medium transition-colors';
    const variantClasses = variant === 'primary'
      ? 'bg-[#E42313] text-white hover:bg-red-700'
      : 'bg-white text-black border border-[#E8E8E8] hover:bg-gray-50';

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
