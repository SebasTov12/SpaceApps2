import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary: acción principal · outline: secundaria · ghost: terciaria o en barras de herramientas */
  variant?: "primary" | "outline" | "ghost";
  /** icon: botón cuadrado solo con icono; requiere aria-label */
  size?: "sm" | "md" | "icon";
};

export function Button({ variant = "outline", size = "md", type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("ui-button", `ui-button--${variant}`, size !== "md" && `ui-button--${size}`, className)}
      {...props}
    />
  );
}
