import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-brand text-brand-ink hover:bg-brand/90",
  secondary: "bg-surface text-ink border border-line hover:bg-bg",
  ghost: "text-ink hover:bg-bg",
  danger: "bg-danger text-white hover:bg-danger/90",
} as const;

const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-11 px-5" } as const;

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
