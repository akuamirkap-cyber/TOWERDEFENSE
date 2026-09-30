import * as THREE from "three";
import { LANE_END_X, LANE_START_X, type LaneId, type RaidLane, type TrackControl } from "./TrackGenerator";

// Grid collision peta SVG: mencakup arena -80..80 (X) dan -60..60 (Z), tiap sel 2x2 unit.
export const SVG_GRID_W = 80;
export const SVG_GRID_H = 60;
export const SVG_CELL = 2;

const SQRT2 = Math.SQRT2;

interface Band {
  id: LaneId;
  label: string;
  center: number;
  endZ: number;
}

// Empat pita z yang sama dengan generator prosedural, agar jalur tetap terpisah rapi.
const BANDS: Band[] = [
  { id: "north", label: "UTARA", center: -38, endZ: -33 },
  { id: "midNorth", label: "TENGAH ATAS", center: -14.5, endZ: -13 },
  { id: "midSouth", label: "TENGAH BAWAH", center: 14.5, endZ: 13 },
  { id: "south", label: "SELATAN", center: 38, endZ: 33 },
];

export function svgCellX(i: number) {
  return -80 + (i + 0.5) * SVG_CELL;
}

export function svgCellZ(j: number) {
  return -60 + (j + 0.5) * SVG_CELL;
}

export function svgIsWall(walls: Uint8Array, x: number, z: number) {
  const i = Math.floor((x + 80) / SVG_CELL);
  const j = Math.floor((z + 60) / SVG_CELL);
  if (i < 0 || i >= SVG_GRID_W || j < 0 || j >= SVG_GRID_H) return false;
  return walls[j * SVG_GRID_W + i] === 1;
}

// Ada dinding dalam radius `radius` dari titik (untuk validasi penempatan turret).
export function svgBlocked(walls: Uint8Array, x: number, z: number, radius: number) {
  const iMin = Math.max(0, Math.floor((x - radius + 80) / SVG_CELL));
  const iMax = Math.min(SVG_GRID_W - 1, Math.floor((x + radius + 80) / SVG_CELL));
  const jMin = Math.max(0, Math.floor((z - radius + 60) / SVG_CELL));
  const jMax = Math.min(SVG_GRID_H - 1, Math.floor((z + radius + 60) / SVG_CELL));
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      if (walls[j * SVG_GRID_W + i] !== 1) continue;
      const minX = svgCellX(i) - 1;
      const maxX = svgCellX(i) + 1;
      const minZ = svgCellZ(j) - 1;
      const maxZ = svgCellZ(j) + 1;
      const cx = Math.max(minX, Math.min(maxX, x));
      const cz = Math.max(minZ, Math.min(maxZ, z));
      if ((cx - x) ** 2 + (cz - z) ** 2 < radius * radius) return true;
    }
  }
  return false;
}

// Dorong tubuh (orc/mayat) keluar dari sel dinding di sekitarnya.
export function svgCollideWalls(
  walls: Uint8Array,
  body: { x: number; z: number },
  resolve: (x: number, z: number, radius: number) => boolean,
) {
  const i0 = Math.floor((body.x + 80) / SVG_CELL);
  const j0 = Math.floor((body.z + 60) / SVG_CELL);
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    if (j < 0 || j >= SVG_GRID_H) continue;
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      if (i < 0 || i >= SVG_GRID_W) continue;
      if (walls[j * SVG_GRID_W + i] !== 1) continue;
      resolve(svgCellX(i), svgCellZ(j), 1.24);
    }
  }
}

interface PathCell {
  i: number;
  j: number;
}

class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, key: number) {
    this.items.push(item);
    this.keys.push(key);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.keys[parent] <= this.keys[child]) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.items.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.items.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === parent) break;
        this.swap(parent, smallest);
        parent = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    const item = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = item;
    const key = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = key;
  }
}

