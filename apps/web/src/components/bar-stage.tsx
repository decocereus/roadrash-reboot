import type { RoomSeat } from "@racer/rooms/seat-client";
import { cn } from "@racer/ui/utils";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode } from "react";

import { openBar } from "../asset-load.ts";
import {
  barCameraLabels,
  barCameras,
  saveBarCamera,
  savedBarCamera,
} from "../bar-view.ts";
import type { BarCamera } from "../bar-view.ts";
import type { BarScene } from "../game/bar.ts";

const NEXT_CAMERA_KEY = "KeyC";

interface BarStageProps {
  readonly children?: ReactNode;
  readonly seat: RoomSeat | null;
}

export const BarStage = ({ children, seat }: BarStageProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const room = useRef<BarScene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [camera, setCamera] = useState<BarCamera>(savedBarCamera);
  const pickCamera = useEffectEvent((next: BarCamera) => {
    setCamera(next);
    saveBarCamera(next);
    room.current?.setCamera(next);
  });
  useEffect(() => {
    const target = canvas.current;
    const mount = new AbortController();
    let close = (): void => {
      mount.abort();
    };
    const start = async (): Promise<void> => {
      try {
        const opened =
          target &&
          (await openBar(target, savedBarCamera(), seat, mount.signal));
        if (opened) {
          room.current = opened;
          close = () => {
            mount.abort();
            room.current = null;
            opened.dispose();
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
  }, [seat]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === NEXT_CAMERA_KEY && !event.repeat) {
        const next = (barCameras.indexOf(camera) + 1) % barCameras.length;
        pickCamera(barCameras[next] ?? "angled");
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [camera]);
  return (
    <main aria-label="The Lowside" className="bg-ink fixed inset-0">
      <canvas className="block size-full" ref={canvas} />
      {failed !== null && (
        <p className="text-paper absolute top-4 left-4">{failed}</p>
      )}
      <div
        aria-label="Camera"
        className="bg-ink/85 font-display absolute top-4 left-4 flex gap-1 rounded-md p-1 font-bold tracking-wide uppercase"
        role="group"
      >
        {barCameras.map((option) => (
          <button
            aria-pressed={option === camera}
            className={cn(
              "cursor-pointer rounded px-3 py-1",
              option === camera ? "bg-neon-yellow text-ink" : "text-paper"
            )}
            key={option}
            onClick={(event) => {
              event.currentTarget.blur();
              pickCamera(option);
            }}
            tabIndex={-1}
            type="button"
          >
            {barCameraLabels[option]}
          </button>
        ))}
      </div>
      <p className="font-display text-paper/80 pointer-events-none absolute bottom-3 left-4 tracking-wide uppercase">
        WASD or click to move. Shift runs. E greets or sits. F shoves. 1 2 3
        pose. C camera.
      </p>
      {children}
    </main>
  );
};
