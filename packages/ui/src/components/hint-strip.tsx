import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

const Key = ({ className, ...props }: ComponentProps<"kbd">) => (
  <kbd
    data-slot="key"
    className={cn(
      "border-paper/65 text-paper mx-1 inline-block border-2 px-1.5 font-sans text-[0.95em] font-bold",
      className
    )}
    {...props}
  />
);

const HintStrip = ({
  start,
  end,
  className,
}: {
  readonly start: ReactNode;
  readonly end: ReactNode;
  readonly className?: string;
}) => (
  <footer
    data-slot="hint-strip"
    className={cn(
      "font-display text-paper/75 to-night via-night/90 pointer-events-none flex h-14 items-end justify-between bg-linear-to-b from-transparent from-0% via-35% px-5 pb-2 text-lg font-bold tracking-wide uppercase",
      className
    )}
  >
    <p>{start}</p>
    <p>{end}</p>
  </footer>
);

export { HintStrip, Key };