function inflateWalls(walls: Uint8Array) {
  const out = new Uint8Array(walls.length);
  for (let j = 0; j < SVG_GRID_H; j++) {
    for (let i = 0; i < SVG_GRID_W; i++) {
      if (walls[j * SVG_GRID_W + i] === 1) {
        out[j * SVG_GRID_W + i] = 1;
        continue;
      }
      let blocked = 0;
      for (let dj = -1; dj <= 1 && !blocked; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= SVG_GRID_H) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= SVG_GRID_W) continue;
          if (walls[jj * SVG_GRID_W + ii] === 1) {
            blocked = 1;
            break;
          }
        }
      }
      out[j * SVG_GRID_W + i] = blocked;
    }
  }
  // Tepi barat & timur dipaksa terbuka agar jalur selalu bisa mulai dan selesai.
  for (let j = 0; j < SVG_GRID_H; j++) {
    for (const i of [0, 1, 2, SVG_GRID_W - 3, SVG_GRID_W - 2, SVG_GRID_W - 1]) {
      out[j * SVG_GRID_W + i] = 0;
    }
  }
  return out;
}

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [1, 1, SQRT2], [1, -1, SQRT2],
  [0, 1, 1], [0, -1, 1],
  [-1, 1, SQRT2], [-1, 0, 1], [-1, -1, SQRT2],
];

function findPath(blocked: Uint8Array, separation: Float32Array, band: Band): PathCell[] | null {
  const gScore = new Float32Array(SVG_GRID_W * SVG_GRID_H).fill(Infinity);
  const cameFrom = new Int32Array(SVG_GRID_W * SVG_GRID_H).fill(-1);
  const closed = new Uint8Array(SVG_GRID_W * SVG_GRID_H);
  const heap = new MinHeap();
  const heuristic = (i: number, j: number) =>
    (SVG_GRID_W - 3 - i) + Math.abs(svgCellZ(j) - band.endZ) * 0.02;

  for (let j = 0; j < SVG_GRID_H; j++) {
    const idx = 2 + j * SVG_GRID_W;
    const cost = Math.abs(svgCellZ(j) - band.center) * 0.6;
    gScore[idx] = cost;
    heap.push(idx, cost + heuristic(2, j));
  }

  let iterations = 0;
  while (heap.size > 0 && iterations++ < 90000) {
    const current = heap.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    const ci = current % SVG_GRID_W;
    const cj = (current - ci) / SVG_GRID_W;
    if (ci >= SVG_GRID_W - 3) {
      const path: PathCell[] = [];
      let cursor: number = current;
      while (cursor >= 0) {
        const i = cursor % SVG_GRID_W;
        path.push({ i, j: (cursor - i) / SVG_GRID_W });
        cursor = cameFrom[cursor];
      }
      return path.reverse();
    }
    for (const [dx, dz, baseCost] of DIRS) {
      const ni = ci + dx;
      const nj = cj + dz;
      if (ni < 0 || ni >= SVG_GRID_W || nj < 0 || nj >= SVG_GRID_H) continue;
      const next = nj * SVG_GRID_W + ni;
      if (closed[next] || blocked[next] === 1) continue;
      // Diagonal hanya boleh jika kedua orthogonalthya terbuka (tanpa menyobek sudut dinding).
      if (dx !== 0 && dz !== 0 && (blocked[cj * SVG_GRID_W + ni] === 1 || blocked[nj * SVG_GRID_W + ci] === 1)) continue;
      const centerPull = Math.abs(svgCellZ(nj) - band.center) * 0.045;
      const cost = gScore[current] + baseCost + separation[next] + centerPull;
      if (cost < gScore[next] - 1e-4) {
        gScore[next] = cost;
        cameFrom[next] = current;
        heap.push(next, cost + heuristic(ni, nj));
      }
    }
  }
  return null;
}

