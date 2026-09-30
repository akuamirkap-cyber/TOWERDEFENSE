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
// Tabrakan lingkaran (orc) vs kotak sel tembok — eksak: orc menempel pas di
// tepi tembok, tidak ada celah sudut seperti aproksimasi lingkaran-vs-lingkaran.
export function gridCollideBox(
  grid: CollisionGrid,
  body: { x: number; z: number },
  radius: number,
  resolve: (nx: number, nz: number, depth: number) => void,
) {
  const half = SVG_CELL / 2;
  const i0 = Math.floor((body.x + grid.halfX) / SVG_CELL);
  const j0 = Math.floor((body.z + grid.halfZ) / SVG_CELL);
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    if (j < 0 || j >= grid.gh) continue;
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      if (i < 0 || i >= grid.gw) continue;
      if (grid.walls[j * grid.gw + i] !== 1) continue;
      const cx = gridCellX(grid, i);
      const cz = gridCellZ(grid, j);
      const dx = body.x - cx;
      const dz = body.z - cz;
      const qx = clamp(dx, -half, half);
      const qz = clamp(dz, -half, half);
      const ox = dx - qx;
      const oz = dz - qz;
      if (ox !== 0 || oz !== 0) {
        // Pusat di luar kotak: dorong menjauhi titik terdekat di tepi kotak.
        const distance = Math.hypot(ox, oz);
        if (distance < radius) {
          const depth = radius - distance;
          resolve(ox / distance, oz / distance, depth);
        }
      } else {
        // Pusat di dalam kotak (knockback ekstrem): dorong keluar lewat sisi
        // paling dangkal.
        const px = half - Math.abs(dx);
        const pz = half - Math.abs(dz);
        if (px < pz) resolve(Math.sign(dx) || 1, 0, px + radius);
        else resolve(0, Math.sign(dz) || 1, pz + radius);
      }
    }
  }
}

// Apakah segmen garis (x0,z0)->(x1,z1) memotong sel tembok? Mencegah orc
// "melompati" tembok tipis dalam satu frame akibat knockback cepat.
export function segmentHitsWall(
  grid: CollisionGrid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(length / 0.8));
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    if (gridIsWall(grid, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true;
  }
  return false;
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

// Penggembungan dinding: sel terbuka yang menempel dinding dianggap solid
// agar orc (radius ~0.6) tidak menggerus sudut. Sel transparan yang
// menyentuh 6 kolom tepi barat/timur tetap terbuka (pintu masuk/keluar).
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
  for (let j = 0; j < grid.gh; j++) {
    for (let i = 0; i < 6; i++) {
      if (transparent[j * grid.gw + i] === 1) out[j * grid.gw + i] = 0;
    }
    for (let i = grid.gw - 6; i < grid.gw; i++) {
      if (transparent[j * grid.gw + i] === 1) out[j * grid.gw + i] = 0;
    }
  }
  return out;
}

// Jalur sel terbuka dari tepi (barat/timur) menuju sel target — dipakai agar
// awal & akhir lajur selalu menembus pintu transparan, bukan menembus tembok.
function pathToEdge(grid: CollisionGrid, blocked: Uint8Array, target: PathCell, side: -1 | 1): PathCell[] {
  const edgeCol = side === -1 ? 0 : grid.gw - 1;
  const parent = new Int32Array(grid.gw * grid.gh).fill(-2);
  const queue: number[] = [];
  for (let j = 0; j < grid.gh; j++) {
    const idx = edgeCol + j * grid.gw;
    if (blocked[idx] === 1) continue;
    parent[idx] = -1;
    queue.push(idx);
  }
  const targetIdx = target.j * grid.gw + target.i;
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current === targetIdx) break;
    const ci = current % grid.gw;
    const cj = (current - ci) / grid.gw;
    for (const [dx, dz] of DIRS) {
      const ni = ci + dx;
      const nj = cj + dz;
      if (ni < 0 || ni >= grid.gw || nj < 0 || nj >= grid.gh) continue;
      const next = nj * grid.gw + ni;
      if (parent[next] !== -2 || blocked[next] === 1) continue;
      // Diagonal tidak boleh menyobek sudut sel dinding.
      if (dx !== 0 && dz !== 0 && (blocked[cj * grid.gw + ni] === 1 || blocked[nj * grid.gw + ci] === 1)) continue;
      parent[next] = current;
      queue.push(next);
    }
  }
  if (parent[targetIdx] === -2) return [target];
  const chain: PathCell[] = [];
  let cursor = targetIdx;
  while (cursor >= 0) {
    const i = cursor % grid.gw;
    chain.push({ i, j: (cursor - i) / grid.gw });
    cursor = parent[cursor];
  }
  return chain.reverse(); // dari tepi menuju target
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

