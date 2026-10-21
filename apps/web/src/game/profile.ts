import type * as THREE from "three";

export const parts = [
  "sim",
  "other",
  "riders",
  "fleet",
  "camera",
  "world",
  "matrices",
  "normal",
  "shadow",
  "main",
  "line",
  "bloom",
  "grade",
] as const;

export type Part = (typeof parts)[number];

const CAPACITY = 32_768;
const PENDING_CAPACITY = 1024;
const TIME_ELAPSED = 0x88_bf;
const GPU_DISJOINT = 0x8f_bb;
const UNMASKED_RENDERER = 0x92_46;
const TIMER_EXTENSION = "EXT_disjoint_timer_query_webgl2";
const DEBUG_EXTENSION = "WEBGL_debug_renderer_info";

interface PartColumns {
  readonly cpu: Float32Array;
  readonly gpu: Float32Array;
  readonly calls: Uint32Array;
  readonly triangles: Uint32Array;
}

export interface ProfileFrame {
  readonly frame: number;
  readonly tick: number;
  readonly ticks: number;
  readonly interval: number;
  readonly start: number;
  readonly programs: number;
  readonly textures: number;
  readonly geometries: number;
  readonly pixelRatio: number;
  readonly rung: number;
  readonly drawRung: number;
  readonly sizeEpoch: number;
  readonly drawnEpoch: number;
  readonly discarded: number;
  readonly race: number;
  readonly cpu: readonly number[];
  readonly gpu: readonly number[] | null;
  readonly calls: readonly number[];
  readonly triangles: readonly number[];
}

export interface ProfileInfo {
  readonly parts: readonly Part[];
  readonly renderer: string;
  readonly gpuTimer: boolean;
  readonly frames: number;
  readonly tick: number;
}

export interface ProfileReader {
  readonly info: () => ProfileInfo;
  readonly window: (fromTick: number, toTick: number) => ProfileFrame[];
  readonly frameAt: (frame: number) => ProfileFrame | null;
}

export interface FrameEnd {
  interval: number;
  tick: number;
  ticks: number;
  pixelRatio: number;
  rung: number;
  drawRung: number;
  sizeEpoch: number;
  drawnEpoch: number;
  discarded: number;
  race: number;
}

export interface Profiler {
  readonly reader: ProfileReader;
  readonly start: (frame: number) => void;
  readonly lap: (part: Part) => void;
  readonly finish: (end: FrameEnd) => void;
  readonly dispose: () => void;
}

export type ProfileMode = "off" | "cpu" | "gpu";

export const profileModeOf = (search: string): ProfileMode => {
  const flags = new URLSearchParams(search);
  if (flags.get("prof") === "gpu") {
    return "gpu";
  }
  return flags.has("prof") || flags.has("stress") ? "cpu" : "off";
};

const rendererName = (gl: WebGL2RenderingContext): string =>
  String(
    gl.getParameter(
      gl.getExtension(DEBUG_EXTENSION) === null
        ? gl.RENDERER
        : UNMASKED_RENDERER
    )
  );

const contextOf = (renderer: THREE.WebGLRenderer): WebGL2RenderingContext => {
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) {
    throw new TypeError("Profiling needs a WebGL 2 context.");
  }
  return gl;
};

export const rendererOf = (renderer: THREE.WebGLRenderer): string =>
  rendererName(contextOf(renderer));

