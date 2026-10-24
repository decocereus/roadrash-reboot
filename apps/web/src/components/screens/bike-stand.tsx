import type { BikeId } from "@racer/sim/bikes";
import { cn } from "@racer/ui/utils";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { openShowroom } from "../../asset-load.ts";
import { diagnostics } from "../../diagnostics/hub.ts";
import type { Showroom } from "../../game/showroom.ts";

interface BikeStandProps {
  readonly bikeId: BikeId;
  readonly paint: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const BikeStand = ({
  bikeId,
  paint,
  className,
  style,
}: BikeStandProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Showroom | null>(null);
  const shownRef = useRef({ bikeId, paint });
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
        room.show(shownRef.current.bikeId, shownRef.current.paint);
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
    shownRef.current = { bikeId, paint };
    roomRef.current?.show(bikeId, paint);
  }, [bikeId, paint]);

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
