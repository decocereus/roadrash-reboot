import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const formats = {
  leaderboard: { box: "aspect-728/90 w-[728px]", name: "728 × 90" },
  rectangle: { box: "aspect-300/250 w-[300px]", name: "300 × 250" },
} as const;

const AdSlot = ({
  className,
  format = "leaderboard",
  label = "Advertisement",
  ...props
}: Omit<ComponentProps<"aside">, "children"> & {
  readonly format?: keyof typeof formats;
  readonly label?: string;
}) => (
  <aside
    data-slot="ad-slot"
    data-format={format}
    aria-label={label}
    className={cn(
      "border-line text-muted font-body text-label bg-panel/60 flex max-w-full flex-col items-center justify-center gap-1 border-2 border-dashed font-semibold uppercase",
      formats[format].box,
      className
    )}
    {...props}
  >
    <span>{label}</span>
    <span className="numeric font-normal">{formats[format].name}</span>
  </aside>
);

export { AdSlot };
