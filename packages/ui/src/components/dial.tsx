import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const CENTRE = 100;
const RADIUS = 86;
const ARC_LENGTH = Math.PI * RADIUS;
const REDLINE = 0.85;
const TICKS = 12;
const LABEL_EVERY = 3;

const rim = `M ${CENTRE - RADIUS} ${CENTRE} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTRE + RADIUS} ${CENTRE}`;

const onRim = (ratio: number, radius: number) => {
  const angle = Math.PI * (1 - ratio);
  return {
    x: CENTRE + Math.cos(angle) * radius,
    y: CENTRE - Math.sin(angle) * radius,
  };
};

const ratioOf = (value: number, max: number): number =>
  max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

function Dial({
  className,
  value,
  max,
  unit,
  label,
  ...props
}: Omit<ComponentProps<"svg">, "children"> & {
  readonly value: number;
  readonly max: number;
  readonly unit: string;
  readonly label: string;
}) {
  const ratio = ratioOf(value, max);
  return (
    <svg
      data-slot="dial"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      viewBox="0 0 200 112"
      className={cn("overflow-visible", className)}
      {...props}
    >
      <path d={rim} className="stroke-raised fill-none" strokeWidth={10} />
      <path
        d={rim}
        className="stroke-red fill-none"
        strokeWidth={10}
        strokeDasharray={ARC_LENGTH}
        strokeDashoffset={-ARC_LENGTH * REDLINE}
      />
      <path
        d={rim}
        data-slot="dial-fill"
        className="stroke-yellow fill-none transition-[stroke-dashoffset] duration-150 ease-linear"
        strokeWidth={10}
        strokeDasharray={ARC_LENGTH}
        strokeDashoffset={ARC_LENGTH * (1 - ratio)}
      />
      {Array.from({ length: TICKS + 1 }, (_, index) => {
        const at = index / TICKS;
        const major = index % LABEL_EVERY === 0;
        const outer = onRim(at, RADIUS - 8);
        const inner = onRim(at, RADIUS - (major ? 20 : 14));
        const mark = onRim(at, RADIUS - 29);
        return (
          <g key={index}>
            <line
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              className="stroke-text"
              strokeWidth={major ? 3 : 1.5}
            />
            {major && (
              <text
                x={mark.x}
                y={mark.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted font-body text-[11px] font-semibold"
              >
                {Math.round(max * at)}
              </text>
            )}
          </g>
        );
      })}
      <line
        data-slot="dial-needle"
        x1={CENTRE}
        y1={CENTRE - 46}
        x2={CENTRE}
        y2={CENTRE - RADIUS + 3}
        className="stroke-orange origin-[100px_100px] transition-transform duration-150 ease-linear [transform-box:view-box]"
        strokeWidth={5}
        strokeLinecap="round"
        style={{ transform: `rotate(${ratio * 180 - 90}deg)` }}
      />
      <text
        x={CENTRE}
        y={CENTRE - 6}
        textAnchor="middle"
        className="fill-text font-display numeric text-[40px] font-extrabold"
      >
        {Math.round(value)}
        <tspan
          dx={4}
          className="fill-muted font-body text-[10px] font-semibold uppercase"
        >
          {unit}
        </tspan>
      </text>
    </svg>
  );
}

export { Dial };
