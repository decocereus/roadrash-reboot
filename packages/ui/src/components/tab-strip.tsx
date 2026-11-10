import { cn } from "@racer/ui/utils";
import type { KeyboardEvent, ReactNode } from "react";

interface Tab<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly disabled?: boolean;
}

const stepKeys = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
]);

const TabStrip = <Value extends string>({
  label,
  tabs,
  value,
  panelId,
  onChange,
  children,
  className,
}: {
  readonly label: string;
  readonly tabs: readonly Tab<Value>[];
  readonly value: Value;
  readonly panelId: string;
  readonly onChange: (value: Value) => void;
  readonly children?: ReactNode;
  readonly className?: string;
}) => {
  const usable = tabs.filter((tab) => tab.disabled !== true);
  const targetOf = (key: string): Tab<Value> | undefined => {
    const step = stepKeys.get(key);
    if (step !== undefined) {
      const at = usable.findIndex((tab) => tab.value === value);
      return usable[(at + step + usable.length) % usable.length];
    }
    if (key === "Home") {
      return usable[0];
    }
    return key === "End" ? usable.at(-1) : undefined;
  };
  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = targetOf(event.key);
    if (next) {
      event.preventDefault();
      onChange(next.value);
      event.currentTarget
        .querySelector<HTMLElement>(`[data-tab="${next.value}"]`)
        ?.focus();
    }
  };
  return (
    <header
      data-slot="tab-strip"
      className={cn(
        "bg-night border-neon-magenta font-display text-paper flex h-16 shrink-0 items-stretch border-b-2 pl-6 uppercase",
        className
      )}
    >
      <div
        aria-label={label}
        className="flex items-stretch"
        onKeyDown={move}
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className={cn(
                "-mr-px flex -skew-x-[14deg] items-center border-2 border-t-0 px-9 outline-offset-[-4px]",
                selected
                  ? "bg-neon-yellow border-neon-yellow text-ink"
                  : "border-paper bg-night-raised text-paper",
                tab.disabled === true && "opacity-35"
              )}
              data-tab={tab.value}
              disabled={tab.disabled}
              key={tab.value}
              onClick={() => {
                onChange(tab.value);
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <span className="skew-x-[14deg] text-[2rem] leading-none font-extrabold italic">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-paper/80 ml-auto flex items-center gap-2.5 pr-6 text-lg font-bold tracking-wide">
        {children}
      </div>
    </header>
  );
};

export { TabStrip };