function addSeparation(separation: Float32Array, path: readonly PathCell[]) {
  for (let k = 0; k < path.length; k += 2) {
    const { i, j } = path[k];
    for (let dj = -5; dj <= 5; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= SVG_GRID_H) continue;
      for (let di = -5; di <= 5; di++) {
        const ii = i + di;
        if (ii < 0 || ii >= SVG_GRID_W) continue;
        const d = Math.hypot(di, dj);
        if (d <= 5.5) separation[jj * SVG_GRID_W + ii] += (5.5 - d) * 26;
      }
    }
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function laneControlsFromPath(path: readonly PathCell[]): TrackControl[] {
  const points = path.map((cell) => [svgCellX(cell.i), svgCellZ(cell.j)] as TrackControl);
  // Sederhanakan: simpan hanya tikungan.
  const corners: TrackControl[] = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const [ax, az] = points[k - 1];
    const [bx, bz] = points[k];
    const [cx, cz] = points[k + 1];
    const turn = Math.sign(bx - ax) !== Math.sign(cx - bx) || Math.sign(bz - az) !== Math.sign(cz - bz);
    const sharp = Math.abs((cx - bx) * (bz - az) - (bx - ax) * (cz - bz)) > 0.5;
    if (turn || sharp) corners.push(points[k]);
  }
  corners.push(points[points.length - 1]);
  // Percahkan lagi bila jarak antar tikungan terlalu jauh (jaga kurva halus).
  const dense: TrackControl[] = [];
  for (let k = 0; k < corners.length - 1; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[k + 1];
    const distance = Math.hypot(bx - ax, bz - az);
    dense.push(corners[k]);
    const steps = Math.floor(distance / 15);
    for (let s = 1; s <= steps; s++) {
      dense.push([ax + (bx - ax) * s / (steps + 1), az + (bz - az) * s / (steps + 1)]);
    }
  }
  dense.push(corners[corners.length - 1]);
  const startZ = clamp(dense[0][1], -46, 46);
  const endZ = clamp(dense[dense.length - 1][1], -46, 46);
  return [[LANE_START_X, startZ], [-84, startZ], ...dense, [84, endZ], [LANE_END_X, endZ]];
}

function straightControls(band: Band): TrackControl[] {
  const z = clamp(band.center, -46, 46);
  return [
    [LANE_START_X, z], [-70, z], [-45, z], [-20, z], [5, z],
    [30, z], [55, z], [78, z], [LANE_END_X, clamp(band.endZ, -46, 46)],
  ];
}

// Buka koridor selebar jalan di sepanjang setiap lajur agar orc tidak pernah macet.
function carveWalls(walls: Uint8Array, lanes: readonly RaidLane[]) {
  const out = Uint8Array.from(walls);
  for (const lane of lanes) {
    const curve = new THREE.CatmullRomCurve3(
      lane.controls.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      "catmullrom",
      0.22,
    );
    const points = curve.getSpacedPoints(150);
    for (const point of points) {
      const ci = Math.floor((point.x + 80) / SVG_CELL);
      const cj = Math.floor((point.z + 60) / SVG_CELL);
      for (let dj = -3; dj <= 3; dj++) {
        const j = cj + dj;
        if (j < 0 || j >= SVG_GRID_H) continue;
        for (let di = -3; di <= 3; di++) {
          const i = ci + di;
          if (i < 0 || i >= SVG_GRID_W) continue;
          if (Math.hypot(svgCellX(i) - point.x, svgCellZ(j) - point.z) <= 5.3) out[j * SVG_GRID_W + i] = 0;
        }
      }
    }
  }
  return out;
}

export interface SvgLanesResult {
  lanes: RaidLane[];
  carved: Uint8Array;
  rejected: boolean;
}

// Logika murni (tanpa DOM) — bisa diuji di Node.
export function buildLanesFromWalls(walls: Uint8Array): SvgLanesResult {
  let openCount = 0;
  for (let k = 0; k < walls.length; k++) if (walls[k] === 0) openCount++;
  const openFraction = openCount / walls.length;
  const blocked = inflateWalls(walls);
  const separation = new Float32Array(SVG_GRID_W * SVG_GRID_H);
  const lanes: RaidLane[] = [];
  let pathFound = 0;
  for (const band of BANDS) {
    const path = findPath(blocked, separation, band);
    const controls = path ? laneControlsFromPath(path) : straightControls(band);
    if (path) {
      pathFound++;
      addSeparation(separation, path);
    }
    lanes.push({ id: band.id, label: band.label, controls });
  }
  // Peta nyaris solid penuh tanpa satu pun rute -> tolak.
  const rejected = pathFound === 0 && openFraction < 0.1;
  if (rejected) return { lanes, carved: walls, rejected };
  return { lanes, carved: carveWalls(walls, lanes), rejected: false };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal memuat gambar"));
    image.src = src;
  });
}

