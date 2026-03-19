import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full h-10 px-3 rounded-xl border border-[#D9DEE8] bg-white/95 text-sm text-[#111827] placeholder:text-[#9CA3AF] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E42313]/20 focus-visible:border-[#E42313] hover:border-[#c5ccd8] ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
