import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div";
  padding?: "none" | "sm" | "md";
};

export function Card({ as: Tag = "section", padding = "md", className, ...props }: CardProps) {
  return <Tag className={cn("ui-card", padding !== "none" && `ui-card--pad-${padding}`, className)} {...props} />;
}
