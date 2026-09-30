import * as THREE from "three";
import type { LaneId, RaidLane, TrackControl } from "./TrackGenerator";

// Grid collision dinamis: ukuran arena mengikuti aspek PNG yang diunggah.
export const SVG_CELL = 2;

export interface CollisionGrid {
  walls: Uint8Array; // 1 = solid (tidak bisa dilewati orc / turret)
  gw: number; // jumlah kolom sel
  gh: number; // jumlah baris sel
  halfX: number; // setengah lebar arena (unit dunia)
  halfZ: number; // setengah tinggi arena (unit dunia)
  startX: number; // tepi barat luar arena (titik spawn orc)
  endX: number; // tepi timur luar arena (arah benteng)
}

export function gridCellX(grid: CollisionGrid, i: number) {
  return -grid.halfX + (i + 0.5) * SVG_CELL;
}

export function gridCellZ(grid: CollisionGrid, j: number) {
  return -grid.halfZ + (j + 0.5) * SVG_CELL;
}

export function gridIsWall(grid: CollisionGrid, x: number, z: number) {
  const i = Math.floor((x + grid.halfX) / SVG_CELL);
  const j = Math.floor((z + grid.halfZ) / SVG_CELL);
  if (i < 0 || i >= grid.gw || j < 0 || j >= grid.gh) return false;
  return grid.walls[j * grid.gw + i] === 1;
}

// Ada dinding dalam radius `radius` dari titik (validasi penempatan turret).
export function gridBlocked(grid: CollisionGrid, x: number, z: number, radius: number) {
  const iMin = Math.max(0, Math.floor((x - radius + grid.halfX) / SVG_CELL));
  const iMax = Math.min(grid.gw - 1, Math.floor((x + radius + grid.halfX) / SVG_CELL));
  const jMin = Math.max(0, Math.floor((z - radius + grid.halfZ) / SVG_CELL));
  const jMax = Math.min(grid.gh - 1, Math.floor((z + radius + grid.halfZ) / SVG_CELL));
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      if (grid.walls[j * grid.gw + i] !== 1) continue;
      const minX = gridCellX(grid, i) - 1;
      const maxX = gridCellX(grid, i) + 1;
      const minZ = gridCellZ(grid, j) - 1;
      const maxZ = gridCellZ(grid, j) + 1;
      const cx = Math.max(minX, Math.min(maxX, x));
      const cz = Math.max(minZ, Math.min(maxZ, z));
      if ((cx - x) ** 2 + (cz - z) ** 2 < radius * radius) return true;
    }
  }
  return false;
}

// Dorong tubuh (orc/mayat) keluar dari sel dinding di sekitarnya.
export function gridCollide(
  grid: CollisionGrid,
  body: { x: number; z: number },
  resolve: (x: number, z: number, radius: number) => boolean,
) {
  const i0 = Math.floor((body.x + grid.halfX) / SVG_CELL);
  const j0 = Math.floor((body.z + grid.halfZ) / SVG_CELL);
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    if (j < 0 || j >= grid.gh) continue;
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      if (i < 0 || i >= grid.gw) continue;
      if (grid.walls[j * grid.gw + i] !== 1) continue;
      resolve(gridCellX(grid, i), gridCellZ(grid, j), 1.24);
    }
  }
}

const SQRT2 = Math.SQRT2;

interface Band {
  id: LaneId;
  label: string;
  center: number;
  endZ: number;
}

// Pita z dasar (skala 60); dikalikan dengan halfZ aktual saat pemuatan.
const BASE_BANDS: Band[] = [
  { id: "north", label: "UTARA", center: -38, endZ: -33 },
  { id: "midNorth", label: "TENGAH ATAS", center: -14.5, endZ: -13 },
  { id: "midSouth", label: "TENGAH BAWAH", center: 14.5, endZ: 13 },
  { id: "south", label: "SELATAN", center: 38, endZ: 33 },
];

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

function inflateWalls(grid: CollisionGrid, transparent: Uint8Array) {
  const out = new Uint8Array(grid.walls);
  for (let j = 0; j < grid.gh; j++) {
    for (let i = 0; i < grid.gw; i++) {
      const cell = j * grid.gw + i;
      if (out[cell] === 1) continue;
      let blocked = 0;
      for (let dj = -1; dj <= 1 && !blocked; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= grid.gh) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= grid.gw) continue;
          if (grid.walls[jj * grid.gw + ii] === 1) {
            blocked = 1;
            break;
          }
        }
      }
      out[cell] = blocked;
    }
  }
  // Pintu masuk/keluar HANYA di sel tepi yang transparan pada PNG aslinya:
  // orc masuk lewat area terbuka yang menyentuh tepi barat, keluar di tepi timur.
  for (let j = 0; j < grid.gh; j++) {
    for (let i = 0; i < 3; i++) {
      if (transparent[j * grid.gw + i] === 1) out[j * grid.gw + i] = 0;
    }
    for (let i = grid.gw - 3; i < grid.gw; i++) {
      if (transparent[j * grid.gw + i] === 1) out[j * grid.gw + i] = 0;
    }
  }
  return out;
}

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [1, 1, SQRT2], [1, -1, SQRT2],
  [0, 1, 1], [0, -1, 1],
  [-1, 1, SQRT2], [-1, 0, 1], [-1, -1, SQRT2],
];

