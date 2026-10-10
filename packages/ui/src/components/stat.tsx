import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

const sizes = {
  lg: "text-hud font-extrabold",
  md: "text-name font-bold",
  sm: "text-body leading-none font-bold",
} as const;

const tones = {
  green: "text-green",
  muted: "text-muted",
  orange: "text-orange",
  red: "text-red",
  text: "text-text",
  yellow: "text-yellow",
} as const;

function Stat({
  className,
  label,
  value,
  size = "md",
  tone = "text",
  align = "left",
  layout = "stack",
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly size?: keyof typeof sizes;
  readonly tone?: keyof typeof tones;
  readonly align?: "left" | "right";
  readonly layout?: "stack" | "row";
}) {
  return (
    <div
      data-slot="stat"
      className={cn(
        "flex",
        layout === "row"
          ? "items-baseline justify-between gap-4"
          : "flex-col gap-1",
        layout === "stack" && align === "right" && "items-end text-right",
        className
      )}
      {...props}
    >
      <span
        data-slot="stat-label"
        className="font-body text-label text-muted font-semibold uppercase"
      >
        {label}
      </span>
      <span
        data-slot="stat-value"
        className={cn(
          "font-display tracking-display numeric uppercase",
          sizes[size],
          tones[tone]
        )}
      >
        {value}
      </span>
    </div>
  );
}

export { Stat };
