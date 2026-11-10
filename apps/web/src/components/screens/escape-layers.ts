export interface EscapePress {
  readonly key: string;
  readonly repeat: boolean;
  readonly preventDefault: () => void;
}

type Listen = (press: (event: EscapePress) => void) => () => void;

export interface EscapeLayers {
  readonly open: (close: () => void) => () => void;
}

export const createEscapeLayers = (listen: Listen): EscapeLayers => {
  const layers: { readonly close: () => void }[] = [];
  let unlisten: (() => void) | null = null;
  const press = (event: EscapePress): void => {
    const top = layers.at(-1);
    if (event.key === "Escape" && !event.repeat && top) {
      event.preventDefault();
      top.close();
    }
  };
  return {
    open(close) {
      const layer = { close };
      layers.push(layer);
      unlisten ??= listen(press);
      return () => {
        const at = layers.indexOf(layer);
        if (at !== -1) {
          layers.splice(at, 1);
        }
        if (layers.length === 0) {
          unlisten?.();
          unlisten = null;
        }
      };
    },
  };
};
