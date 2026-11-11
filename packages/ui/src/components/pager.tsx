import { cn } from "@racer/ui/utils";
import type { ReactNode } from "react";

const arrow =
  "border-neon-yellow bg-night text-neon-yellow -skew-x-[14deg] border-2 px-2.5 leading-tight disabled:opacity-45";

const Pager = ({
  className,
  children,
  label,
  onBack,
  onNext,
}: {
  readonly className?: string;
  readonly children: ReactNode;
  readonly label: string;
  readonly onBack: () => void;
  readonly onNext: () => void;
}) => (
  <nav
    aria-label={label}
    className={cn(
      "font-display text-paper flex items-center gap-2.5 text-2xl font-extrabold tracking-wide uppercase italic",
      className
    )}
    data-slot="pager"
  >
    <button
      aria-label="Back one"
      className={arrow}
      onClick={onBack}
      type="button"
    >
      <span className="inline-block skew-x-[14deg]">&lt;</span>
    </button>
    <span aria-live="polite">{children}</span>
    <button
      aria-label="Next one"
      className={arrow}
      onClick={onNext}
      type="button"
    >
      <span className="inline-block skew-x-[14deg]">&gt;</span>
    </button>
  </nav>
);

export { Pager };
