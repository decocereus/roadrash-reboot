import { cn } from "@racer/ui/utils";

const CELLS = 8;

const cellTones = {
  cyan: "bg-neon-cyan border-neon-cyan",
  magenta: "bg-neon-magenta border-neon-magenta",
  yellow: "bg-neon-yellow border-neon-yellow",
} as const;

const StatBar = ({
  label,
  share,
  tone,
}: {
  readonly label: string;
  readonly share: number;
  readonly tone: keyof typeof cellTones;
}) => {
  const filled = Math.max(1, Math.min(CELLS, Math.round(share * CELLS)));
  return (
    <li
      aria-label={`${label}, ${filled} of ${CELLS}`}
      className="flex items-center justify-between gap-4 text-xl font-extrabold italic"
      data-slot="stat-bar"
    >
      <span>{label}</span>
      <span aria-hidden className="flex h-4 w-44 -skew-x-[14deg] gap-0.5">
        {Array.from({ length: CELLS }, (_, cell) => (
          <i
            className={cn(
              "flex-1 border",
              cell < filled ? cellTones[tone] : "border-paper/40"
            )}
            key={cell}
          />
        ))}
      </span>
    </li>
  );
};

export { StatBar };
