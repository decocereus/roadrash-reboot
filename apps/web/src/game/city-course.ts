import * as THREE from "three";

export const ROAD_HALF_WIDTH = 6.1;
export const COURSE_LENGTH = 1_900;

const SEGMENT_LENGTH = 3;
const BUILDING_SPACING = 12;

export function roadCenter(distance: number): number {
  return -6.5 * (1 - Math.cos(distance / 76)) + 1.25 * Math.sin(distance / 39);
}

export function laneOffset(lane: number): number {
  return (lane - 1.5) * 2.75;
}

export function roadPoint(distance: number, offset = 0, height = 0): THREE.Vector3 {
  return new THREE.Vector3(roadCenter(distance) + offset, height, -distance);
}

function loadTexture(loader: THREE.TextureLoader, name: string): THREE.Texture {
  const texture = loader.load(`/art/${name}.webp`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function roadStrip(
  inner: number,
  outer: number,
  height: number,
  material: THREE.Material,
  start = -45,
  end = COURSE_LENGTH,
  textureRepeat = 8,
): THREE.Mesh {
  const segments = Math.ceil((end - start) / SEGMENT_LENGTH);
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const distance = start + ((end - start) * index) / segments;
    const center = roadCenter(distance);
    vertices.push(center + inner, height, -distance, center + outer, height, -distance);
    uvs.push(0, distance / textureRepeat, 1, distance / textureRepeat);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function addStreetLamp(group: THREE.Group, distance: number, side: -1 | 1): void {
  const position = roadPoint(distance, side * 7.9);
  const lamp = new THREE.Group();
  lamp.position.copy(position);
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e272d, roughness: 0.65 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.1, 5.2, 7), darkMetal);
  pole.position.y = 2.6;
  lamp.add(pole);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7), glass);
  globe.position.y = 5.2;
  lamp.add(globe);
  group.add(lamp);
}

export function createCityCourse(): THREE.Group {
  const loader = new THREE.TextureLoader();
  const course = new THREE.Group();
  const asphaltTexture = loadTexture(loader, "asphalt");
  asphaltTexture.wrapS = THREE.RepeatWrapping;
  asphaltTexture.wrapT = THREE.RepeatWrapping;
  const facadeTexture = loadTexture(loader, "city-facades");
  const treeTexture = loadTexture(loader, "street-tree");

  const roadMaterial = new THREE.MeshBasicMaterial({ map: asphaltTexture, color: 0xd5d6d8 });
  const sidewalkMaterial = new THREE.MeshBasicMaterial({ color: 0xa8a7a0 });
  const curbMaterial = new THREE.MeshBasicMaterial({ color: 0xdfded3 });
  const whitePaint = new THREE.MeshBasicMaterial({ color: 0xe9e6dc, side: THREE.DoubleSide });
  const yellowPaint = new THREE.MeshBasicMaterial({ color: 0xf2ca54, side: THREE.DoubleSide });
  course.add(roadStrip(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, -0.015, roadMaterial));

  for (const side of [-1, 1] as const) {
    const inner = side * ROAD_HALF_WIDTH;
    const outer = side * 11.5;
    course.add(roadStrip(Math.min(inner, outer), Math.max(inner, outer), -0.05, sidewalkMaterial));
    course.add(
      roadStrip(
        Math.min(inner, inner + side * 0.2),
        Math.max(inner, inner + side * 0.2),
        0.025,
        curbMaterial,
      ),
    );
    course.add(
      roadStrip(
        Math.min(side * 5.65, side * 5.75),
        Math.max(side * 5.65, side * 5.75),
        0.015,
        whitePaint,
      ),
    );
  }

  for (const center of [-0.18, 0.18]) {
    course.add(roadStrip(center - 0.065, center + 0.065, 0.025, yellowPaint));
  }
  for (const offset of [-2.85, 2.85]) {
    for (let distance = -40; distance < COURSE_LENGTH; distance += 10) {
      course.add(
        roadStrip(offset - 0.04, offset + 0.04, 0.025, whitePaint, distance, distance + 3),
      );
    }
  }

  const facadeMaterial = new THREE.MeshBasicMaterial({
    map: facadeTexture,
    side: THREE.DoubleSide,
  });
  const treeMaterial = new THREE.SpriteMaterial({
    map: treeTexture,
    alphaTest: 0.08,
    depthWrite: false,
  });
  const facadeGeometry = new THREE.PlaneGeometry(BUILDING_SPACING + 0.15, 8.6);
  for (let distance = -36; distance < COURSE_LENGTH; distance += BUILDING_SPACING) {
    const tangent = (roadCenter(distance + 1) - roadCenter(distance - 1)) / 2;
    const turn = Math.atan(tangent);
    for (const side of [-1, 1] as const) {
      const facade = new THREE.Mesh(facadeGeometry, facadeMaterial);
      facade.position.copy(roadPoint(distance, side * 11.4, 4.25));
      facade.rotation.y = side === -1 ? Math.PI / 2 - turn : -Math.PI / 2 - turn;
      course.add(facade);
      if (Math.round(distance / BUILDING_SPACING) % 2 === 0) {
        const tree = new THREE.Sprite(treeMaterial);
        tree.position.copy(roadPoint(distance + 4, side * 8.55, 3.45));
        tree.scale.set(4.5, 6.9, 1);
        course.add(tree);
      } else if (Math.round(distance / BUILDING_SPACING) % 3 === 0) {
        addStreetLamp(course, distance + 3, side);
      }
    }
  }

  return course;
}
