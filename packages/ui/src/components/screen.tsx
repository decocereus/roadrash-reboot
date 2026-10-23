import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

const scrims = {
  heavy: "bg-ink/60",
  none: "",
  soft: "from-ink/85 via-ink/35 bg-linear-to-tr to-transparent",
} as const;

const enters = {
  cut: "",
  fade: "screen-in",
} as const;

const fits = {
  parent: "relative size-full",
  viewport: "fixed inset-0",
} as const;

const Screen = ({
  className,
  scene,
  scrim = "none",
  fit = "viewport",
  enter = "cut",
  children,
  ...props
}: ComponentProps<"main"> & {
  readonly scene?: ReactNode;
  readonly scrim?: keyof typeof scrims;
  readonly fit?: keyof typeof fits;
  readonly enter?: keyof typeof enters;
}) => (
  <main
    data-slot="screen"
    className={cn(
      "bg-ink text-text font-body text-body isolate overflow-hidden",
      fits[fit],
      enters[enter],
      className
    )}
    {...props}
  >
    {scene !== undefined && (
      <div data-slot="screen-scene" className="absolute inset-0 -z-20">
        {scene}
      </div>
    )}
    {scrim !== "none" && (
      <div
        aria-hidden
        data-slot="screen-scrim"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          scrims[scrim]
        )}
      />
    )}
    <div
      data-slot="screen-content"
      className="relative flex size-full flex-col"
    >
      {children}
    </div>
  </main>
);

export { Screen };
