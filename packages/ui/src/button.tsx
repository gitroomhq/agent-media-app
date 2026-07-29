// Copyright 2026 agent-media contributors. Apache-2.0 license.

import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'default' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={className}
        ref={ref}
        data-variant={variant}
        data-size={size}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
