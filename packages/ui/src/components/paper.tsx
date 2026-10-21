import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

const pins = {
  blue: "bg-blue",
  green: "bg-green",
  none: "",
  red: "bg-red",
  yellow: "bg-yellow",
} as const;

type PinColour = keyof typeof pins;

const Pin = ({ colour }: { readonly colour: PinColour }) => {
  if (colour === "none") {
    return null;
  }
  return (
    <span
      aria-hidden
      data-slot="pin"
      className={cn(
        "ring-ink/40 absolute top-2 left-1/2 z-10 size-3 -translate-x-1/2 rounded-full shadow-[0_2px_2px_rgb(0_0_0/45%),inset_-1px_-2px_0_rgb(0_0_0/25%),inset_1px_1px_0_rgb(255_255_255/45%)] ring-1",
        pins[colour]
      )}
    />
  );
};

const Paper = ({
  className,
  tilt = 0,
  pin = "none",
  torn = false,
  surface = "paper",
  style,
  children,
  ...props
}: ComponentProps<"div"> & {
  readonly tilt?: number;
  readonly pin?: PinColour;
  readonly torn?: boolean;
  readonly surface?: "paper" | "polaroid";
}) => (
  <div
    data-slot="paper"
    className={cn(
      "text-ink font-body relative w-fit drop-shadow-[0_6px_10px_rgb(0_0_0/45%)]",
      className
    )}
    style={{ ...style, rotate: `${tilt}deg` }}
    {...props}
  >
    <Pin colour={pin} />
    <div
      data-slot="paper-sheet"
      className={cn(
        "size-full px-4 pb-4",
        surface === "paper" ? "bg-paper" : "bg-polaroid",
        pin === "none" ? "pt-4" : "pt-7",
        torn && "torn-top pt-6"
      )}
    >
      {children}
    </div>
  </div>
);

const PaperLine = ({
  className,
  label,
  children,
  ...props
}: ComponentProps<"div"> & { readonly label: ReactNode }) => (
  <div
    data-slot="paper-line"
    className={cn("flex items-baseline gap-2", className)}
    {...props}
  >
    <span className="text-label font-semibold uppercase">{label}</span>
    <span
      aria-hidden
      className="border-ink/35 min-w-4 flex-1 border-b-2 border-dotted"
    />
    <span className="font-display numeric tracking-display text-2xl leading-none font-bold">
      {children}
    </span>
  </div>
);

export { Paper, PaperLine, Pin };
export type { PinColour };
