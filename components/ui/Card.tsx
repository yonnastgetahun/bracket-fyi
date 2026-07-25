import { cn } from "@/lib/ui";
import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-xl p-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
