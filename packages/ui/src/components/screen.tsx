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

const ScreenStrip = ({
  className,
  edge = "top",
  ...props
}: ComponentProps<"div"> & { readonly edge?: "top" | "bottom" }) => (
  <div
    data-slot="screen-strip"
    data-edge={edge}
    className={cn(
      "border-line bg-ink/80 px-gutter min-h-strip flex shrink-0 flex-wrap items-center justify-between gap-x-8 gap-y-2 py-3 data-[edge=bottom]:border-t-2 data-[edge=top]:border-b-2",
      className
    )}
    {...props}
  />
);

const ScreenBody = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="screen-body"
    className={cn("px-gutter min-h-0 flex-1 py-6", className)}
    {...props}
  />
);

export { Screen, ScreenBody, ScreenStrip };
