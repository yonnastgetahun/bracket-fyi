import { cn } from "@/lib/ui";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({
  variant = "primary",
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "rounded-lg px-4 py-2 font-semibold transition-opacity focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-canvas",
        disabled && "opacity-40 cursor-not-allowed",
        variant === "primary" && "bg-accent text-canvas",
        variant === "secondary" && "border border-border text-primary bg-transparent",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
