import { cn } from "@racer/ui/utils";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";

const RowList = ({ className, ...props }: ComponentProps<"ul">) => (
  <ul
    data-slot="row-list"
    className={cn("flex flex-col", className)}
    {...props}
  />
);

const MemberRow = ({
  chip,
  name,
  state,
  ready = false,
  me = false,
  extra,
}: {
  readonly chip: ReactNode;
  readonly name: ReactNode;
  readonly state: ReactNode;
  readonly ready?: boolean;
  readonly me?: boolean;
  readonly extra?: ReactNode;
}) => (
  <li
    data-slot="member-row"
    className={cn(
      "border-paper/15 flex items-center gap-2.5 border-b py-1.5 text-xl tracking-normal normal-case",
      me ? "text-neon-yellow" : "text-paper"
    )}
  >
    {chip}
    <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
    {extra}
    <span
      className={cn(
        "text-base font-bold uppercase",
        ready ? "text-neon-yellow" : "text-paper/55"
      )}
    >
      {state}
    </span>
  </li>
);

const SettingRow = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) => (
  <li
    data-slot="setting-row"
    className="border-paper/15 flex items-center justify-between gap-4 border-b py-2.5 text-xl font-bold"
  >
    <span>{label}</span>
    <div className="flex flex-wrap justify-end gap-1.5">{children}</div>
  </li>
);

interface Option<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

const chipClass = (on: boolean): string =>
  cn(
    "border-2 px-2.5 py-0.5 text-sm font-bold uppercase",
    on
      ? "bg-neon-yellow border-neon-yellow text-ink"
      : "border-paper/35 text-paper/70 hover:text-paper"
  );

const OptionChips = <Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly Option<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}) => {
  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    if (
      !["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + step + options.length) % options.length];
    if (next) {
      onChange(next.value);
      event.currentTarget
        .querySelector<HTMLElement>(`[data-option="${next.value}"]`)
        ?.focus();
    }
  };
  return (
    <div
      aria-label={label}
      className="flex flex-wrap justify-end gap-1.5"
      data-slot="option-chips"
      onKeyDown={move}
      role="radiogroup"
    >
      {options.map((option) => (
        <button
          aria-checked={option.value === value}
          className={chipClass(option.value === value)}
          data-option={option.value}
          key={option.value}
          onClick={() => {
            onChange(option.value);
          }}
          role="radio"
          tabIndex={option.value === value ? 0 : -1}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const ChipButton = ({
  className,
  on = false,
  type = "button",
  ...props
}: ComponentProps<"button"> & { readonly on?: boolean }) => (
  <button
    data-slot="chip-button"
    className={cn(chipClass(on), className)}
    type={type}
    {...props}
  />
);

export { ChipButton, MemberRow, OptionChips, RowList, SettingRow };
