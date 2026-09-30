import * as THREE from "three";

export type TrackControl = readonly [number, number];
export type EntrySide = "west" | "north" | "east" | "south";

export interface RaidLane {
  id: EntrySide;
  label: string;
  controls: TrackControl[];
}

interface TowerPosition {
  x: number;
  z: number;
}

export const MAP_HALF_X = 80;
export const MAP_HALF_Z = 60;
export const VISUAL_HALF_X = MAP_HALF_X + 40;
export const VISUAL_HALF_Z = MAP_HALF_Z + 35;
export const ENTRY_ORDER: EntrySide[] = ["west", "north", "east", "south"];

const LANE_LABELS: Record<EntrySide, string> = {
  west: "BARAT",
  north: "UTARA",
  east: "TIMUR",
  south: "SELATAN",
};

const DEFAULT_CONTROLS: Record<EntrySide, TrackControl[]> = {
  west: [
    [-72, -13], [-64, -13], [-58, -20], [-51, -29], [-42, -30], [-34, -26],
    [-29, -18], [-24, -11], [-18, -5], [-12, -1], [-6, 0], [0, 0],
  ],
  north: [
    [-12, -55], [-12, -48], [-18, -41], [-22, -33], [-18, -26],
    [-13, -21], [-8, -16], [-5, -11], [-2, -6], [0, 0],
  ],
  east: [
    [72, 13], [64, 13], [58, 20], [51, 29], [42, 30], [34, 26],
    [29, 18], [24, 11], [18, 5], [12, 1], [6, 0], [0, 0],
  ],
  south: [
    [12, 55], [12, 48], [18, 41], [22, 33], [18, 26],
    [13, 21], [8, 16], [5, 11], [2, 6], [0, 0],
  ],
};

const NAMES = [
  "FOUR WINDS", "CROSSWIND SIEGE", "THE OUTER MARCH", "BRAMBLE FRONT",
  "BORDERLAND RUSH", "WILDWOOD SIEGE", "ASHEN CROSSING", "WOLF'S ASSAULT",
];

function randomGenerator(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function curveFor(controls: readonly TrackControl[]) {
  return new THREE.CatmullRomCurve3(
    controls.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "catmullrom",
    0.22,
  );
}

function controlsFor(seed: number, attempt: number, side: EntrySide): TrackControl[] {
  const controls = DEFAULT_CONTROLS[side];
  if (seed === 0) return controls.map(([x, z]) => [x, z]);
  const random = randomGenerator(seed ^ Math.imul(attempt + 1, 0x9e3779b1) ^ (ENTRY_ORDER.indexOf(side) + 1) * 0x36b5a23);
  const drift = (random() - 0.5) * 3.2;

  return controls.map(([x, z], index) => {
    if (index < 2 || index >= controls.length - 2) return [x, z];
    const before = controls[index - 1];
    const after = controls[index + 1];
    const tangentX = after[0] - before[0];
    const tangentZ = after[1] - before[1];
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const envelope = Math.sin((index / (controls.length - 1)) * Math.PI);
    const offset = ((random() - 0.5) * 5.4 + drift * 0.55) * envelope;
    const forward = (random() - 0.5) * 1.8 * envelope;
    return [
      x - tangentZ / tangentLength * offset + tangentX / tangentLength * forward,
      z + tangentX / tangentLength * offset + tangentZ / tangentLength * forward,
    ];
  });
}

function validLane(controls: readonly TrackControl[]) {
  const curve = curveFor(controls);
  const length = curve.getLength();
  if (length < 70 || length > 155) return null;
  const samples = curve.getSpacedPoints(70);
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (Math.abs(point.x) > MAP_HALF_X - 5 || Math.abs(point.z) > MAP_HALF_Z - 3) return null;
    if (i > samples.length - 9) continue;
    for (let j = i + 7; j < samples.length - 8; j++) {
      const other = samples[j];
      if ((point.x - other.x) ** 2 + (point.z - other.z) ** 2 < 4.6 ** 2) return null;
    }
  }
  return { length, samples };
}

function validLayout(lanes: readonly RaidLane[]) {
  const inspected = lanes.map((lane) => validLane(lane.controls));
  if (inspected.some((lane) => !lane)) return false;
  for (let a = 0; a < lanes.length; a++) {
    for (let b = a + 1; b < lanes.length; b++) {
      const first = inspected[a]!.samples;
      const second = inspected[b]!.samples;
      // Distinct lanes can meet only in the inner keep approach.
      for (const p of first) {
        if (Math.hypot(p.x, p.z) < 13) continue;
        for (const q of second) {
          if (Math.hypot(q.x, q.z) < 13) continue;
          if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 5.8 ** 2) return false;
        }
      }
    }
  }
  return true;
}

function coverageScore(lanes: readonly RaidLane[], towers: readonly TowerPosition[]) {
  let score = 0;
  for (const tower of towers) {
    let nearest = Infinity;
    for (const lane of lanes) {
      const points = lane.controls;
      for (let index = 0; index < points.length - 1; index++) {
        const a = points[index];
        const b = points[index + 1];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((tower.x - a[0]) * dx + (tower.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        nearest = Math.min(nearest, Math.hypot(tower.x - a[0] - dx * t, tower.z - a[1] - dz * t));
      }
    }
    score += nearest < 4.2 ? -(4.2 - nearest) * 12 : nearest < 11 ? 7 : -Math.min(8, nearest - 11);
  }
  return score;
}

export function createRaidLanes(seed: number, towers: readonly TowerPosition[]): RaidLane[] {
  const makeLanes = (attempt: number) => ENTRY_ORDER.map((id) => ({
    id,
    label: LANE_LABELS[id],
    controls: controlsFor(seed, attempt, id),
  }));
  if (seed === 0) return makeLanes(0);

  let best: RaidLane[] | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 22; attempt++) {
    const lanes = makeLanes(attempt);
    if (!validLayout(lanes)) continue;
    const totalLength = lanes.reduce((sum, lane) => sum + curveFor(lane.controls).getLength(), 0);
    const score = totalLength * 0.12 + coverageScore(lanes, towers);
    if (score > bestScore) {
      bestScore = score;
      best = lanes;
    }
  }
  return best ?? makeLanes(0);
}

export function isValidRaidLanes(value: unknown): value is RaidLane[] {
  if (!Array.isArray(value) || value.length !== ENTRY_ORDER.length) return false;
  const lanes: RaidLane[] = [];
  for (let index = 0; index < ENTRY_ORDER.length; index++) {
    const candidate = value[index] as Partial<RaidLane> | null;
    const side = ENTRY_ORDER[index];
    if (!candidate || candidate.id !== side || !Array.isArray(candidate.controls)) return false;
    const controls = candidate.controls;
    const reference = DEFAULT_CONTROLS[side];
    if (controls.length !== reference.length || !controls.every((point) => Array.isArray(point) && point.length === 2 &&
      point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)))) return false;
    if (controls[0][0] !== reference[0][0] || controls[0][1] !== reference[0][1]) return false;
    const end = controls[controls.length - 1];
    if (end[0] !== 0 || end[1] !== 0) return false;
    lanes.push({ id: side, label: LANE_LABELS[side], controls });
  }
  return validLayout(lanes);
}

export function trackName(seed: number) {
  return seed === 0 ? "FOUR FRONTS" : NAMES[seed % NAMES.length];
}