// Flood-fill dari tepi barat (side=-1) atau timur (side=1) lewat sel terbuka.
// Menjamin orc hanya bisa masuk/keluar lewat area transparan yang tersambung
// ke tepi peta, bukan "muncul" di dalam area tertutup.
function edgeReachable(grid: CollisionGrid, blocked: Uint8Array, side: -1 | 1) {
  const reach = new Uint8Array(grid.gw * grid.gh);
  const stack: number[] = [];
  const edgeCol = side === -1 ? 0 : grid.gw - 1;
  for (let j = 0; j < grid.gh; j++) {
    const idx = edgeCol + j * grid.gw;
    if (blocked[idx] === 1) continue;
    reach[idx] = 1;
    stack.push(idx);
  }
  while (stack.length > 0) {
    const current = stack.pop()!;
    const ci = current % grid.gw;
    const cj = (current - ci) / grid.gw;
    for (const [dx, dz] of DIRS) {
      const ni = ci + dx;
      const nj = cj + dz;
      if (ni < 0 || ni >= grid.gw || nj < 0 || nj >= grid.gh) continue;
      const next = nj * grid.gw + ni;
      if (reach[next] === 1 || blocked[next] === 1) continue;
      reach[next] = 1;
      stack.push(next);
    }
  }
  return reach;
}

// A* barat->timur. Mulai dari kolom 0..7 mana pun yang terbuka (tepi inset
// tetap kehitung), selesai di kolom gw-8..gw-1.
// Penalti per sel tembok saat mode lunak: cukup besar agar A* memutar jauh
// menghindari tembok, tapi tetap bisa menembus kalau tidak ada jalan sama sekali.
const WALL_PENALTY = 16;

interface FoundPath {
  path: PathCell[];
  crossings: number; // berapa sel tembok asli yang dilewati (0 = rute murni transparan)
}

