// Copyright 2026 agent-media contributors. Apache-2.0 license.

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors',
  {
    variants: {
      variant: {
        live: 'border-accent/30 bg-accent/10 text-accent',
        soon: 'border-warning/30 bg-warning/10 text-warning',
        default: 'border-border bg-card text-text-muted',
        video: 'border-cyan/30 bg-cyan/10 text-cyan',
        image: 'border-accent/30 bg-accent/10 text-accent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
