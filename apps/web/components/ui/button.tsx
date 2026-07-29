// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { forwardRef } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-3 text-base',
};

const variantClasses: Record<string, string> = {
  default:
    'bg-[#121212] text-white hover:bg-[#333] shadow-[0_4px_14px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)]',
  secondary:
    'border border-[#d4d4d4] bg-white text-[#121212] hover:bg-[#f5f5f5] shadow-[0_4px_14px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)]',
  outline: 'border border-[#d4d4d4] bg-transparent text-[#121212] hover:bg-[#f5f5f5]',
  ghost: 'bg-transparent text-[#121212] hover:bg-[#f5f5f5]',
  destructive:
    'bg-red-600 text-white hover:bg-red-700 shadow-[0_4px_14px_rgba(220,38,38,0.3)] hover:shadow-[0_6px_20px_rgba(220,38,38,0.35)]',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', children, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center rounded-2xl font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
    const classes = `${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim();

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