function findPath(
  grid: CollisionGrid,
  blocked: Uint8Array,
  separation: Float32Array,
  band: Band,
  startReach: Uint8Array,
  goalReach: Uint8Array,
  soft = false,
): FoundPath | null {
  const gScore = new Float32Array(grid.gw * grid.gh).fill(Infinity);
  const cameFrom = new Int32Array(grid.gw * grid.gh).fill(-1);
  const closed = new Uint8Array(grid.gw * grid.gh);
  const heap = new MinHeap();
  const startMax = Math.min(8, grid.gw - 1);
  const goalMin = Math.max(0, grid.gw - 8);
  const heuristic = (i: number, j: number) =>
    (grid.gw - 1 - i) + Math.abs(gridCellZ(grid, j) - band.endZ) * 0.02;

  for (let j = 0; j < grid.gh; j++) {
    for (let i = 0; i <= startMax; i++) {
      const idx = i + j * grid.gw;
      if (!soft && blocked[idx] === 1) continue; // orc hanya mulai dari area transparan
      if (!soft && startReach[idx] !== 1) continue; // harus tersambung ke tepi barat
      const cost = i * 0.12 + Math.abs(gridCellZ(grid, j) - band.center) * 0.6 +
        (soft && grid.walls[idx] === 1 ? WALL_PENALTY : 0);
      if (cost < gScore[idx]) {
        gScore[idx] = cost;
        heap.push(idx, cost + heuristic(i, j));
      }
    }
  }

  let iterations = 0;
  while (heap.size > 0 && iterations++ < 250000) {
    const current = heap.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    const ci = current % grid.gw;
    const cj = (current - ci) / grid.gw;
    if (ci >= goalMin && (soft || goalReach[current] === 1)) {
      const path: PathCell[] = [];
      let cursor: number = current;
      while (cursor >= 0) {
        const i = cursor % grid.gw;
        path.push({ i, j: (cursor - i) / grid.gw });
        cursor = cameFrom[cursor];
      }
      path.reverse();
      let full: PathCell[];
      if (soft) {
        // Mode lunak: tepi mungkin tertutup rapat — sambung lurus ke tepi
        // barat/timur; sel yang dilewati akan dibuka paksa sebagai jalan.
        const first = path[0];
        const last = path[path.length - 1];
        const prefix: PathCell[] = [];
        for (let i = first.i - 1; i >= 0; i--) prefix.push({ i, j: first.j });
        prefix.reverse();
        const suffix: PathCell[] = [];
        for (let i = last.i + 1; i < grid.gw; i++) suffix.push({ i, j: last.j });
        full = [...prefix, ...path, ...suffix];
      } else {
        // Sambungkan lewat pintu: tepi->start dan goal->tepi.
        const prefix = pathToEdge(grid, blocked, path[0], -1);
        // pathToEdge mengembalikan urutan tepi->target; balik untuk suffix agar
        // polyline meneruskan goal->pintu->tepi (bukan muter balik).
        const suffix = pathToEdge(grid, blocked, path[path.length - 1], 1).reverse();
        while (prefix.length > 0 && path.length > 0 &&
          prefix[prefix.length - 1].i === path[0].i && prefix[prefix.length - 1].j === path[0].j) prefix.pop();
        while (suffix.length > 0 && path.length > 0 &&
          suffix[0].i === path[path.length - 1].i && suffix[0].j === path[path.length - 1].j) suffix.shift();
        full = [...prefix, ...path, ...suffix];
      }
      let crossings = 0;
      for (const cell of full) {
        if (grid.walls[cell.j * grid.gw + cell.i] === 1) crossings++;
      }
      return { path: full, crossings };
    }
    for (const [dx, dz, baseCost] of DIRS) {
      const ni = ci + dx;
      const nj = cj + dz;
      if (ni < 0 || ni >= grid.gw || nj < 0 || nj >= grid.gh) continue;
      const next = nj * grid.gw + ni;
      if (closed[next]) continue;
      const wall = blocked[next] === 1;
      if (wall && !soft) continue;
      if (dx !== 0 && dz !== 0 && (blocked[cj * grid.gw + ni] === 1 || blocked[nj * grid.gw + ci] === 1)) continue;
      const centerPull = Math.abs(gridCellZ(grid, nj) - band.center) * 0.045;
      const cost = gScore[current] + baseCost + separation[next] + centerPull + (wall ? WALL_PENALTY : 0);
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
  // Buang hanya titik yang benar-benar segaris (arah sama persis) agar kurva
  // Catmull-Rom menempel poliline dan tidak meleset menembus tembok di
  // tikungan tajam seperti mulut pintu.
  const dense: TrackControl[] = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const [ax, az] = dense[dense.length - 1];
    const [bx, bz] = points[k];
    const [cx, cz] = points[k + 1];
    const sameLine = (bx - ax) * (cz - bz) === (cx - bx) * (bz - az) &&
      Math.sign(bx - ax) === Math.sign(cx - bx) && Math.sign(bz - az) === Math.sign(cz - bz);
    if (sameLine) continue;
    dense.push(points[k]);
  }
  dense.push(points[points.length - 1]);
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
  pathFound: number;
  carvedCells: number; // sel tembok asli yang dibuka paksa untuk jalur orc
}

// Logika murni (tanpa DOM) — bisa diuji di Node.
export function buildLanesFromWalls(grid: CollisionGrid): LanesFromGridResult {
  const transparent = Uint8Array.from(grid.walls, (value) => (value === 1 ? 0 : 1));
  const inflated = inflateWalls(grid, transparent);
  const separation = new Float32Array(grid.gw * grid.gh);
  const scaleZ = grid.halfZ / 60;
  const bands = BASE_BANDS.map((band) => ({
    ...band,
    center: band.center * scaleZ,
    endZ: band.endZ * scaleZ,
  }));
  const foundControls: (TrackControl[] | null)[] = [];
  const bandCenters = bands.map((band) => band.center);
  const forcedCells = new Set<number>();
  let pathFound = 0;
  for (let index = 0; index < bands.length; index++) {
    const band = bands[index];
    // Coba dulu dengan dinding tergembung (orc nyaman), lalu longgar (dinding
    // mentah) — koridor sempit 1-2 sel tetap bisa dilalui.
    const startReach = edgeReachable(grid, inflated, -1);
    const startLoose = edgeReachable(grid, grid.walls, -1);
    const goalReach = edgeReachable(grid, inflated, 1);
    const goalLoose = edgeReachable(grid, grid.walls, 1);
    const found =
      findPath(grid, inflated, separation, band, startReach, goalReach) ??
      findPath(grid, grid.walls, separation, band, startLoose, goalLoose) ??
      // Mode lunak: tidak ada lorong transparan sama sekali — jalur orc
      // menembus tembok dengan penalti, lalu sel yang dilewati dibuka paksa.
      findPath(grid, grid.walls, separation, band, startLoose, goalLoose, true);
    if (found) {
      pathFound++;
      if (found.crossings > 0) {
        for (const cell of found.path) {
          const idx = cell.j * grid.gw + cell.i;
          if (grid.walls[idx] === 1) forcedCells.add(idx);
        }
      }
      foundControls[index] = laneControlsFromPath(found.path, grid);
      addSeparation(separation, grid, found.path);
    }
  }
  // Band tanpa rute memakai jalur band yang berhasil (terdekat di sumbu z)
  // alih-alih mengukir lorong sendiri menembus tembok.
  for (let index = 0; index < bands.length; index++) {
    if (foundControls[index]) continue;
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let other = 0; other < bands.length; other++) {
      if (!foundControls[other]) continue;
      const distance = Math.abs(bandCenters[other] - bandCenters[index]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = other;
      }
    }
    foundControls[index] = nearest >= 0 ? foundControls[nearest] : straightControls(bands[index], grid);
  }
  const lanes: RaidLane[] = bands.map((band, index) => ({
    id: band.id,
    label: band.label,
    controls: foundControls[index]!,
  }));
  // Sel tembok yang dilalui jalur paksa dibuka agar orc benar-benar bisa lewat.
  const walls = carveWalls(grid, lanes);
  for (const idx of forcedCells) walls[idx] = 0;
  const carvedGrid: CollisionGrid = { ...grid, walls };
  return { lanes, carved: carvedGrid, rejected: pathFound === 0, pathFound, carvedCells: forcedCells.size };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal memuat gambar"));
    image.src = src;
  });
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

