import type * as THREE from "three";

const SHARED =
  "position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;will-change:transform;font-family:'Saira Extra Condensed',Impact,sans-serif;font-weight:800;letter-spacing:0.04em;";
const NAME_STYLE = `${SHARED}background:#14081f;color:#fff7ea;font-size:17px;line-height:1;padding:4px 9px 5px;border-radius:4px;`;
const BUBBLE_STYLE = `${SHARED}background:#fff7ea;color:#14081f;font-size:18px;line-height:1;padding:7px 12px 8px;border-radius:14px;transition:opacity 160ms;opacity:0;`;
const NEAR = 14;
const SMALLEST = 0.7;
const LARGEST = 1.05;

export interface Tag {
  readonly set: (
    world: THREE.Vector3,
    camera: THREE.Camera,
    size: { readonly width: number; readonly height: number }
  ) => void;
  readonly show: (visible: boolean) => void;
}

export interface TagLayer {
  readonly name: (label: string) => Tag;
  readonly bubble: (line: string) => Tag;
  readonly dispose: () => void;
}

export const createTagLayer = (canvas: HTMLCanvasElement): TagLayer => {
  const layer = document.createElement("div");
  layer.style.cssText =
    "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
  canvas.parentNode?.append(layer);

  const made = (label: string, style: string, lift: number): Tag => {
    const element = document.createElement("div");
    element.style.cssText = style;
    element.textContent = label;
    layer.replaceChildren(...layer.childNodes, element);
    let spot: THREE.Vector3 | null = null;
    return {
      set(world, camera, { height, width }) {
        spot ??= world.clone();
        const away = camera.position.distanceTo(world);
        spot.copy(world).project(camera);
        element.style.visibility = spot.z > 1 ? "hidden" : "visible";
        const x = (spot.x * 0.5 + 0.5) * width;
        const y = (0.5 - spot.y * 0.5) * height;
        const scale = Math.min(LARGEST, Math.max(SMALLEST, NEAR / away));
        element.style.transform = `translate3d(${x.toFixed(1)}px,${(y - lift * scale).toFixed(1)}px,0) translate(-50%,-100%) scale(${scale.toFixed(3)})`;
      },
      show(visible) {
        element.style.opacity = visible ? "1" : "0";
      },
    };
  };

  return {
    bubble: (line) => made(line, BUBBLE_STYLE, 30),
    dispose() {
      layer.remove();
    },
    name: (label) => made(label, NAME_STYLE, 0),
  };
};
