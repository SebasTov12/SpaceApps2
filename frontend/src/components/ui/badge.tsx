import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** demo: obligatorio en toda cifra o capa simulada */
  tone?: "neutral" | "accent" | "warning" | "danger" | "demo";
  dot?: boolean;
};

export function Badge({ tone = "neutral", dot = tone === "demo", className, children, ...props }: BadgeProps) {
  return (
    <span className={cn("ui-badge", `ui-badge--${tone}`, className)} {...props}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