function decodeDataUrlText(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const payload = dataUrl.slice(comma + 1);
  if (dataUrl.includes(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(payload);
}

// SVG tanpa width/height (hanya viewBox) sering gagal dirasterisasi — tambahkan atributnya.
async function normalizeImageSource(dataUrl: string) {
  if (!dataUrl.includes("image/svg")) return dataUrl;
  let text: string;
  try {
    text = decodeDataUrlText(dataUrl);
  } catch {
    return dataUrl;
  }
  const head = text.slice(0, text.indexOf(">") + 1);
  const hasWidth = /\swidth\s*=\s*["']/i.test(head);
  const hasHeight = /\sheight\s*=\s*["']/i.test(head);
  if (hasWidth && hasHeight) return dataUrl;
  const viewBox = head.match(/viewBox\s*=\s*["']\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)/i);
  const width = viewBox ? Math.max(1, Math.round(parseFloat(viewBox[3]))) : 1024;
  const height = viewBox ? Math.max(1, Math.round(parseFloat(viewBox[4]))) : 1024;
  const patched = text.replace(/<svg/i, `<svg width="${width}" height="${height}"`);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(patched);
}

function rasterizeToWalls(image: HTMLImageElement) {
  const supersample = 4;
  const canvas = document.createElement("canvas");
  canvas.width = SVG_GRID_W * supersample;
  canvas.height = SVG_GRID_H * supersample;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const subPerCell = supersample * supersample;
  const totalSubpixels = SVG_GRID_W * SVG_GRID_H * subPerCell;
  let opaqueTotal = 0;
  const wallSubpixels = new Uint8Array(SVG_GRID_W * SVG_GRID_H);
  for (let j = 0; j < SVG_GRID_H; j++) {
    for (let i = 0; i < SVG_GRID_W; i++) {
      let wallHits = 0;
      for (let sj = 0; sj < supersample; sj++) {
        for (let si = 0; si < supersample; si++) {
          const px = ((j * supersample + sj) * canvas.width + i * supersample + si) * 4;
          const alpha = data[px + 3];
          if (alpha <= 60) continue;
          opaqueTotal++;
          wallHits++;
        }
      }
      wallSubpixels[j * SVG_GRID_W + i] = wallHits;
    }
  }

  // Gambar transparan (hanya bentuk) -> yang digambar = dinding (mode alpha).
  // Gambar padat (mis. denah latar putih) -> area GELAP = dinding, area terang = terbuka.
  const inverted = opaqueTotal / totalSubpixels > 0.62;
  if (inverted) {
    for (let j = 0; j < SVG_GRID_H; j++) {
      for (let i = 0; i < SVG_GRID_W; i++) {
        let wallHits = 0;
        for (let sj = 0; sj < supersample; sj++) {
          for (let si = 0; si < supersample; si++) {
            const px = ((j * supersample + sj) * canvas.width + i * supersample + si) * 4;
            if (data[px + 3] <= 60) continue;
            const luminance = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
            if (luminance < 105) wallHits++;
          }
        }
        wallSubpixels[j * SVG_GRID_W + i] = wallHits;
      }
    }
  }
  const threshold = Math.max(3, Math.floor(subPerCell * 0.25));
  const walls = new Uint8Array(SVG_GRID_W * SVG_GRID_H);
  for (let k = 0; k < walls.length; k++) walls[k] = wallSubpixels[k] >= threshold ? 1 : 0;
  return { walls, inverted };
}

export interface SvgMapResult {
  lanes: RaidLane[];
  walls: Uint8Array;
  inverted: boolean;
  image: HTMLImageElement;
}

export async function loadSvgMap(dataUrl: string): Promise<SvgMapResult | null> {
  const source = await normalizeImageSource(dataUrl);
  const image = await loadImageElement(source);
  const raster = rasterizeToWalls(image);
  const built = buildLanesFromWalls(raster.walls);
  if (built.rejected) return null;
  return { lanes: built.lanes, walls: built.carved, inverted: raster.inverted, image };
}