// Rasterisasi gambar (dengan rotasi opsional 0/90/180/270) ke grid dinding.
// Mode otomatis: PNG transparan -> opaque = dinding, transparan = jalur.
// PNG/JPG padat -> area GELAP = dinding, area TERANG = jalur.
function rasterizeToWalls(image: HTMLImageElement, gw: number, gh: number, rotation: number) {
  const supersample = 4;
  const canvas = document.createElement("canvas");
  canvas.width = gw * supersample;
  canvas.height = gh * supersample;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  // Kotak gambar diputar menutupi kanvas: dims ditukar untuk rotasi 90/270.
  const swap = rotation % 180 !== 0;
  const boxW = swap ? canvas.height : canvas.width;
  const boxH = swap ? canvas.width : canvas.height;
  ctx.drawImage(image, -boxW / 2, -boxH / 2, boxW, boxH);
  ctx.restore();
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
          if (alpha <= 90) continue; // ambang longgar: alpha 0-90 dianggap jalur
          opaqueTotal++;
          wallHits++;
        }
      }
      wallSubpixels[j * gw + i] = wallHits;
    }
  }

  const inverted = opaqueTotal / totalSubpixels > 0.62;
  if (inverted) {
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        let wallHits = 0;
        for (let sj = 0; sj < supersample; sj++) {
          for (let si = 0; si < supersample; si++) {
            const px = ((j * supersample + sj) * canvas.width + i * supersample + si) * 4;
            if (data[px + 3] <= 90) continue;
            const luminance = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
            if (luminance < 112) wallHits++;
          }
        }
        wallSubpixels[j * gw + i] = wallHits;
      }
    }
  }
  const threshold = Math.max(3, Math.floor(subPerCell * 0.22));
  const walls = new Uint8Array(gw * gh);
  let openCount = 0;
  for (let k = 0; k < walls.length; k++) {
    walls[k] = wallSubpixels[k] >= threshold ? 1 : 0;
    if (walls[k] === 0) openCount++;
  }
  let opaquePercent = 0;
  for (let k = 0; k < wallSubpixels.length; k++) if (wallSubpixels[k] >= threshold) opaquePercent++;
  return { walls, inverted, openFraction: openCount / walls.length, opaquePercent };
}

