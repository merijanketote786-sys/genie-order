"use client";

import { cn } from "@/lib/utils";
import type { ElementType } from "react";
import { memo } from "react";

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 1.2,
}: TextShimmerProps) => {
  return (
    <Component
      className={cn(
        "inline-flex items-center gap-2 text-muted-foreground",
        className
      )}
    >
      <span
        className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        style={{ animationDuration: `${duration}s` }}
        aria-hidden="true"
      />
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);
