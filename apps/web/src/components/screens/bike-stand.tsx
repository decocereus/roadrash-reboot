import { cn } from "@racer/ui/utils";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { openShowroom } from "../../asset-load.ts";
import { diagnostics } from "../../diagnostics/hub.ts";
import type { Showroom } from "../../game/showroom.ts";

interface BikeStandProps {
  readonly paint: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const BikeStand = ({ paint, className, style }: BikeStandProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Showroom | null>(null);
  const paintRef = useRef(paint);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const mount = new AbortController();
    const load = async (target: HTMLCanvasElement) => {
      try {
        const room = await openShowroom(target, mount.signal);
        if (room === null) {
          return;
        }
        if (mount.signal.aborted) {
          room.dispose();
          return;
        }
        room.show(paintRef.current);
        roomRef.current = room;
      } catch (error) {
        if (mount.signal.aborted) {
          return;
        }
        diagnostics().recorder.fault(
          "error",
          error instanceof Error ? error.message : String(error),
          "showroom"
        );
        setFailed(true);
      }
    };
    if (canvas) {
      void load(canvas);
    }
    return () => {
      mount.abort();
      roomRef.current?.dispose();
      roomRef.current = null;
    };
  }, []);

  useEffect(() => {
    paintRef.current = paint;
    roomRef.current?.show(paint);
  }, [paint]);

  if (failed) {
    return null;
  }
  return (
    <canvas
      aria-hidden
      className={cn("pointer-events-none block size-full", className)}
      ref={canvasRef}
      style={style}
    />
  );
};