export const createProfiler = (
  renderer: THREE.WebGLRenderer,
  timeGpu: boolean
): Profiler => {
  const gl = contextOf(renderer);
  const gpuTimer = timeGpu && gl.getExtension(TIMER_EXTENSION) !== null;
  const rendererLabel = rendererName(gl);
  const columns: PartColumns[] = parts.map(() => ({
    calls: new Uint32Array(CAPACITY),
    cpu: new Float32Array(CAPACITY),
    gpu: new Float32Array(CAPACITY),
    triangles: new Uint32Array(CAPACITY),
  }));
  const ticksAt = new Int32Array(CAPACITY);
  const stepped = new Uint8Array(CAPACITY);
  const intervals = new Float32Array(CAPACITY);
  const starts = new Float64Array(CAPACITY);
  const programs = new Uint16Array(CAPACITY);
  const textures = new Uint16Array(CAPACITY);
  const geometries = new Uint16Array(CAPACITY);
  const ratios = new Float32Array(CAPACITY);
  const rungs = new Uint8Array(CAPACITY);
  const drawRungs = new Uint8Array(CAPACITY);
  const sizeEpochs = new Uint32Array(CAPACITY);
  const drawnEpochs = new Uint32Array(CAPACITY);
  const discards = new Float32Array(CAPACITY);
  const races = new Uint32Array(CAPACITY);
  const ids = new Int32Array(CAPACITY).fill(-1);
  const gpuSeen = new Uint8Array(CAPACITY);
  const free: WebGLQuery[] = [];
  const queued: (WebGLQuery | null)[] = Array.from(
    { length: PENDING_CAPACITY },
    () => null
  );
  const queuedFrame = new Int32Array(PENDING_CAPACITY);
  const queuedPart = new Uint8Array(PENDING_CAPACITY);
  let head = 0;
  let tail = 0;
  let frame = 0;
  let current = 0;
  let slot = 0;
  let mark = 0;
  let lastCalls = 0;
  let lastTriangles = 0;
  let open: WebGLQuery | null = null;
  let tick = 0;

  const release = () => {
    const query = queued[head % PENDING_CAPACITY];
    if (query) {
      free.push(query);
    }
    queued[head % PENDING_CAPACITY] = null;
    head += 1;
  };

  const releaseAll = () => {
    for (let left = tail - head; left > 0; left -= 1) {
      release();
    }
  };

  const ready = (query: WebGLQuery | null): boolean =>
    !query || Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE));

  const collect = () => {
    if (!gpuTimer) {
      return;
    }
    if (gl.getParameter(GPU_DISJOINT) === true) {
      releaseAll();
      return;
    }
    for (let left = tail - head; left > 0; left -= 1) {
      const at = head % PENDING_CAPACITY;
      const query = queued[at] ?? null;
      if (!ready(query)) {
        return;
      }
      const owner = queuedFrame[at] ?? 0;
      const gpu = columns[queuedPart[at] ?? 0]?.gpu;
      const into = owner % CAPACITY;
      if (query && gpu && ids[into] === owner) {
        const nanoseconds = Number(
          gl.getQueryParameter(query, gl.QUERY_RESULT)
        );
        gpu[into] = (gpu[into] ?? 0) + nanoseconds / 1e6;
        gpuSeen[into] = 1;
      }
      release();
    }
  };

  const beginQuery = () => {
    if (!gpuTimer || tail - head >= PENDING_CAPACITY) {
      return;
    }
    open = free.pop() ?? gl.createQuery();
    gl.beginQuery(TIME_ELAPSED, open);
  };

  const endQuery = (part: number) => {
    if (!open) {
      return;
    }
    gl.endQuery(TIME_ELAPSED);
    const at = tail % PENDING_CAPACITY;
    queued[at] = open;
    queuedFrame[at] = current;
    queuedPart[at] = part;
    tail += 1;
    open = null;
  };

  const record = (part: number) => {
    const column = columns[part];
    if (!column) {
      return;
    }
    column.cpu[slot] = (column.cpu[slot] ?? 0) + performance.now() - mark;
    const { calls, triangles } = renderer.info.render;
    column.calls[slot] =
      (column.calls[slot] ?? 0) + Math.max(0, calls - lastCalls);
    column.triangles[slot] =
      (column.triangles[slot] ?? 0) + Math.max(0, triangles - lastTriangles);
    lastCalls = calls;
    lastTriangles = triangles;
    endQuery(part);
  };

  const lap = (part: Part) => {
    record(parts.indexOf(part));
    beginQuery();
    mark = performance.now();
  };

  const { shadowMap } = renderer;
  const renderShadows = shadowMap.render.bind(shadowMap);
  shadowMap.render = (lights, scene, camera) => {
    if (!shadowMap.needsUpdate) {
      renderShadows(lights, scene, camera);
      return;
    }
    lap("normal");
    renderShadows(lights, scene, camera);
    lap("shadow");
  };

  const frameAt = (index: number): ProfileFrame => {
    const at = index % CAPACITY;
    const read = (key: keyof PartColumns): number[] =>
      columns.map((column) => column[key][at] ?? 0);
    return {
      calls: read("calls"),
      cpu: read("cpu"),
      discarded: discards[at] ?? 0,
      drawRung: drawRungs[at] ?? 0,
      drawnEpoch: drawnEpochs[at] ?? 0,
      frame: index,
      geometries: geometries[at] ?? 0,
      gpu: (gpuSeen[at] ?? 0) === 0 ? null : read("gpu"),
      interval: intervals[at] ?? 0,
      pixelRatio: ratios[at] ?? 0,
      programs: programs[at] ?? 0,
      race: races[at] ?? 0,
      rung: rungs[at] ?? 0,
      sizeEpoch: sizeEpochs[at] ?? 0,
      start: starts[at] ?? 0,
      textures: textures[at] ?? 0,
      tick: ticksAt[at] ?? 0,
      ticks: stepped[at] ?? 0,
      triangles: read("triangles"),
    };
  };

  const reader: ProfileReader = {
    frameAt: (index) =>
      index >= 0 && ids[index % CAPACITY] === index ? frameAt(index) : null,
    info: () => ({
      frames: frame,
      gpuTimer,
      parts,
      renderer: rendererLabel,
      tick,
    }),
    window(fromTick, toTick) {
      const frames: ProfileFrame[] = [];
      for (
        let index = Math.max(0, frame - CAPACITY);
        index < frame;
        index += 1
      ) {
        const at = ticksAt[index % CAPACITY] ?? 0;
        if (ids[index % CAPACITY] === index && at >= fromTick && at <= toTick) {
          frames.push(frameAt(index));
        }
      }
      return frames;
    },
  };
  Reflect.set(globalThis, "__rushlineProfile", reader);

  return {
    dispose() {
      shadowMap.render = renderShadows;
      if (open) {
        gl.endQuery(TIME_ELAPSED);
        free.push(open);
      }
      releaseAll();
      for (const query of free) {
        gl.deleteQuery(query);
      }
      Reflect.deleteProperty(globalThis, "__rushlineProfile");
    },
    finish(end) {
      record(parts.indexOf("other"));
      intervals[slot] = end.interval;
      ticksAt[slot] = end.tick;
      stepped[slot] = end.ticks;
      ratios[slot] = end.pixelRatio;
      rungs[slot] = end.rung;
      drawRungs[slot] = end.drawRung;
      sizeEpochs[slot] = end.sizeEpoch;
      drawnEpochs[slot] = end.drawnEpoch;
      discards[slot] = end.discarded;
      races[slot] = end.race;
      ids[slot] = current;
      programs[slot] = renderer.info.programs?.length ?? 0;
      textures[slot] = renderer.info.memory.textures;
      geometries[slot] = renderer.info.memory.geometries;
      ({ tick } = end);
      frame = current + 1;
    },
    lap,
    reader,
    start(id) {
      collect();
      current = id;
      slot = id % CAPACITY;
      ids[slot] = -1;
      for (const column of columns) {
        column.cpu[slot] = 0;
        column.gpu[slot] = 0;
        column.calls[slot] = 0;
        column.triangles[slot] = 0;
      }
      gpuSeen[slot] = 0;
      lastCalls = renderer.info.render.calls;
      lastTriangles = renderer.info.render.triangles;
      mark = performance.now();
      starts[slot] = mark;
      beginQuery();
    },
  };
};
