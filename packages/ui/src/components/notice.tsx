import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const toastEdges = {
  blue: "border-l-blue",
  green: "border-l-green",
  red: "border-l-red",
  yellow: "border-l-yellow",
} as const;

function Notice({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="notice"
      role="status"
      className={cn(
        "text-primary notice-in font-display tracking-display absolute top-1/4 left-1/2 -translate-x-1/2 text-4xl font-extrabold whitespace-nowrap uppercase drop-shadow-lg",
        className
      )}
      {...props}
    />
  );
}

function Toast({
  className,
  tone = "yellow",
  ...props
}: ComponentProps<"p"> & { readonly tone?: keyof typeof toastEdges }) {
  return (
    <p
      data-slot="toast"
      role="status"
      className={cn(
        "bg-panel/85 text-text notice-in font-body w-fit max-w-sm border-l-4 px-4 py-2 text-sm font-semibold shadow-[0_6px_14px_rgb(0_0_0/40%)] backdrop-blur-sm",
        toastEdges[tone],
        className
      )}
      {...props}
    />
  );
}

export { Notice, Toast };
