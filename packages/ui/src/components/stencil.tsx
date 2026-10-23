import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const Stencil = ({ className, ...props }: ComponentProps<"span">) => (
  <span
    data-slot="stencil"
    className={cn(
      "font-stencil tracking-display text-outcome text-text inline-block font-extrabold whitespace-nowrap uppercase select-none",
      className
    )}
    {...props}
  />
);

export { Stencil };
