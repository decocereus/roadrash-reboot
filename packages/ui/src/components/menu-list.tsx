import { cn } from "@racer/ui/utils";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";

type MenuOrientation = "vertical" | "horizontal";

interface MenuSelection {
  readonly value: string | undefined;
  readonly size: "md" | "sm";
  readonly orientation: MenuOrientation;
  readonly choose: (value: string) => void;
  readonly confirm: (value: string) => void;
}

const MenuContext = createContext<MenuSelection | null>(null);

const backKeys = {
  horizontal: new Set(["ArrowLeft", "a", "A"]),
  vertical: new Set(["ArrowUp", "w", "W"]),
} as const;

const forwardKeys = {
  horizontal: new Set(["ArrowRight", "d", "D"]),
  vertical: new Set(["ArrowDown", "s", "S"]),
} as const;

const ITEM_SELECTOR = '[data-slot="menu-item"]:not(:disabled)';

const targetIndex = (
  key: string,
  orientation: MenuOrientation,
  current: number,
  count: number
): number => {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  if (forwardKeys[orientation].has(key)) {
    return current < 0 ? 0 : (current + 1) % count;
  }
  if (backKeys[orientation].has(key)) {
    return current < 0 ? count - 1 : (current - 1 + count) % count;
  }
  return -1;
};

const MenuList = ({
  className,
  label,
  value,
  defaultValue,
  onValueChange,
  onSelect,
  orientation = "vertical",
  size = "md",
  autoFocus = false,
  onKeyDown,
  children,
  ...props
}: Omit<ComponentProps<"div">, "onSelect" | "defaultValue"> & {
  readonly label: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly onSelect?: (value: string) => void;
  readonly orientation?: MenuOrientation;
  readonly size?: "md" | "sm";
  readonly autoFocus?: boolean;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(defaultValue);
  const current = value ?? held;

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const root = rootRef.current;
    const item =
      root?.querySelector<HTMLElement>(`${ITEM_SELECTOR}[data-selected]`) ??
      root?.querySelector<HTMLElement>(ITEM_SELECTOR);
    item?.focus({ preventScroll: true });
  }, [autoFocus]);

  const selection = useMemo<MenuSelection>(
    () => ({
      choose: (next) => {
        if (next !== current) {
          setHeld(next);
          onValueChange?.(next);
        }
      },
      confirm: (chosen) => onSelect?.(chosen),
      orientation,
      size,
      value: current,
    }),
    [current, onSelect, onValueChange, orientation, size]
  );

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
    ];
    const focused = document.activeElement;
    const index = targetIndex(
      event.key,
      orientation,
      focused instanceof HTMLElement ? items.indexOf(focused) : -1,
      items.length
    );
    const target = items[index];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    target.focus();
  };

  return (
    <MenuContext value={selection}>
      <div
        ref={rootRef}
        data-slot="menu-list"
        data-orientation={orientation}
        role="menu"
        aria-label={label}
        aria-orientation={orientation}
        className={cn(
          "flex",
          orientation === "vertical"
            ? "flex-col items-start gap-1"
            : "flex-row flex-wrap items-center gap-x-8 gap-y-1",
          className
        )}
        onKeyDown={moveFocus}
        {...props}
      >
        {children}
      </div>
    </MenuContext>
  );
};

