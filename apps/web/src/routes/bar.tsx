import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { openBar } from "../asset-load.ts";

const BarPage = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const target = canvas.current;
    const mount = new AbortController();
    let close = (): void => {
      mount.abort();
    };
    const start = async (): Promise<void> => {
      try {
        const room = target && (await openBar(target, mount.signal));
        if (room) {
          close = () => {
            mount.abort();
            room.dispose();
          };
        }
      } catch (error) {
        setFailed(error instanceof Error ? error.message : String(error));
      }
    };
    void start();
    return () => {
      close();
    };
  }, []);
  return (
    <main aria-label="The Lowside" className="bg-ink fixed inset-0">
      <canvas className="block size-full" ref={canvas} />
      {failed !== null && (
        <p className="text-paper absolute top-4 left-4">{failed}</p>
      )}
      <p className="font-display text-paper/80 pointer-events-none absolute bottom-3 left-4 tracking-wide uppercase">
        Click a rider. R revs. T moves the clock. G for the garage. Space opens
        the door.
      </p>
    </main>
  );
};

export const Route = createFileRoute("/bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: BarPage,
  head: () => ({
    meta: [{ title: "The Lowside" }, { content: "noindex", name: "robots" }],
  }),
  ssr: false,
});
