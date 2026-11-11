import type { RoomSeat } from "@racer/rooms/seat-client";
import type { BikeId } from "@racer/sim/bikes";
import { useEffect, useRef, useState } from "react";

import { openBar } from "../asset-load.ts";
import type { BarCamera, BarSpot } from "../bar-view.ts";
import type { BarScene } from "../game/bar.ts";

interface BarStageProps {
  readonly camera: BarCamera;
  readonly seat: RoomSeat | null;
  readonly doorOpen: boolean;
  readonly garageOpen: boolean;
  readonly held: boolean;
  readonly standBike: BikeId;
  readonly onWalkUp: ((spot: BarSpot) => void) | null;
}

export const BarStage = ({
  camera,
  seat,
  doorOpen,
  garageOpen,
  held,
  standBike,
  onWalkUp,
}: BarStageProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const firstCamera = useRef(camera);
  const [scene, setScene] = useState<BarScene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const target = canvas.current;
    const mount = new AbortController();
    let opened: BarScene | null = null;
    const start = async (): Promise<void> => {
      try {
        opened =
          target && (await openBar(target, firstCamera.current, mount.signal));
        if (opened && mount.signal.aborted) {
          opened.dispose();
          opened = null;
        }
        setScene(opened);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : String(error));
      }
    };
    void start();
    return () => {
      mount.abort();
      opened?.dispose();
      setScene(null);
    };
  }, []);
  useEffect(() => {
    scene?.setCamera(camera);
  }, [camera, scene]);
  useEffect(() => {
    scene?.setSeat(seat);
  }, [scene, seat]);
  useEffect(() => {
    scene?.setDoor(doorOpen);
  }, [doorOpen, scene]);
  useEffect(() => {
    scene?.setGarage({ bikeId: standBike, open: garageOpen });
  }, [garageOpen, scene, standBike]);
  useEffect(() => {
    scene?.setHeld(held);
  }, [held, scene]);
  useEffect(() => {
    scene?.setWalkUp(onWalkUp);
  }, [onWalkUp, scene]);
  return (
    <>
      <canvas
        aria-label="The Lowside"
        className="absolute inset-0 block size-full"
        ref={canvas}
      />
      {failed !== null && (
        <p
          className="font-display text-neon-red absolute bottom-16 left-5 text-lg font-bold"
          role="alert"
        >
          The bar did not load: {failed}
        </p>
      )}
    </>
  );
};
