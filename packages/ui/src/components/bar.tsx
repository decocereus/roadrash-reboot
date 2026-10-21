import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const fills = {
  condition: { high: "bg-text", low: "bg-red", mid: "bg-yellow" },
  plain: { high: "bg-text", low: "bg-text", mid: "bg-text" },
  stamina: { high: "bg-green", low: "bg-red", mid: "bg-yellow" },
} as const;

const heights = {
  md: "h-2.5",
  sm: "h-1.5",
} as const;

type BarLevel = "high" | "mid" | "low";

const barLevel = (ratio: number): BarLevel => {
  if (ratio >= 0.5) {
    return "high";
  }
  return ratio >= 0.25 ? "mid" : "low";
};

const ratioOf = (value: number, max: number): number =>
  max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

const Bar = ({
  className,
  value,
  max = 100,
  tone = "stamina",
  size = "md",
  align = "left",
  mark,
  label,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly value: number;
  readonly max?: number;
  readonly tone?: keyof typeof fills;
  readonly size?: keyof typeof heights;
  readonly align?: "left" | "right";
  readonly mark?: number | undefined;
  readonly label: string;
}) => {
  const ratio = ratioOf(value, max);
  const level = barLevel(ratio);
  return (
    <div
      data-slot="bar"
      data-level={level}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(ratio * max)}
      className={cn("relative w-full", heights[size], className)}
      {...props}
    >
      <div className="bg-raised ring-ink size-full overflow-hidden ring-2">
        <div
          data-slot="bar-fill"
          className={cn(
            "size-full transition-transform duration-150 ease-linear",
            align === "right" ? "origin-right" : "origin-left",
            fills[tone][level]
          )}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      {mark !== undefined && (
        <div
          aria-hidden
          data-slot="bar-mark"
          className="bg-yellow ring-ink absolute -inset-y-1 w-0.75 -translate-x-1/2 ring-1"
          style={{
            [align === "right" ? "right" : "left"]:
              `${ratioOf(mark, max) * 100}%`,
          }}
        />
      )}
    </div>
  );
};

const Pips = ({
  className,
  value,
  max,
  label,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  readonly value: number;
  readonly max: number;
  readonly label: string;
}) => {
  const left = Math.min(max, Math.max(0, Math.round(value)));
  return (
    <div
      data-slot="pips"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={left}
      className={cn("flex gap-1", className)}
      {...props}
    >
      {Array.from({ length: max }, (_, index) => (
        <span
          data-slot="pip"
          data-spent={index < left ? undefined : ""}
          key={index}
          className="border-text bg-text ring-ink h-4 w-2 border-2 ring-2 data-spent:bg-transparent"
        />
      ))}
    </div>
  );
};

export { Bar, Pips };