interface PathCell {
  i: number;
  j: number;
}

function findPath(grid: CollisionGrid, blocked: Uint8Array, separation: Float32Array, band: Band): PathCell[] | null {
  const gScore = new Float32Array(grid.gw * grid.gh).fill(Infinity);
  const cameFrom = new Int32Array(grid.gw * grid.gh).fill(-1);
  const closed = new Uint8Array(grid.gw * grid.gh);
  const heap = new MinHeap();
  const heuristic = (i: number, j: number) =>
    (grid.gw - 3 - i) + Math.abs(gridCellZ(grid, j) - band.endZ) * 0.02;

  for (let j = 0; j < grid.gh; j++) {
    const idx = 2 + j * grid.gw;
    if (blocked[idx] === 1) continue; // orc hanya mulai dari area transparan
    const cost = Math.abs(gridCellZ(grid, j) - band.center) * 0.6;
    gScore[idx] = cost;
    heap.push(idx, cost + heuristic(2, j));
  }

  let iterations = 0;
  while (heap.size > 0 && iterations++ < 200000) {
    const current = heap.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    const ci = current % grid.gw;
    const cj = (current - ci) / grid.gw;
    if (ci >= grid.gw - 3) {
      const path: PathCell[] = [];
      let cursor: number = current;
      while (cursor >= 0) {
        const i = cursor % grid.gw;
        path.push({ i, j: (cursor - i) / grid.gw });
        cursor = cameFrom[cursor];
      }
      return path.reverse();
    }
    for (const [dx, dz, baseCost] of DIRS) {
      const ni = ci + dx;
      const nj = cj + dz;
      if (ni < 0 || ni >= grid.gw || nj < 0 || nj >= grid.gh) continue;
      const next = nj * grid.gw + ni;
      if (closed[next] || blocked[next] === 1) continue;
      if (dx !== 0 && dz !== 0 && (blocked[cj * grid.gw + ni] === 1 || blocked[nj * grid.gw + ci] === 1)) continue;
      const centerPull = Math.abs(gridCellZ(grid, nj) - band.center) * 0.045;
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

function addSeparation(separation: Float32Array, grid: CollisionGrid, path: readonly PathCell[]) {
  for (let k = 0; k < path.length; k += 2) {
    const { i, j } = path[k];
    for (let dj = -5; dj <= 5; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= grid.gh) continue;
      for (let di = -5; di <= 5; di++) {
        const ii = i + di;
        if (ii < 0 || ii >= grid.gw) continue;
        const d = Math.hypot(di, dj);
        if (d <= 5.5) separation[jj * grid.gw + ii] += (5.5 - d) * 26;
      }
    }
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function laneControlsFromPath(path: readonly PathCell[], grid: CollisionGrid): TrackControl[] {
  const points = path.map((cell) => [gridCellX(grid, cell.i), gridCellZ(grid, cell.j)] as TrackControl);
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
  const startZ = clamp(dense[0][1], -grid.halfZ + 8, grid.halfZ - 8);
  const endZ = clamp(dense[dense.length - 1][1], -grid.halfZ + 8, grid.halfZ - 8);
  return [
    [grid.startX, startZ], [grid.startX + 8, startZ],
    ...dense,
    [grid.endX - 6, endZ], [grid.endX, endZ],
  ];
}

function straightControls(band: Band, grid: CollisionGrid): TrackControl[] {
  const z = clamp(band.center, -grid.halfZ + 8, grid.halfZ - 8);
  const span = grid.halfX * 2;
  return [
    [grid.startX, z], [grid.startX + span * 0.16, z], [grid.startX + span * 0.33, z],
    [grid.startX + span * 0.5, z], [grid.startX + span * 0.66, z], [grid.startX + span * 0.84, z],
    [grid.endX, clamp(band.endZ, -grid.halfZ + 8, grid.halfZ - 8)],
  ];
}

// Buka koridor selebar jalan di sepanjang setiap lajur agar orc tidak pernah macet.
function carveWalls(grid: CollisionGrid, lanes: readonly RaidLane[]) {
  const carved = Uint8Array.from(grid.walls);
  for (const lane of lanes) {
    const curve = new THREE.CatmullRomCurve3(
      lane.controls.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      "catmullrom",
      0.22,
    );
    const points = curve.getSpacedPoints(150);
    for (const point of points) {
      const ci = Math.floor((point.x + grid.halfX) / SVG_CELL);
      const cj = Math.floor((point.z + grid.halfZ) / SVG_CELL);
      for (let dj = -3; dj <= 3; dj++) {
        const j = cj + dj;
        if (j < 0 || j >= grid.gh) continue;
        for (let di = -3; di <= 3; di++) {
          const i = ci + di;
          if (i < 0 || i >= grid.gw) continue;
          if (Math.hypot(gridCellX(grid, i) - point.x, gridCellZ(grid, j) - point.z) <= 5.3) carved[j * grid.gw + i] = 0;
        }
      }
    }
  }
  return carved;
}

export interface LanesFromGridResult {
  lanes: RaidLane[];
  carved: CollisionGrid;
  rejected: boolean;
}

// Logika murni (tanpa DOM) — bisa diuji di Node.
export function buildLanesFromWalls(grid: CollisionGrid): LanesFromGridResult {
  const transparent = Uint8Array.from(grid.walls, (value) => (value === 1 ? 0 : 1));
  const blocked = inflateWalls(grid, transparent);
  const separation = new Float32Array(grid.gw * grid.gh);
  const scaleZ = grid.halfZ / 60;
  const bands = BASE_BANDS.map((band) => ({
    ...band,
    center: band.center * scaleZ,
    endZ: band.endZ * scaleZ,
  }));
  const lanes: RaidLane[] = [];
  let pathFound = 0;
  for (const band of bands) {
    const path = findPath(grid, blocked, separation, band);
    const controls = path ? laneControlsFromPath(path, grid) : straightControls(band, grid);
    if (path) {
      pathFound++;
      addSeparation(separation, grid, path);
    }
    lanes.push({ id: band.id, label: band.label, controls });
  }
  // Tidak ada satu pun rute barat->timur di area transparan -> peta ditolak.
  const rejected = pathFound === 0;
  const carvedGrid: CollisionGrid = rejected ? grid : { ...grid, walls: carveWalls(grid, lanes) };
  return { lanes, carved: carvedGrid, rejected };
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

// PNG/JPG tanpa dimensi bermasalah tetap dirasterisasi pada ukuran aslinya.
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

// Ukuran arena mengikuti aspek gambar, dengan luas total tetap ~160x120 unit.
export function arenaSizeForImage(width: number, height: number) {
  const area = 160 * 120;
  const aspect = Math.max(0.4, Math.min(2.6, width / Math.max(1, height)));
  let halfX = clamp(Math.sqrt(area * aspect) / 2, 55, 108);
  let halfZ = clamp(Math.sqrt(area / aspect) / 2, 40, 78);
  const gw = Math.max(50, Math.round(halfX * 2 / SVG_CELL));
  const gh = Math.max(36, Math.round(halfZ * 2 / SVG_CELL));
  halfX = (gw * SVG_CELL) / 2;
  halfZ = (gh * SVG_CELL) / 2;
  return { halfX, halfZ, gw, gh };
}

function rasterizeToWalls(image: HTMLImageElement, gw: number, gh: number) {
  const supersample = 4;
  const canvas = document.createElement("canvas");
  canvas.width = gw * supersample;
  canvas.height = gh * supersample;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const subPerCell = supersample * supersample;
  const totalSubpixels = gw * gh * subPerCell;
  let opaqueTotal = 0;
  const wallSubpixels = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
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
      wallSubpixels[j * gw + i] = wallHits;
    }
  }

  // PNG dengan transparansi -> area OPAQUE = dinding, area TRANSPARAN = jalur orc.
  // PNG/JPG padat (tanpa alpha) -> otomatis: area GELAP = dinding, area TERANG = jalur.
  const inverted = opaqueTotal / totalSubpixels > 0.62;
  if (inverted) {
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        let wallHits = 0;
        for (let sj = 0; sj < supersample; sj++) {
          for (let si = 0; si < supersample; si++) {
            const px = ((j * supersample + sj) * canvas.width + i * supersample + si) * 4;
            if (data[px + 3] <= 60) continue;
            const luminance = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
            if (luminance < 105) wallHits++;
          }
        }
        wallSubpixels[j * gw + i] = wallHits;
      }
    }
  }
  const threshold = Math.max(3, Math.floor(subPerCell * 0.25));
  const walls = new Uint8Array(gw * gh);
  for (let k = 0; k < walls.length; k++) walls[k] = wallSubpixels[k] >= threshold ? 1 : 0;
  return { walls, inverted };
}

export interface SvgMapResult {
  lanes: RaidLane[];
  grid: CollisionGrid; // collision final (sudah di-carve agar orc tidak macet)
  inverted: boolean;
  image: HTMLImageElement;
  width: number;
  height: number;
}

export async function loadSvgMap(dataUrl: string): Promise<SvgMapResult | null> {
  const source = await normalizeImageSource(dataUrl);
  const image = await loadImageElement(source);
  const size = arenaSizeForImage(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const raw = rasterizeToWalls(image, size.gw, size.gh);
  const grid: CollisionGrid = {
    walls: raw.walls,
    gw: size.gw,
    gh: size.gh,
    halfX: size.halfX,
    halfZ: size.halfZ,
    startX: -(size.halfX + 12),
    endX: size.halfX + 10,
  };
  const built = buildLanesFromWalls(grid);
  if (built.rejected) return null;
  return { lanes: built.lanes, grid: built.carved, inverted: raw.inverted, image, width: image.naturalWidth, height: image.naturalHeight };
}
