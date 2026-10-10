import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

export interface MenuAction {
  readonly id: string;
  readonly label: string;
  readonly detail?: ReactNode;
  readonly trailing?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly run?: (() => void) | undefined;
}

export function ActionMenu({
  label,
  actions,
  primary,
  orientation = "horizontal",
  size = "sm",
  autoFocus = true,
  className,
  onKeyDown,
}: {
  readonly label: string;
  readonly actions: readonly MenuAction[];
  readonly primary: string;
  readonly orientation?: "horizontal" | "vertical";
  readonly size?: "sm" | "md";
  readonly autoFocus?: boolean;
  readonly className?: string | undefined;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <MenuList
      autoFocus={autoFocus}
      className={className}
      defaultValue={primary}
      label={label}
      onKeyDown={onKeyDown}
      onSelect={(id) => actions.find((action) => action.id === id)?.run?.()}
      orientation={orientation}
      size={size}
    >
      {actions.map((action) => (
        <MenuItem
          detail={action.detail}
          disabled={action.disabled === true}
          key={action.id}
          trailing={action.trailing}
          value={action.id}
        >
          {action.label}
        </MenuItem>
      ))}
    </MenuList>
  );
}

export function useEscape(run: () => void, enabled = true): void {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  }, [run]);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pressed = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        latest.current();
      }
    };
    window.addEventListener("keydown", pressed);
    return () => {
      window.removeEventListener("keydown", pressed);
    };
  }, [enabled]);
}

export function SmallPrint({ children }: { readonly children: ReactNode }) {
  return (
    <p className="text-label text-muted font-semibold uppercase">{children}</p>
  );
}

const stepKeys = {
  back: new Set(["ArrowLeft", "a", "A"]),
  forward: new Set(["ArrowRight", "d", "D"]),
} as const;

export const sidewaysStep = (key: string): -1 | 0 | 1 => {
  if (stepKeys.forward.has(key)) {
    return 1;
  }
  return stepKeys.back.has(key) ? -1 : 0;
};

export const stepped = <Item,>(
  items: readonly Item[],
  current: Item,
  step: number
): Item => {
  const index = items.indexOf(current);
  return (
    items[(Math.max(0, index) + step + items.length) % items.length] ?? current
  );
};
