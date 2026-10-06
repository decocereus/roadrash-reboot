import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createCityCourse, laneOffset, roadCenter, roadPoint } from "./city-course";
import { createRaceSnapshot, type RaceSnapshot, type RiderInput } from "./types";
import { RaceAudio } from "./audio";
import { RoomTransport, type RoomSession } from "./transport";

interface RaceSceneProps {
  running: boolean;
  roomSession: RoomSession | null;
  muted: boolean;
  onSnapshot: (snapshot: RaceSnapshot) => void;
  onRoomState: (phase: string) => void;
  onRoomError: (message: string) => void;
  onUnlockAudio: () => void;
  onToggleMute: () => void;
  onFinish: () => void;
}

interface RoadSprite {
  sprite: THREE.Sprite;
  shadow: THREE.Mesh;
  placed: boolean;
}

function loadSpriteTexture(loader: THREE.TextureLoader, name: string): THREE.Texture {
  const texture = loader.load(`/art/${name}.webp`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createRoadSprite(
  texture: THREE.Texture,
  width: number,
  height: number,
  shadowWidth: number,
): RoadSprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    alphaTest: 0.055,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, 0);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 18),
    new THREE.MeshBasicMaterial({
      color: 0x171a1e,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(shadowWidth, shadowWidth * 1.5, 1);
  return { sprite, shadow, placed: false };
}

function placeRoadSprite(
  visual: RoadSprite,
  distance: number,
  lane: number,
  crashed: boolean,
  deltaSeconds: number,
): void {
  const target = roadPoint(distance, laneOffset(lane), crashed ? 0.28 : 0.08);
  if (visual.placed && visual.sprite.position.distanceTo(target) < 12)
    visual.sprite.position.lerp(target, Math.min(1, deltaSeconds * 12));
  else {
    visual.sprite.position.copy(target);
    visual.placed = true;
  }
  visual.shadow.position.copy(roadPoint(distance, laneOffset(lane), 0.035));
  visual.sprite.visible = true;
  visual.shadow.visible = true;
}

function initialInput(): RiderInput {
  return { steer: 0, throttle: false, brake: false, attack: false };
}

function ensureRef<T>(ref: { current: T | null }, create: () => T): T {
  if (ref.current === null) ref.current = create();
  return ref.current;
}

export function RaceScene({
  running,
  roomSession,
  muted,
  onSnapshot,
  onRoomState,
  onRoomError,
  onUnlockAudio,
  onToggleMute,
  onFinish,
}: RaceSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<RiderInput | null>(null);
  const snapshotRef = useRef<RaceSnapshot | null>(null);
  const audioRef = useRef<RaceAudio | null>(null);
  const remoteModeRef = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return undefined;
    const input = ensureRef(inputRef, initialInput);
    ensureRef(snapshotRef, createRaceSnapshot);
    const audio = ensureRef(audioRef, () => new RaceAudio());
    audio.setMuted(muted);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x91bee9);
    scene.fog = new THREE.FogExp2(0x91bee9, 0.0065);
    const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 260);
    camera.position.set(0, 3.7, 8);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: new URLSearchParams(window.location.search).has("capture"),
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8376, 2));
    scene.add(createCityCourse());

    const loader = new THREE.TextureLoader();
    const playerTexture = loadSpriteTexture(loader, "rider-player");
    const attackTexture = loadSpriteTexture(loader, "rider-player-attack");
    const rivalTextures = [
      loadSpriteTexture(loader, "rider-rival-blue"),
      loadSpriteTexture(loader, "rider-rival-copper"),
      loadSpriteTexture(loader, "rider-rival"),
    ];
    const sedanTexture = loadSpriteTexture(loader, "traffic-sedan");
    const bikes = [
      createRoadSprite(playerTexture, 2.7, 3.75, 0.68),
      createRoadSprite(rivalTextures[0], 2.45, 3.4, 0.62),
      createRoadSprite(rivalTextures[1], 2.45, 3.4, 0.62),
      createRoadSprite(rivalTextures[2], 2.45, 3.4, 0.62),
    ];
    const traffic = Array.from({ length: 16 }, () =>
      createRoadSprite(sedanTexture, 3.3, 2.2, 1.05),
    );
    for (const visual of [...bikes, ...traffic]) scene.add(visual.shadow, visual.sprite);

    const transport = new RoomTransport();
    let previousSnapshot: RaceSnapshot | null = null;
    let snapshotReceivedAt = performance.now();
    remoteModeRef.current = roomSession !== null;
    if (roomSession !== null) {
      transport.connect(
        roomSession,
        (remoteSnapshot) => {
          const previous = ensureRef(snapshotRef, createRaceSnapshot);
          remoteModeRef.current = true;
          previousSnapshot = previous;
          snapshotReceivedAt = performance.now();
          snapshotRef.current = remoteSnapshot;
          if (
            remoteSnapshot.phase !== previous.phase &&
            (remoteSnapshot.phase === "finished" || remoteSnapshot.phase === "aborted")
          ) {
            audio.finish();
            onFinish();
          }
          if (remoteSnapshot.player.attackFlash > 0 && previous.player.attackFlash === 0)
            audio.attack();
          if (
            remoteSnapshot.riders.some(
              (rider, index) => rider.health < (previous.riders[index]?.health ?? rider.health),
            )
          )
            audio.impact();
          if (!previous.player.crashed && remoteSnapshot.player.crashed) audio.crash();
          onSnapshot(remoteSnapshot);
        },
        () => {
          remoteModeRef.current = true;
          if (running && roomSession.host) transport.start();
        },
        onRoomState,
        (message) => {
          if (running) onRoomError(message);
        },
      );
    }

    const resize = () => {
      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const onKey = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      if (
        [
          "arrowleft",
          "arrowright",
          "arrowup",
          "arrowdown",
          "a",
          "d",
          "w",
          "s",
          " ",
          "shift",
          "m",
        ].includes(key)
      )
        event.preventDefault();
      if (pressed) {
        audio.unlock();
        onUnlockAudio();
      }
      if (key === "arrowleft" || key === "a")
        input.steer = pressed ? -1 : input.steer === -1 ? 0 : input.steer;
      if (key === "arrowright" || key === "d")
        input.steer = pressed ? 1 : input.steer === 1 ? 0 : input.steer;
      if (key === "w" || key === "arrowup") input.throttle = pressed;
      if (key === "s" || key === "arrowdown" || key === "shift") input.brake = pressed;
      if (key === " ") input.attack = pressed;
      if (key === "m" && pressed) onToggleMute();
    };
    const keyDown = (event: KeyboardEvent) => onKey(event, true);
    const keyUp = (event: KeyboardEvent) => onKey(event, false);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    const inputInterval = window.setInterval(() => {
      if (running && remoteModeRef.current) transport.sendInput(input);
    }, 50);
    let lastFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      const state = ensureRef(snapshotRef, createRaceSnapshot);
      const player = state.player;
      const snapshotAge =
        state.phase === "racing" ? Math.min(0.12, (now - snapshotReceivedAt) / 1000) : 0;
      const snapshotInterval = Math.max(0, state.elapsed - (previousSnapshot?.elapsed ?? 0));
      const visualLane = (rider: RaceSnapshot["riders"][number], index: number): number => {
        const previous = previousSnapshot?.riders[index];
        if (!previous || snapshotInterval === 0 || rider.crashed) return rider.lane;
        const laneSpeed = Math.max(
          -3.3,
          Math.min(3.3, (rider.lane - previous.lane) / snapshotInterval),
        );
        return Math.max(0, Math.min(3, rider.lane + laneSpeed * snapshotAge));
      };
      const visualProgress = (progress: number, speed: number, crashed = false): number =>
        progress + (state.phase === "racing" && !crashed ? (speed / 3.6) * snapshotAge : 0);
      const playerProgress = visualProgress(player.progress, player.speed, player.crashed);
      const playerLane = visualLane(player, 0);
      if (running && remoteModeRef.current) audio.engine(player.speed);

      bikes.forEach((visual, index) => {
        const rider = state.riders[index];
        if (!rider) {
          visual.sprite.visible = false;
          visual.shadow.visible = false;
          return;
        }
        const distance =
          !running && index > 0
            ? [0, 12, 31, 49][index]
            : visualProgress(rider.progress, rider.speed, rider.crashed);
        placeRoadSprite(visual, distance, visualLane(rider, index), rider.crashed, deltaSeconds);
        visual.sprite.material.rotation = rider.crashed
          ? 0.95
          : index === 0
            ? -input.steer * 0.1
            : 0;
        if (index === 0) {
          const nextTexture =
            rider.attackFlash > 0 || (input.attack && running) ? attackTexture : playerTexture;
          if (visual.sprite.material.map !== nextTexture) {
            visual.sprite.material.map = nextTexture;
            visual.sprite.material.needsUpdate = true;
          }
        }
      });
      traffic.forEach((visual, index) => {
        const car = state.traffic[index];
        if (!car) {
          visual.sprite.visible = false;
          visual.shadow.visible = false;
          return;
        }
        const distance = !running && index === 0 ? 19 : visualProgress(car.progress, car.speed);
        const lane = !running && index === 0 ? 3 : car.lane;
        placeRoadSprite(visual, distance, lane, false, deltaSeconds);
        const inView = distance > playerProgress - 22 && distance < playerProgress + 200;
        visual.sprite.visible = inView;
        visual.shadow.visible = inView;
      });

      const cameraTarget = roadPoint(playerProgress, laneOffset(playerLane) * 0.4, 3.65);
      cameraTarget.z += 8.2;
      cameraTarget.y += Math.min(player.speed / 180, 0.23);
      if (Math.abs(camera.position.z - cameraTarget.z) > 20) camera.position.copy(cameraTarget);
      else {
        const follow = Math.min(1, deltaSeconds * 10);
        camera.position.x += (cameraTarget.x - camera.position.x) * follow;
        camera.position.y += (cameraTarget.y - camera.position.y) * follow;
        camera.position.z = cameraTarget.z;
      }
      const lookDistance = playerProgress + 34;
      camera.lookAt(roadCenter(lookDistance) + laneOffset(playerLane) * 0.16, 1.35, -lookDistance);
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
    if (new URLSearchParams(window.location.search).has("capture"))
      window.addEventListener("race-capture", animate);
    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("race-capture", animate);
      window.clearInterval(inputInterval);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      transport.close();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [
    muted,
    onFinish,
    onRoomError,
    onRoomState,
    onSnapshot,
    onToggleMute,
    onUnlockAudio,
    roomSession,
    running,
  ]);

  return (
    <div
      className="race-scene"
      ref={mountRef}
      aria-label="Three dimensional city motorcycle race"
    />
  );
}
