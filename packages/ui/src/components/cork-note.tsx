import { Paper } from "@racer/ui/components/paper";
import type { PinColour } from "@racer/ui/components/paper";
import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const hands = {
  marker: "font-display tracking-display text-name font-bold uppercase",
  typed: "text-body font-semibold",
} as const;

const CorkBoard = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="cork-board"
    className={cn(
      "cork border-ink/60 p-gutter relative border-4 shadow-[inset_0_0_40px_rgb(0_0_0/35%)]",
      className
    )}
    {...props}
  />
);

const CorkNote = ({
  className,
  hand = "marker",
  tilt = -1.5,
  pin = "red",
  signature,
  children,
  ...props
}: ComponentProps<"div"> & {
  readonly hand?: keyof typeof hands;
  readonly tilt?: number;
  readonly pin?: PinColour;
  readonly signature?: string | undefined;
}) => (
  <Paper
    data-slot="cork-note"
    className={cn("max-w-xs", className)}
    pin={pin}
    tilt={tilt}
    {...props}
  >
    <p className={cn("text-pretty", hands[hand])}>{children}</p>
    {signature !== undefined && (
      <p className="font-display tracking-display mt-2 text-right text-xl font-extrabold uppercase">
        {signature}
      </p>
    )}
  </Paper>
);

export { CorkBoard, CorkNote };
