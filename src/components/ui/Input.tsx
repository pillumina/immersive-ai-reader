import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full h-10 px-3 rounded-xl border border-[#e7e5e4] bg-white/95 text-sm text-[#1c1917] placeholder:text-[#a8a29e] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c]/20 focus-visible:border-[#c2410c] hover:border-[#d6d3d1] ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
