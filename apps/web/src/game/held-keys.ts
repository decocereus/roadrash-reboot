export interface KeyPress {
  readonly code: string;
  readonly metaKey: boolean;
  readonly repeat: boolean;
}

interface HeldKeys {
  readonly clear: () => void;
  readonly has: (code: string) => boolean;
  readonly press: (event: KeyPress) => boolean;
  readonly release: (code: string) => void;
}

const isCmd = (code: string): boolean =>
  code === "MetaLeft" || code === "MetaRight";

export const createHeldKeys = (): HeldKeys => {
  const held = new Set<string>();
  return {
    clear() {
      held.clear();
    },
    has: (code) => held.has(code),
    press({ code, metaKey, repeat }) {
      if (repeat || metaKey) {
        return false;
      }
      held.add(code);
      return true;
    },
    release(code) {
      held.delete(code);
      if (isCmd(code)) {
        held.clear();
      }
    },
  };
};
