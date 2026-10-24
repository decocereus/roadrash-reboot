import * as THREE from "three";

import { isMesh } from "./meshes.ts";
import { uploadSpan } from "./uploads.ts";

const CLEARANCE = 2;
const CELL = 8;
const CELL_OFFSET = 32_768;
const CELL_SPAN = 65_536;

interface Extent {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly bottom: number;
  readonly top: number;
}

interface Placed {
  readonly kind: "instance";
  readonly meshes: readonly THREE.InstancedMesh[];
  readonly index: number;
  readonly pose: THREE.Matrix4;
  readonly extents: readonly Extent[];
  hidden: boolean;
}

interface Standing {
  readonly kind: "object";
  readonly parts: readonly THREE.Mesh[];
  readonly extents: readonly Extent[];
  hidden: boolean;
}

type Unit = Placed | Standing;

export interface Clearance {
  addInstance: (
    meshes: readonly THREE.InstancedMesh[],
    index: number,
    pose: THREE.Matrix4
  ) => void;
  addObject: (root: THREE.Object3D) => void;
  follow: (eye: THREE.Vector3) => void;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const corner = new THREE.Vector3();

const footprintOf = (geometry: THREE.BufferGeometry): Extent => {
  const position = geometry.getAttribute("position");
  const box = new THREE.Box3();
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(corner.fromBufferAttribute(position, index));
  }
  const x = (box.min.x + box.max.x) / 2;
  const z = (box.min.z + box.max.z) / 2;
  let radius = 0;
  for (let index = 0; index < position.count; index += 1) {
    radius = Math.max(
      radius,
      Math.hypot(position.getX(index) - x, position.getZ(index) - z)
    );
  }
  return { bottom: box.min.y, radius, top: box.max.y, x, z };
};

const placedAt = (footprint: Extent, matrix: THREE.Matrix4): Extent => {
  const scale = matrix.getMaxScaleOnAxis();
  corner.set(footprint.x, footprint.bottom, footprint.z).applyMatrix4(matrix);
  return {
    bottom: corner.y,
    radius: footprint.radius * scale,
    top: corner.y + (footprint.top - footprint.bottom) * scale,
    x: corner.x,
    z: corner.z,
  };
};

const gapTo = (extent: Extent, eye: THREE.Vector3): number =>
  Math.hypot(
    Math.max(0, Math.hypot(eye.x - extent.x, eye.z - extent.z) - extent.radius),
    Math.max(0, extent.bottom - eye.y, eye.y - extent.top)
  );

const reaches = (unit: Unit, eye: THREE.Vector3): boolean =>
  unit.extents.some((extent) => gapTo(extent, eye) <= CLEARANCE);

const cellOf = (metres: number): number => Math.floor(metres / CELL);

const keyOf = (column: number, row: number): number =>
  (column + CELL_OFFSET) * CELL_SPAN + row + CELL_OFFSET;

const show = (unit: Unit, shown: boolean): void => {
  unit.hidden = !shown;
  switch (unit.kind) {
    case "instance": {
      for (const mesh of unit.meshes) {
        mesh.setMatrixAt(unit.index, shown ? unit.pose : HIDDEN);
        uploadSpan(mesh.instanceMatrix, unit.index, unit.index + 1);
      }
      return;
    }
    case "object": {
      for (const part of unit.parts) {
        part.visible = shown;
      }
      return;
    }
    default: {
      return unit satisfies never;
    }
  }
};

export const createClearance = (): Clearance => {
  const cells = new Map<number, Unit[]>();
  const footprints = new Map<THREE.BufferGeometry, Extent>();
  const hidden: Unit[] = [];

  const footprint = (geometry: THREE.BufferGeometry): Extent => {
    const known = footprints.get(geometry);
    if (known) {
      return known;
    }
    const measured = footprintOf(geometry);
    footprints.set(geometry, measured);
    return measured;
  };

  const file = (unit: Unit): void => {
    for (const extent of unit.extents) {
      const reach = extent.radius + CLEARANCE;
      const lastColumn = cellOf(extent.x + reach);
      const lastRow = cellOf(extent.z + reach);
      for (
        let column = cellOf(extent.x - reach);
        column <= lastColumn;
        column += 1
      ) {
        for (let row = cellOf(extent.z - reach); row <= lastRow; row += 1) {
          const key = keyOf(column, row);
          const units = cells.get(key) ?? [];
          if (!units.includes(unit)) {
            units.push(unit);
          }
          cells.set(key, units);
        }
      }
    }
  };

  return {
    addInstance(meshes, index, pose) {
      file({
        extents: meshes.map((mesh) => placedAt(footprint(mesh.geometry), pose)),
        hidden: false,
        index,
        kind: "instance",
        meshes,
        pose: pose.clone(),
      });
    },
    addObject(root) {
      root.updateWorldMatrix(true, true);
      const parts: THREE.Mesh[] = [];
      root.traverse((node) => {
        if (isMesh(node)) {
          parts.push(node);
        }
      });
      file({
        extents: parts.map((part) =>
          placedAt(footprint(part.geometry), part.matrixWorld)
        ),
        hidden: false,
        kind: "object",
        parts,
      });
    },
    follow(eye) {
      for (let index = hidden.length - 1; index >= 0; index -= 1) {
        const unit = hidden[index];
        if (unit && !reaches(unit, eye)) {
          show(unit, true);
          const last = hidden.pop();
          if (last && index < hidden.length) {
            hidden[index] = last;
          }
        }
      }
      const near = cells.get(keyOf(cellOf(eye.x), cellOf(eye.z)));
      if (!near) {
        return;
      }
      for (const unit of near) {
        if (!unit.hidden && reaches(unit, eye)) {
          show(unit, false);
          hidden.push(unit);
        }
      }
    },
  };
};
