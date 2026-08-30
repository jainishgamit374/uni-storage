import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Four semantic variants only: default (ink), primary (electric blue),
 * success (lime) and danger (red). Map any new status onto one of these —
 * never invent a fifth color. Always pair with an icon or label text so
 * status is never conveyed by color alone.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-raised text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        success: "border-transparent bg-lime text-lime-foreground",
        danger: "border-transparent bg-destructive text-destructive-foreground",
        /* legacy aliases kept so existing call sites keep compiling */
        secondary: "border-border bg-surface-raised text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
