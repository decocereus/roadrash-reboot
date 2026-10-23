import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const Notice = ({ className, ...props }: ComponentProps<"p">) => (
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

export { Notice };
