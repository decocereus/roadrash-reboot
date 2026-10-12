import { cn } from "@racer/ui/utils";
import type { ComponentProps } from "react";

const TICKS = 48;
const MAJOR_EVERY = 12;
const REDLINE_FROM = 40;
const START_DEGREES = 150;
const SWEEP_DEGREES = 240;
const TICK_INNER = 82;
const TICK_OUTER = 94;
const MAJOR_OUTER = 100;
const LABEL_RADIUS = 70;
const TRACK_RADIUS = 106;
const TRACK_LENGTH = (2 * Math.PI * TRACK_RADIUS * SWEEP_DEGREES) / 360;
const YELLOW = "#fff04a";
const CYAN = "#19e6ff";
const RED = "#ff2e3d";
const INK = "#0a0810";

const onRing = (degrees: number, radius: number) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

const trackStart = onRing(START_DEGREES, TRACK_RADIUS);
const trackEnd = onRing(START_DEGREES + SWEEP_DEGREES, TRACK_RADIUS);
const track = `M${trackStart.x} ${trackStart.y}A${TRACK_RADIUS} ${TRACK_RADIUS} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

const ratioOf = (value: number, max: number): number =>
  max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

const tickColour = (index: number, lit: boolean): string => {
  if (index >= REDLINE_FROM) {
    return RED;
  }
  return lit ? YELLOW : "#ffffff";
};

const tickOpacity = (index: number, lit: boolean): number => {
  if (lit) {
    return 1;
  }
  return index >= REDLINE_FROM ? 0.6 : 0.3;
};

function Dial({
  className,
  value,
  max,
  unit,
  label,
  place,
  field,
  progress,
  ...props
}: Omit<ComponentProps<"svg">, "children"> & {
  readonly value: number;
  readonly max: number;
  readonly unit: string;
  readonly label: string;
  readonly place: string;
  readonly field: number;
  readonly progress: number;
}) {
  const ratio = ratioOf(value, max);
  const shown = Math.round(value);
  return (
    <svg
      data-slot="dial"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      viewBox="-112 -112 224 208"
      className={cn("font-display overflow-visible", className)}
      {...props}
    >
      <defs>
        <radialGradient id="dial-backing">
          <stop offset="0" stopColor={INK} stopOpacity={0.62} />
          <stop offset="0.72" stopColor={INK} stopOpacity={0.5} />
          <stop offset="1" stopColor={INK} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={112} fill="url(#dial-backing)" />
      {Array.from({ length: TICKS + 1 }, (_, index) => {
        const degrees = START_DEGREES + (SWEEP_DEGREES * index) / TICKS;
        const lit = index / TICKS <= ratio;
        const major = index % MAJOR_EVERY === 0;
        const inner = onRing(degrees, TICK_INNER);
        const outer = onRing(degrees, major ? MAJOR_OUTER : TICK_OUTER);
        const mark = onRing(degrees, LABEL_RADIUS);
        return (
          <g key={index}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={tickColour(index, lit)}
              strokeOpacity={tickOpacity(index, lit)}
              strokeWidth={major ? 4 : 2.6}
            />
            {major && (
              <text
                x={mark.x}
                y={mark.y + 4}
                textAnchor="middle"
                fill="#ffffff"
                fillOpacity={0.75}
                className="text-[12px] font-semibold"
              >
                {Math.round((max * index) / TICKS)}
              </text>
            )}
          </g>
        );
      })}
      <path
        d={track}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.22}
        strokeWidth={2}
      />
      <path
        d={track}
        data-slot="dial-progress"
        fill="none"
        stroke={CYAN}
        strokeWidth={3}
        strokeDasharray={`${TRACK_LENGTH * ratioOf(progress, 1)} 999`}
      />
      <g transform="skewX(-10)" textAnchor="middle" className="numeric">
        <text x={-3} y={20} fill={CYAN} className="text-[68px] font-extrabold">
          {shown}
        </text>
        <text x={3} y={20} fill={RED} className="text-[68px] font-extrabold">
          {shown}
        </text>
        <text
          x={0}
          y={20}
          fill="#ffffff"
          stroke={INK}
          strokeWidth={4}
          strokeLinejoin="round"
          paintOrder="stroke"
          className="text-[68px] font-extrabold"
        >
          {shown}
        </text>
      </g>
      <text
        x={0}
        y={38}
        textAnchor="middle"
        fill="#ffffff"
        fillOpacity={0.8}
        className="text-[12px] font-semibold tracking-[2px] uppercase"
      >
        {unit}
      </text>
      <polygon points="-40,54 40,54 40,78 31,88 -40,88" fill={YELLOW} />
      <text
        x={-11}
        y={82}
        textAnchor="middle"
        fill={INK}
        className="numeric text-[31px] font-extrabold uppercase"
      >
        {place}
      </text>
      <text
        x={24}
        y={81}
        textAnchor="middle"
        fill={INK}
        className="numeric text-[16px] font-semibold"
      >
        /{field}
      </text>
    </svg>
  );
}

export { Dial };
