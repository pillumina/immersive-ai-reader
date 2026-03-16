import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 border border-[#E8E8E8] bg-white text-sm focus:outline-none focus:border-[#E42313] ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