const MenuItem = ({
  className,
  value,
  detail,
  trailing,
  disabled = false,
  onClick,
  onFocus,
  onPointerEnter,
  children,
  ...props
}: Omit<ComponentProps<"button">, "value" | "type"> & {
  readonly value: string;
  readonly detail?: ReactNode;
  readonly trailing?: ReactNode;
}) => {
  const menu = use(MenuContext);
  if (menu === null) {
    throw new Error("MenuItem must be rendered inside a MenuList");
  }
  const selected = menu.value === value;
  return (
    <button
      data-slot="menu-item"
      data-selected={selected ? "true" : undefined}
      role="menuitem"
      type="button"
      disabled={disabled}
      tabIndex={selected || menu.value === undefined ? 0 : -1}
      className={cn(
        "group/menu-item font-display tracking-display text-text data-selected:text-yellow disabled:text-muted flex items-start gap-[0.4em] rounded-sm py-0.5 pr-2 text-left font-bold uppercase transition-colors duration-100",
        menu.size === "md" ? "text-name" : "text-body leading-tight",
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          menu.confirm(value);
        }
      }}
      onFocus={(event) => {
        onFocus?.(event);
        menu.choose(value);
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!selected) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      {...props}
    >
      <span
        aria-hidden
        data-slot="menu-pointer"
        className="invisible group-data-selected/menu-item:visible"
      >
        ▸
      </span>
      <span className="flex min-w-0 flex-col">
        <span>{children}</span>
        {detail !== undefined && (
          <span
            data-slot="menu-detail"
            className="font-body text-label text-muted font-semibold normal-case"
          >
            {detail}
          </span>
        )}
      </span>
      {trailing !== undefined && (
        <span data-slot="menu-trailing" className="text-muted ml-auto pl-4">
          {trailing}
        </span>
      )}
    </button>
  );
};

type MenuStep = -1 | 1;

const stepOf = (key: string, orientation: MenuOrientation): MenuStep | 0 => {
  const cross = orientation === "vertical" ? "horizontal" : "vertical";
  if (forwardKeys[cross].has(key)) {
    return 1;
  }
  return backKeys[cross].has(key) ? -1 : 0;
};

const MenuStepper = ({
  className,
  value,
  label,
  disabled = false,
  onStep,
  onFocus,
  onPointerEnter,
  onKeyDown,
  children,
  ...props
}: Omit<ComponentProps<"button">, "value" | "type" | "onClick"> & {
  readonly value: string;
  readonly label: ReactNode;
  readonly onStep: (step: MenuStep) => void;
}) => {
  const menu = use(MenuContext);
  if (menu === null) {
    throw new Error("MenuStepper must be rendered inside a MenuList");
  }
  const selected = menu.value === value;
  return (
    <button
      data-slot="menu-item"
      data-stepper=""
      data-selected={selected ? "true" : undefined}
      role="menuitem"
      type="button"
      disabled={disabled}
      tabIndex={selected || menu.value === undefined ? 0 : -1}
      className={cn(
        "group/menu-item font-display tracking-display text-text data-selected:text-yellow disabled:text-muted flex items-baseline gap-[0.4em] rounded-sm py-0.5 pr-2 text-left font-bold uppercase transition-colors duration-100",
        menu.size === "md" ? "text-name" : "text-body leading-tight",
        className
      )}
      onClick={() => {
        onStep(1);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        menu.choose(value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        const step = stepOf(event.key, menu.orientation);
        if (step !== 0 && !event.defaultPrevented) {
          event.preventDefault();
          onStep(step);
        }
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!selected) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      {...props}
    >
      <span
        aria-hidden
        data-slot="menu-pointer"
        className="invisible group-data-selected/menu-item:visible"
      >
        ▸
      </span>
      <span className="font-body text-label text-muted min-w-[4.5em] font-semibold">
        {label}
      </span>
      <span
        aria-hidden
        data-slot="menu-step-back"
        className="text-muted group-data-selected/menu-item:text-yellow px-1"
        onClick={(event) => {
          event.stopPropagation();
          onStep(-1);
        }}
      >
        ◄
      </span>
      <span data-slot="menu-step-value" className="numeric whitespace-nowrap">
        {children}
      </span>
      <span
        aria-hidden
        data-slot="menu-step-forward"
        className="text-muted group-data-selected/menu-item:text-yellow px-1"
      >
        ►
      </span>
    </button>
  );
};

export { MenuItem, MenuList, MenuStepper };
