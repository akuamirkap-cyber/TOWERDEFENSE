import * as THREE from "three";

export type TrackControl = readonly [number, number];
export type LaneId = "north" | "midNorth" | "midSouth" | "south";

export interface RaidLane {
  id: LaneId;
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
export const ENTRY_ORDER: LaneId[] = ["north", "midNorth", "midSouth", "south"];

// Horde berbaris dari tepi barat (kiri layar) menuju benteng di tepi timur (kanan layar).
export const LANE_START_X = -92;
export const LANE_END_X = 90;
export const FORTRESS_X = 84;

const LANE_LABELS: Record<LaneId, string> = {
  north: "UTARA",
  midNorth: "TENGAH ATAS",
  midSouth: "TENGAH BAWAH",
  south: "SELATAN",
};

interface LaneBand {
  id: LaneId;
  min: number;
  max: number;
  center: number;
  endZ: number;
}

// Empat koridor paralel barat->timur; pita z dipisah agar jalan tidak bertumpuk.
const LANE_BANDS: LaneBand[] = [
  { id: "north", min: -48, max: -28, center: -38, endZ: -33 },
  { id: "midNorth", min: -20, max: -9, center: -14.5, endZ: -13 },
  { id: "midSouth", min: 9, max: 20, center: 14.5, endZ: 13 },
  { id: "south", min: 28, max: 48, center: 38, endZ: 33 },
];

const NAMES = [
  "FOUR CORRIDORS", "CROSSWIND SIEGE", "THE LONG MARCH", "BRAMBLE FRONT",
  "BORDERLAND RUSH", "WILDWOOD SIEGE", "ASHEN CROSSING", "WOLF'S ASSAULT",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

function controlsFor(seed: number, attempt: number, band: LaneBand): TrackControl[] {
  if (seed === 0) {
    // Peta klasik: empat koridor lurus panjang dari barat ke timur.
    const z = band.center;
    return [
      [LANE_START_X, z], [-70, z], [-50, z], [-30, z], [-10, z],
      [10, z], [30, z], [50, z], [70, z], [LANE_END_X, z],
    ];
  }
  const random = randomGenerator(seed ^ Math.imul(attempt + 1, 0x9e3779b1) ^ (ENTRY_ORDER.indexOf(band.id) + 1) * 0x36b5a23);
  const wander = 5 + random() * 6;
  const jogChance = 0.26;
  const startZ = clamp(band.center + (random() - 0.5) * (band.max - band.min) * 0.6, band.min, band.max);
  const points: TrackControl[] = [
    [LANE_START_X, startZ],
    [LANE_START_X + 13, startZ],
    [LANE_START_X + 26, startZ],
  ];
  let z = startZ;
  let target = startZ;
  let x = LANE_START_X + 38;
  while (x < 68) {
    if (random() < jogChance) {
      // "Jog" Mendadak: lorong bergeser lalu lurus lagi, memberi kesan labirin.
      target = clamp(target + (random() > 0.5 ? 1 : -1) * (7 + random() * 8), band.min + 1, band.max - 1);
    } else {
      target = clamp(target + (band.center - target) * 0.5 + (random() - 0.5) * wander * 1.7, band.min + 1, band.max - 1);
    }
    z = clamp(z + (target - z) * 0.7 + (random() - 0.5) * 2.4, band.min, band.max);
    points.push([x, z]);
    x += 11 + random() * 9;
  }
  const endZ = clamp(band.endZ + (random() - 0.5) * 5, band.min + 2, band.max - 2);
  points.push([72, z], [78, (z + endZ) / 2], [84, endZ], [LANE_END_X, endZ]);
  return points;
}

function validLane(controls: readonly TrackControl[]) {
  const curve = curveFor(controls);
  const length = curve.getLength();
  if (length < 150 || length > 290) return null;
  const samples = curve.getSpacedPoints(70);
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (Math.abs(point.x) > LANE_END_X + 2 || Math.abs(point.z) > 54) return null;
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
      // Koridor yang berbeda tidak boleh saling menumpuk.
      for (const p of first) {
        for (const q of second) {
          if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 6 ** 2) return false;
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
  const makeLanes = (attempt: number) => LANE_BANDS.map((band) => ({
    id: band.id,
    label: LANE_LABELS[band.id],
    controls: controlsFor(seed, attempt, band),
  }));
  if (seed === 0) return makeLanes(0);

  let best: RaidLane[] | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 30; attempt++) {
    const lanes = makeLanes(attempt);
    if (!validLayout(lanes)) continue;
    const totalLength = lanes.reduce((sum, lane) => sum + curveFor(lane.controls).getLength(), 0);
    const score = totalLength * 0.1 + coverageScore(lanes, towers);
    if (score > bestScore) {
      bestScore = score;
      best = lanes;
    }
  }
  // Darurat: koridor lurus yang selalu valid.
  return best ?? makeLanes(0);
}

// Jalan dekoratif buntu agar peta terlihat seperti labirin di screenshot:
// orc tetap hanya berjalan di RaidLane, sisanya hiasan jalan.
export function createDecorRoads(seed: number, lanes: readonly RaidLane[]): TrackControl[][] {
  if (seed === 0) return [];
  const random = randomGenerator(seed ^ 0x5f3759df);
  const roads: TrackControl[][] = [];
  const clearOfFortress = (x: number, z: number) => (x - FORTRESS_X) ** 2 + z * z >= 13 ** 2;

  for (const lane of lanes) {
    const branches = 2 + Math.floor(random() * 2);
    for (let branch = 0; branch < branches; branch++) {
      const index = 2 + Math.floor(random() * Math.max(1, lane.controls.length - 4));
      const [px, pz] = lane.controls[index];
      let dir = random() > 0.5 ? 1 : -1;
      if (!clearOfFortress(px, pz + dir * 12)) dir = -dir;
      if (!clearOfFortress(px, pz + dir * 12)) continue;
      const reach = 9 + random() * 9;
      const run = 13 + random() * 26;
      const runDir = random() > 0.5 ? 1 : -1;
      const baseZ = pz + dir * reach;
      const tailZ = clamp(baseZ + (random() - 0.5) * 8, -84, 84);
      const points: TrackControl[] = [
        [px, pz],
        [px + runDir * 2, pz + dir * reach * 0.5],
        [clamp(px + runDir * run * 0.4, -104, 104), baseZ],
        [clamp(px + runDir * run * 0.8, -104, 104), baseZ],
        [clamp(px + runDir * run, -104, 104), tailZ],
      ];
      if (points.every(([x, z]) => clearOfFortress(x, z) && Math.abs(z) < 86 && Math.abs(x) < 106)) roads.push(points);
    }
  }

  const stubs = 3 + Math.floor(random() * 3);
  for (let stub = 0; stub < stubs; stub++) {
    const fromNorth = random() > 0.5;
    const x = clamp(-64 + random() * 128, -100, 66);
    const edgeZ = fromNorth ? -60 - random() * 20 : 60 + random() * 20;
    const depth = 14 + random() * 18;
    const tipZ = fromNorth ? edgeZ + depth : edgeZ - depth;
    if (!clearOfFortress(x, tipZ)) continue;
    roads.push([[x, edgeZ], [x, (edgeZ + tipZ) / 2], [x + (random() - 0.5) * 8, tipZ]]);
  }
  return roads;
}

export function isValidRaidLanes(value: unknown): value is RaidLane[] {
  if (!Array.isArray(value) || value.length !== ENTRY_ORDER.length) return false;
  const lanes: RaidLane[] = [];
  for (let index = 0; index < ENTRY_ORDER.length; index++) {
    const candidate = value[index] as Partial<RaidLane> | null;
    const id = ENTRY_ORDER[index];
    if (!candidate || candidate.id !== id || !Array.isArray(candidate.controls)) return false;
    const controls = candidate.controls;
    if (controls.length < 8 || controls.length > 48) return false;
    if (!controls.every((point) => Array.isArray(point) && point.length === 2 &&
      point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)))) return false;
    if (controls[0][0] !== LANE_START_X || controls[controls.length - 1][0] !== LANE_END_X) return false;
    lanes.push({ id, label: LANE_LABELS[id], controls });
  }
  return validLayout(lanes);
}

export function trackName(seed: number) {
  return seed === 0 ? "FOUR CORRIDORS" : NAMES[seed % NAMES.length];
}