export interface SvgMapResult {
  lanes: RaidLane[];
  grid: CollisionGrid; // collision final (sudah di-carve agar orc tidak macet)
  inverted: boolean;
  image: HTMLImageElement;
  width: number;
  height: number;
  rotation: number; // rotasi yang dipakai (selalu pilihan pemain)
  carvedCells: number; // >0 = tidak ada lorong transparan, jalur orc dipaksa menembus tembok
}

export interface SvgMapFailure {
  ok: false;
  reason: string;
}

export interface SvgMapSuccess extends SvgMapResult {
  ok: true;
}

// Peta APA PUN bisa dipasang pada orientasi pilihan pemain. Kalau tidak ada
// lorong transparan kiri→kanan, jalur orc dicari "lunak" (boleh menembus
// tembok dengan penalti) dan sel yang dilewati dibuka paksa — peta tidak
// pernah ditolak lagi. carvedCells melaporkan berapa sel yang dibuka paksa;
// pemain bisa menekan PUTAR 90° untuk orientasi lain yang lebih pas.
export async function loadSvgMap(dataUrl: string, preferredRotation = 0): Promise<SvgMapSuccess | SvgMapFailure> {
  const preferred = [0, 90, 180, 270].includes(preferredRotation) ? preferredRotation : 0;
  let image: HTMLImageElement;
  try {
    image = await loadImageElement(dataUrl);
  } catch {
    return { ok: false, reason: "gambar tidak bisa dibaca — coba re-export PNG-mu lalu unggah lagi." };
  }
  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;
  const swap = preferred % 180 !== 0;
  const size = arenaSizeForImage(swap ? imgH : imgW, swap ? imgW : imgH);
  const raster = rasterizeToWalls(image, size.gw, size.gh, preferred);
  const grid: CollisionGrid = {
    walls: raster.walls,
    gw: size.gw,
    gh: size.gh,
    halfX: size.halfX,
    halfZ: size.halfZ,
    startX: -(size.halfX + 12),
    endX: size.halfX + 10,
  };
  const built = buildLanesFromWalls(grid);
  return {
    ok: true,
    lanes: built.lanes,
    grid: built.carved,
    inverted: raster.inverted,
    image,
    width: imgW,
    height: imgH,
    rotation: preferred,
    carvedCells: built.carvedCells,
  };
}
