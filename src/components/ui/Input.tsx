import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full h-10 px-3 rounded-xl border border-[#D9DEE8] bg-white/95 text-sm text-[#111827] placeholder:text-[#9CA3AF] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#E42313]/25 focus:border-[#E42313] ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
