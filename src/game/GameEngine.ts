import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AudioEngine, type GameSound } from "./AudioEngine";
import { DismembermentSystem } from "./DismembermentSystem";
import { FlameSystem } from "./FlameSystem";
import { MarineVisualSystem, type MarinePose } from "./MarineVisualSystem";
import { OrcRunnerSystem, runCycle } from "./OrcRunnerSystem";
import { RagdollSystem } from "./RagdollSystem";
import { createRaidLanes, createDecorRoads, ENTRY_ORDER, isValidRaidLanes, MAP_HALF_X, MAP_HALF_Z, FORTRESS_X, trackName, VISUAL_HALF_X, VISUAL_HALF_Z, type RaidLane } from "./TrackGenerator";
import { loadSvgMap, buildLanesFromWalls, gridBlocked, gridCollideBox, gridIsWall, segmentHitsWall, type CollisionGrid } from "./SvgMapSystem";
import { WeatherSystem } from "./WeatherSystem";
import {
  ABILITIES,
  TOWER_ORDER,
  TOWERS,
  UPGRADES,
  HULK_CONFIG,
  SUPER_HULK_CONFIG,
  type AbilityType,
  type GameSnapshot,
  type Phase,
  type TowerType,
  type UpgradeId,
  type UpgradeLevels,
  type WeatherMode,
} from "./config";

interface PathSample {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

interface Enemy {
  id: number;
  lane: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  stagger: number;
  hitFlash: number;
  hitTheme: HitTheme;
  distance: number;
  offset: number;
  speed: number;
  hp: number;
  maxHp?: number;
  alive: boolean;
  armored: boolean;
  variant: number;
  wobble: number;
  scale: number;
  angle: number;
  baseOffset: number;
  raider: boolean;
  attackTimer: number;
  attackPulse: number;
  lift: number;
  liftV: number;
  tumble: number;
  tumbleV: number;
  lostParts: number;
  shockTime: number;
  shockSparkTimer: number;
  isHulk?: boolean;
  isSuperHulk?: boolean;
  safeX?: number; // posisi aman frame lalu (anti-terowongan tembok PNG)
  safeZ?: number;
}

interface Corpse {
  id: number;
  lane: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  stagger: number;
  scale: number;
  angle: number;
  variant: number;
  armored: boolean;
  alive: false;
  age: number;
  y: number;
  vy: number;
  spin: number;
  landed: boolean;
  distance: number;
  lostParts: number;
  safeX?: number;
  safeZ?: number;
}

interface RifleShot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  damage: number;
  sourceX: number;
  sourceZ: number;
  theme: "gunner" | "barracks";
}

interface TerrainObstacle {
  x: number;
  z: number;
  radius: number;
}

interface ShotParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  age: number;
  life: number;
  gravity: number;
  drag: number;
  color: number;
  kind?: "bullet" | "shell" | "flame";
  impactX?: number;
  impactY?: number;
  impactZ?: number;
}

interface BloodDrop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: number;
}

interface SalvoRocketItem {
  delay: number;
  side: number;
  spreadAngle: number;
  targetId: number;
  damage: number;
  radius: number;
}

interface Tower {
  id: number;
  type: TowerType;
  x: number;
  z: number;
  level: number;
  cooldown: number;
  recoil: number;
  barrelSide: number;
  hp: number;
  maxHp: number;
  hitTimer: number;
  group: THREE.Group;
  head: THREE.Group;
  rangeRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  healthGroup: THREE.Group;
  healthFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  radarDish?: THREE.Group;
  leftPod?: THREE.Group;
  rightPod?: THREE.Group;
  targetLaser?: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  laserDot?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  salvoQueue?: SalvoRocketItem[];
}

interface MarineUnit extends MarinePose {
  id: number;
  towerId: number;
  slot: number;
  homeX: number;
  homeZ: number;
  hp: number;
  maxHp: number;
  respawn: number;
  gunTimer: number;
  meleeTimer: number;
  hurtTimer: number;
  attacks: number;
  footstepTimer: number;
  hitApplied: boolean;
  vx?: number;
  vz?: number;
  lift?: number;
  liftV?: number;
  tumble?: number;
  tumbleV?: number;
  smoking?: number;
  isBlownUp?: boolean;
}

interface Projectile {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  duration: number;
  damage: number;
  radius: number;
  trailTimer: number;
}

interface HomingRocket {
  mesh: THREE.Group;
  flareMesh?: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetId: number;
  targetX: number;
  targetZ: number;
  damage: number;
  radius: number;
  age: number;
  life: number;
  speed: number;
  turnSpeed: number;
  trailTimer: number;
  spiralPhase: number;
  spiralRadius: number;
  climbBoost: number;
}

interface VisualEffect {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  kind: "tracer" | "ring" | "burst" | "flame" | "muzzle";
  age: number;
  life: number;
  size: number;
  opacity: number;
  ownsGeometry?: boolean;
}

interface PendingImpact {
  x: number;
  z: number;
  delay: number;
  damage: number;
  radius: number;
  big?: boolean;
}

interface Aircraft {
  group: THREE.Group;
  x: number;
  z: number;
  age: number;
}

interface Progress {
  crystals: number;
  bestWave: number;
  upgrades: UpgradeLevels;
}

interface DirectorSettings {
  orcSpeed: number;
  hordeMultiplier: number;
}

const STORAGE_KEY = "orc-problem-webgl-save-v1";
const DIRECTOR_STORAGE_KEY = "orc-problem-director-v1";
const TRACK_STORAGE_KEY = "orc-problem-track-v2";
const SVG_STORAGE_KEY = "orc-problem-svgmap-v1";
const SVG_MAX_DATAURL = 2_600_000;
const MAX_ORCS = 14000;
const MAX_CORPSES = 800;
const MAX_BLOOD = 1500;
const MAX_SPLATS = 2500;
const PATH_STEPS = 360;
const LANE_HALF_WIDTH = 4.1;
// Warna jalan bergaya labirin abu-abu (fringe rumput, bibir jalan, permukaan, garis tepi).
const ROAD_COLORS = [0x4d6a40, 0x81878d, 0xb6bbbf, 0x8a9096, 0x8a9096, 0x676d73, 0x676d73];
const MAX_SHOT_PARTICLES = 700;
const MAX_HIT_FLASHES = 1000;
const MAX_RIFLE_SHOTS = 320;
const MAX_MARINES = 160;
const MAX_TOWERS = 90;
const MAX_BARRACKS = 40;
const ORC_TINTS = [0xffffff, 0xe2edc9, 0xd4e7ae, 0xf1e6c1].map((color) => new THREE.Color(color));
const ARMORED_TINT = new THREE.Color(0xb4c0aa);
const HULK_TINT = new THREE.Color().setRGB(0.5, 1.85, 0.45);
const SUPER_HULK_TINT = new THREE.Color().setRGB(0.42, 2.35, 0.42);
const CORPSE_TINT = new THREE.Color(0x806459);
const SHOCK_TINT = new THREE.Color(0xaceaff);
const BLOOD_COLORS = [0x921f21, 0xbb2c22, 0xdf5230, 0x702026].map((color) => new THREE.Color(color));
const SHOT_COLORS = [0xffe9a2, 0xffa455, 0xfff3cf, 0x7eeaff, 0xf0b7ff, 0xc2b4a1, 0xeeb057].map((color) => new THREE.Color(color));
const SHOT_UP = new THREE.Vector3(0, 1, 0);

type HitTheme = TowerType | AbilityType | "missile" | "collision";

const HIT_HEX: Record<HitTheme, number> = {
  gunner: 0xffedac,
  flame: 0xff781f,
  mortar: 0xffba69,
  tesla: 0x78ecff,
  laser: 0xf3a9ff,
  barracks: 0xffd783,
  rocket: 0xff5533,
  missile: 0xffca80,
  airstrike: 0xff9f6b,
  orbital: 0x9afff5,
  nuke: 0xffefad,
  collision: 0xf0a97b,
};

const HIT_SPARK_INDEX: Record<HitTheme, number> = {
  gunner: 0, flame: 1, mortar: 1, tesla: 3, laser: 4, barracks: 0,
  rocket: 1, missile: 0, airstrike: 1, orbital: 3, nuke: 2, collision: 6,
};

const HIT_PALETTE = Object.fromEntries(
  Object.entries(HIT_HEX).map(([name, hex]) => [
    name,
    [0.32, 0.52, 0.75, 1].map((strength) => new THREE.Color(hex).multiplyScalar(strength)),
  ]),
) as Record<HitTheme, THREE.Color[]>;

const emptyUpgrades = (): UpgradeLevels => ({
  ballistics: 0,
  overclock: 0,
  blast: 0,
  arc: 0,
  walls: 0,
  supplies: 0,
});

function loadProgress(): Progress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Progress>;
      const upgrades = emptyUpgrades();
      for (const id of Object.keys(upgrades) as UpgradeId[]) {
        upgrades[id] = Math.max(0, Math.min(3, Number(parsed.upgrades?.[id]) || 0));
      }
      return {
        crystals: Math.max(0, Number(parsed.crystals) || 0),
        bestWave: Math.max(0, Number(parsed.bestWave) || 0),
        upgrades,
      };
    }
  } catch {
    // A corrupted or blocked localStorage should not prevent a new game.
  }
  return { crystals: 32, bestWave: 0, upgrades: emptyUpgrades() };
}

function randomGenerator(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function loadDirectorSettings(): DirectorSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(DIRECTOR_STORAGE_KEY) || "null") as Partial<DirectorSettings> | null;
    if (saved) {
      return {
        orcSpeed: clamp(Math.round((Number(saved.orcSpeed) || 1) * 4) / 4, 0.75, 3),
        hordeMultiplier: clamp(Math.round((Number(saved.hordeMultiplier) || 1) * 2) / 2, 1, 10),
      };
    }
  } catch {
    // Default intensity remains available when local storage is disabled.
  }
  return { orcSpeed: 1, hordeMultiplier: 1 };
}

function loadTrackState(): { seed: number; lanes: RaidLane[] | null } {
  try {
    const stored = localStorage.getItem(TRACK_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { seed?: unknown; lanes?: unknown };
      const seed = Number(parsed.seed);
      if (Number.isSafeInteger(seed) && seed > 0 && seed <= 999999) {
        // Simpanan berformat lama (4 penjuru) ditolak — seed-nya tetap dipakai untuk
        // membuat labirin barat->timur yang baru.
        if (isValidRaidLanes(parsed.lanes)) return { seed, lanes: parsed.lanes };
        return { seed, lanes: null };
      }
    }
    const legacy = localStorage.getItem("orc-problem-track-v1");
    if (legacy) {
      const previous = JSON.parse(legacy) as { seed?: unknown };
      const seed = typeof previous === "number" ? previous : Number(previous.seed);
      if (Number.isSafeInteger(seed) && seed > 0 && seed <= 999999) return { seed, lanes: null };
    }
  } catch {
    // Invalid or unavailable storage falls back to the classic road.
  }
  return { seed: 0, lanes: null };
}

export class GameEngine {
  private container: HTMLElement;
  private onChange: (snapshot: GameSnapshot) => void;
  private onToast: (message: string) => void;
  private onFlash: () => void;
  private renderer: THREE.WebGLRenderer;
  private maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-38, 38, 25, -25, 0.1, 220);
  private cameraTarget = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(0, 106, 78);
  private ambientLight = new THREE.AmbientLight(0xfff3d2, 1.8);
  private sunlight = new THREE.DirectionalLight(0xffe4ad, 1.55);
  private resizeObserver: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointerNdc = new THREE.Vector2();
  private pointerPoint = new THREE.Vector3();
  private panStartWorld = new THREE.Vector3();
  private panEndWorld = new THREE.Vector3();
  private activePointers = new Map<number, { startX: number; startY: number; lastX: number; lastY: number; button: number; panOnly: boolean; moved: boolean }>();
  private pointerInside = false;
  private inputEnabled = true;
  private terrainTexture: THREE.CanvasTexture | null = null;
  private groundMaterial!: THREE.MeshLambertMaterial;
  private weather!: WeatherSystem;
  private paths: PathSample[][] = [];
  private pathLengths: number[] = [];
  private pathLength = 1;
  private lanes: RaidLane[] = [];
  private decorRoads: PathSample[][] = [];
  private svgDataUrl: string | null = null;
  private svgLanes: RaidLane[] | null = null;
  private svgGrid: CollisionGrid | null = null;
  private svgImage: HTMLImageElement | null = null;
  private svgRotation = 0;
  private terrainCtx: CanvasRenderingContext2D | null = null;
  // Ukuran arena aktif: mengikuti aspek PNG saat peta gambar dipasang.
  private arenaHalfX = MAP_HALF_X;
  private arenaHalfZ = MAP_HALF_Z;
  private fortressX = FORTRESS_X;
  private terrainObstacles: TerrainObstacle[] = [];
  private roadVisuals: THREE.Mesh[] = [];
  private decorationVisuals: THREE.InstancedMesh[] = [];
  private savedTrack = loadTrackState();
  private trackSeed = this.savedTrack.seed;
  private trackLanes: RaidLane[] | null = this.savedTrack.lanes;

  private progress = loadProgress();
  private director = loadDirectorSettings();
  private phase: Phase = "build";
  private wave = 1;
  private baseHp = 20;
  private scrap = 900000;
  private kills = 0;
  private waveKills = 0;
  private waveCrystals = 0;
  private escaped = 0;
  private spawned = 0;
  private total = 800;
  private superHulkSpawnedThisWave = false;
  private lastReward = 0;
  private towersLost = 0;
  private chainCombo = 0;
  private chainTimer = 0;
  private lastTowerWarning = -10;
  private paused = false;
  private speed = 1;
  private muted = false;
  private selectedType: TowerType | null = "gunner";
  private selectedTowerId: number | null = null;
  private targeting: AbilityType | null = null;
  private cooldowns: Record<AbilityType, number> = { airstrike: 0, orbital: 0, nuke: 0 };
  private missileCooldown = 0;

  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private corpses: Corpse[] = [];
  private previewOrcs: Enemy[] = [];
  private nextTowerId = 1;
  private nextEnemyId = 1;
  private orcMeshes: THREE.InstancedMesh[] = [];
  private hitMeshes: THREE.InstancedMesh[] = [];
  private orcCounts = new Uint16Array(2);
  private hitCounts = new Uint16Array(2);
  private orcRunners!: OrcRunnerSystem;
  private ragdolls!: RagdollSystem;
  private fragments!: DismembermentSystem;
  private marineVisuals!: MarineVisualSystem;
  private marineUnits: MarineUnit[] = [];
  private nextMarineId = 1;
  private rifleMesh!: THREE.InstancedMesh;
  private rifleShots: RifleShot[] = [];
  private splatMesh!: THREE.InstancedMesh;
  private splatTexture: THREE.CanvasTexture | null = null;
  private splatIndex = 0;
  private splatCount = 0;
  private bloodMesh!: THREE.InstancedMesh;
  private bloodDrops: BloodDrop[] = [];
  private shotMesh!: THREE.InstancedMesh;
  private shotParticles: ShotParticle[] = [];
  private flames!: FlameSystem;
  private hitFxCounter = 0;
  private cameraShake = 0;
  private collisionCells = new Map<number, (Enemy | Corpse)[]>();
  private ghost = new THREE.Group();
  private ghostRing!: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private ghostCore!: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private fortressFlag: THREE.Mesh | null = null;
  private beam = new THREE.Group();
  private beamTime = 0;
  private beamTick = 0;
  private beamX = 0;
  private beamZ = 0;
  private projectiles: Projectile[] = [];
  private homingRockets: HomingRocket[] = [];
  private effects: VisualEffect[] = [];
  private pendingImpacts: PendingImpact[] = [];
  private aircraft: Aircraft[] = [];
  private tracerGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
  private ringGeometry = new THREE.RingGeometry(0.84, 1, 36);
  private burstGeometry = new THREE.SphereGeometry(1, 10, 6);
  private shellGeometry = new THREE.SphereGeometry(0.24, 6, 4);
  private shellMaterial = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  private dummy = new THREE.Object3D();
  private shotDirection = new THREE.Vector3();

  private elapsed = 0;
  private collisionAccumulator = 0;
  private lastSavedElapsed = 0;
  private lastFrame = 0;
  private lastUi = 0;
  private spawnAccumulator = 0;
  private frameCount = 0;
  private fpsClock = 0;
  private fps = 60;
  private slowFrames = 0;
  private fastFrames = 0;
  private audio = new AudioEngine();

  constructor(
    container: HTMLElement,
    onChange: (snapshot: GameSnapshot) => void,
    onToast: (message: string) => void,
    onFlash: () => void,
  ) {
    this.container = container;
    this.onChange = onChange;
    this.onToast = onToast;
    this.onFlash = onFlash;
    this.baseHp = this.maxHp;
    this.scrap += this.progress.upgrades.supplies * 65;
    this.total = this.adjustedWaveSize;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x57804a);
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.className = "battle-canvas";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.title = "Scroll untuk zoom, drag untuk geser peta, klik untuk beraksi";
    this.renderer.domElement.setAttribute("aria-label", "Medan perang 3D dengan empat jalur serangan dari barat ke timur. Scroll untuk zoom dan drag untuk menggeser kamera.");
    this.container.appendChild(this.renderer.domElement);

    this.camera.zoom = window.innerWidth < 650 ? 1.14 : 1;
    this.camera.position.copy(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);
    this.scene.add(this.ambientLight);
    this.sunlight.position.set(-30, 65, 25);
    this.scene.add(this.sunlight);

    this.createPath();
    this.createTerrain();
    this.weather = new WeatherSystem(this.scene, this.camera, this.renderer, this.ambientLight, this.sunlight, this.groundMaterial);
    this.applyWeatherToRoad();
    this.createFortress();
    this.createOrcInstances();
    this.orcRunners = new OrcRunnerSystem(this.scene);
    this.createEffectsLayer();
    this.flames = new FlameSystem(this.scene, this.camera);
    this.ragdolls = new RagdollSystem(this.scene);
    this.fragments = new DismembermentSystem(this.scene);
    this.marineVisuals = new MarineVisualSystem(this.scene);
    this.createPlacementGhost();
    this.setupStartingTowers();
    this.relocateTowers();
    this.initLaneGuardMarines();
    this.syncMarineUnits();
    this.createDecorations();
    this.createPreviewOrcs();

    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.handlePointerCancel);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("contextmenu", this.handleContextMenu);
    this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.container);
    this.resize();
    this.updateOrcInstances();
    this.emit();
    this.renderer.setAnimationLoop(this.animate);

    // Peta SVG tersimpan dari sesi sebelumnya dimuat kembali (fase masih build).
    try {
      const raw = localStorage.getItem(SVG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { data?: unknown; rotation?: unknown };
        if (typeof parsed.data === "string" && parsed.data.startsWith("data:image/") && parsed.data.length <= SVG_MAX_DATAURL) {
          const rotation = typeof parsed.rotation === "number" && [0, 90, 180, 270].includes(parsed.rotation) ? parsed.rotation : 0;
          void this.applySvgMap(parsed.data, rotation);
        }
      }
    } catch {
      // Simpanan rusak diabaikan; peta prosedural tetap jalan.
    }
  }

  private get maxHp() {
    return 20 + this.progress.upgrades.walls * 5;
  }

  private get waveSize() {
    return Math.min(Math.round(800 * 1.52 ** (this.wave - 1)), 26000);
  }

  private get adjustedWaveSize() {
    return Math.round(this.waveSize * this.director.hordeMultiplier);
  }

  private saveDirectorSettings() {
    try {
      localStorage.setItem(DIRECTOR_STORAGE_KEY, JSON.stringify(this.director));
    } catch {
      // The sliders still work during this session without persistence.
    }
  }

  private saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
      this.lastSavedElapsed = this.elapsed;
    } catch {
      // The game remains playable when storage is unavailable.
    }
  }

  private emit() {
    const selected = this.towers.find((tower) => tower.id === this.selectedTowerId);
    const damaged = this.towers.filter((tower) => tower.hp < tower.maxHp);
    const repairTarget = selected && selected.hp < selected.maxHp
      ? selected
      : damaged.reduce<Tower | null>((lowest, tower) => !lowest || tower.hp / tower.maxHp < lowest.hp / lowest.maxHp ? tower : lowest, null);
    const lanePressure: [number, number, number, number] = [0, 0, 0, 0];
    if (this.phase === "battle") {
      for (const enemy of this.enemies) if (enemy.alive) lanePressure[enemy.lane]++;
    }
    this.onChange({
      phase: this.phase,
      wave: this.wave,
      bestWave: this.progress.bestWave,
      trackSeed: this.trackSeed,
      trackName: this.svgDataUrl ? "PETA SVG" : trackName(this.trackSeed),
      svgMap: this.svgDataUrl !== null,
      svgRotation: this.svgRotation,
      trackLength: this.pathLength,
      weather: this.weather.mode,
      cameraZoom: this.camera.zoom,
      orcSpeed: this.director.orcSpeed,
      hordeMultiplier: this.director.hordeMultiplier,
      baseHp: this.baseHp,
      maxHp: this.maxHp,
      scrap: this.scrap,
      crystals: this.progress.crystals,
      kills: this.kills,
      waveKills: this.waveKills,
      escaped: this.escaped,
      spawned: this.spawned,
      total: this.total,
      activeEnemies: this.enemies.length,
      marineCount: this.marineUnits.reduce((count, unit) => count + (unit.hp > 0 ? 1 : 0), 0),
      lanePressure,
      towerCount: this.towers.length,
      towersUnderAttack: this.towers.filter((tower) => tower.hitTimer > 0).length,
      towersLost: this.towersLost,
      damagedTowers: damaged.length,
      repairCost: repairTarget ? this.getRepairCost(repairTarget) : null,
      chainCombo: this.chainCombo,
      selectedType: this.selectedType,
      selectedTower: selected
        ? {
            id: selected.id,
            type: selected.type,
            level: selected.level,
            hp: Math.ceil(selected.hp),
            maxHp: selected.maxHp,
            upgradeCost: this.getTowerUpgradeCost(selected),
            sellValue: this.getSellValue(selected),
          }
        : null,
      targeting: this.targeting,
      cooldowns: { ...this.cooldowns },
      missileCooldown: this.missileCooldown,
      upgradeLevels: { ...this.progress.upgrades },
      paused: this.paused,
      speed: this.speed,
      muted: this.muted,
      fps: this.fps,
      lastReward: this.lastReward,
    });
  }

  private resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const worldWidth = Math.max(160, aspect * 112);
    const worldHeight = worldWidth / aspect;
    this.camera.left = -worldWidth / 2;
    this.camera.right = worldWidth / 2;
    this.camera.top = worldHeight / 2;
    this.camera.bottom = -worldHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.clampCameraTarget();
    this.applyCamera();
  };

  private applyCamera(shakeX = 0, shakeZ = 0) {
    this.camera.position.set(
      this.cameraTarget.x + this.cameraOffset.x + shakeX,
      this.cameraOffset.y,
      this.cameraTarget.z + this.cameraOffset.z + shakeZ,
    );
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();
  }

  private clampCameraTarget() {
    const halfWidth = (this.camera.right - this.camera.left) / (2 * this.camera.zoom);
    const halfHeight = (this.camera.top - this.camera.bottom) / (2 * this.camera.zoom);
    const groundProjection = this.cameraOffset.y / this.cameraOffset.length();
    this.cameraTarget.x = clamp(this.cameraTarget.x, -Math.max(0, this.arenaHalfX - halfWidth + 6), Math.max(0, this.arenaHalfX - halfWidth + 6));
    this.cameraTarget.z = clamp(this.cameraTarget.z, -Math.max(0, this.arenaHalfZ - halfHeight / groundProjection + 6), Math.max(0, this.arenaHalfZ - halfHeight / groundProjection + 6));
  }

  private createPath() {
    this.lanes = this.trackLanes ?? createRaidLanes(this.trackSeed, this.towers);
    this.paths = [];
    this.pathLengths = [];
    for (const lane of this.lanes) {
      const built = this.sampleCurve(lane.controls);
      this.pathLengths.push(built.length);
      this.paths.push(built.samples);
    }
    this.pathLength = this.pathLengths.reduce((sum, length) => sum + length, 0);
    this.decorRoads = this.svgLanes ? [] : createDecorRoads(this.trackSeed, this.lanes).map((controls) => this.sampleCurve(controls).samples);
  }

  private sampleCurve(controls: readonly (readonly [number, number])[]) {
    const curve = new THREE.CatmullRomCurve3(
      controls.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      "catmullrom",
      0.22,
    );
    const length = curve.getLength();
    const points = curve.getSpacedPoints(PATH_STEPS);
    const samples = points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: point.x, z: point.z, nx: -dz / len, nz: dx / len };
    });
    return { samples, length };
  }

  private createRibbon(samples: PathSample[], width: number, color: number, height: number, offset = 0, opacity = 1, role = 0) {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index < samples.length; index++) {
      const point = samples[index];
      const roughness = 1 + Math.sin(index * 2.39) * 0.022 + Math.sin(index * 0.49) * 0.024;
      const half = (width * roughness) / 2;
      vertices.push(
        point.x + point.nx * (offset - half), height, point.z + point.nz * (offset - half),
        point.x + point.nx * (offset + half), height, point.z + point.nz * (offset + half),
      );
      if (index < samples.length - 1) {
        const cursor = index * 2;
        indices.push(cursor, cursor + 1, cursor + 2, cursor + 1, cursor + 3, cursor + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    });
    const visual = new THREE.Mesh(geometry, material);
    visual.userData.role = role;
    this.scene.add(visual);
    this.roadVisuals.push(visual);
  }

  private createRoad() {
    for (const mesh of this.roadVisuals) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.roadVisuals = [];
    // Peta PNG: gambar penanda tepi jalan saja supaya batas area laluan orc
    // (termasuk jalan paksa hasil carve) terlihat jelas di atas terrain.
    if (this.svgLanes) {
      this.paths.forEach((samples, lane) => {
        const layer = lane * 0.002;
        this.createRibbon(samples, 0.67, ROAD_COLORS[5], 0.045 + layer, -5.0, 0.85, 5);
        this.createRibbon(samples, 0.67, ROAD_COLORS[5], 0.045 + layer, 5.0, 0.85, 6);
      });
    } else this.paths.forEach((samples, lane) => {
      const layer = lane * 0.002;
      this.createRibbon(samples, 12.3, ROAD_COLORS[0], -0.055 + layer, 0, 1, 0);
      this.createRibbon(samples, 9.9, ROAD_COLORS[1], -0.025 + layer, 0, 1, 1);
      this.createRibbon(samples, 9.1, ROAD_COLORS[2], 0.005 + layer, 0, 1, 2);
      this.createRibbon(samples, 0.67, ROAD_COLORS[5], 0.045 + layer, -5.0, 1, 5);
      this.createRibbon(samples, 0.67, ROAD_COLORS[5], 0.045 + layer, 5.0, 1, 6);
    });
    // Jalan labirin dekoratif (buntu) — hanya hiasan, orc tidak melewatinya.
    this.decorRoads.forEach((samples, index) => {
      const layer = -0.01 - index * 0.0015;
      this.createRibbon(samples, 12.3, ROAD_COLORS[0], -0.055 + layer, 0, 1, 0);
      this.createRibbon(samples, 9.9, ROAD_COLORS[1], -0.025 + layer, 0, 1, 1);
      this.createRibbon(samples, 9.1, ROAD_COLORS[2], 0.005 + layer, 0, 1, 2);
    });
    if (this.weather) this.applyWeatherToRoad();
  }

  private applyWeatherToRoad() {
    const colors = this.weather.mode === "snow"
      ? [0x9fb5aa, 0x8fa09f, 0xc9d8d3, 0xa9b9b3, 0xa9b9b3, 0xe1eef1, 0xe1eef1]
      : this.weather.mode === "rainyNight"
        ? [0x2b4034, 0x3a4a51, 0x506066, 0x394d52, 0x394d52, 0x254049, 0x254049]
        : ROAD_COLORS;
    for (const mesh of this.roadVisuals) {
      const role = typeof mesh.userData.role === "number" ? mesh.userData.role : 0;
      (mesh.material as THREE.MeshLambertMaterial).color.setHex(colors[role] ?? colors[0]);
    }
  }

  private createTerrain() {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    this.terrainCtx = canvas.getContext("2d")!;
    this.paintBaseTerrain();

    this.terrainTexture = new THREE.CanvasTexture(canvas);
    this.terrainTexture.colorSpace = THREE.SRGBColorSpace;
    this.terrainTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.groundMaterial = new THREE.MeshLambertMaterial({ map: this.terrainTexture });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(VISUAL_HALF_X * 2, VISUAL_HALF_Z * 2),
      this.groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    this.scene.add(ground);

    this.createRoad();
  }

  // Rumput prosedural bawaan (dipakai saat tidak ada peta PNG).
  private paintBaseTerrain() {
    const ctx = this.terrainCtx;
    if (!ctx) return;
    const random = randomGenerator(2917);
    ctx.fillStyle = "#66874b";
    ctx.fillRect(0, 0, 768, 768);
    for (let index = 0; index < 700; index++) {
      const x = random() * 768;
      const y = random() * 768;
      const radius = 8 + random() * 36;
      ctx.fillStyle = random() > 0.5 ? "rgba(23,70,34,0.055)" : "rgba(218,205,117,0.07)";
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * (0.5 + random()), random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let index = 0; index < 12000; index++) {
      const shade = random();
      ctx.fillStyle = shade < 0.45 ? "rgba(28,73,31,0.18)" : "rgba(207,212,130,0.17)";
      ctx.fillRect(random() * 768, random() * 768, 1 + random() * 2, 1 + random() * 3);
    }
    if (this.terrainTexture) this.terrainTexture.needsUpdate = true;
  }

  // Gambar PNG peta langsung ke tanah: tampilan arena = gambar aslinya.
  private paintTerrainFromImage(image: HTMLImageElement) {
    const ctx = this.terrainCtx;
    if (!ctx) return;
    this.paintBaseTerrain();
    // Arena 160x120 unit di tengah bidang visual 240x190 -> 768px.
    const pxPerUnitX = 768 / (VISUAL_HALF_X * 2);
    const pxPerUnitZ = 768 / (VISUAL_HALF_Z * 2);
    const drawX = (VISUAL_HALF_X - this.arenaHalfX) * pxPerUnitX;
    const drawZ = (VISUAL_HALF_Z - this.arenaHalfZ) * pxPerUnitZ;
    const drawW = this.arenaHalfX * 2 * pxPerUnitX;
    const drawH = this.arenaHalfZ * 2 * pxPerUnitZ;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (this.svgRotation % 180 !== 0) {
      // Gambar diputar 90/270: gambar di sekitar pusat arena dengan dims tertukar.
      ctx.translate(drawX + drawW / 2, drawZ + drawH / 2);
      ctx.rotate((this.svgRotation * Math.PI) / 180);
      ctx.drawImage(image, -drawH / 2, -drawW / 2, drawH, drawW);
    } else {
      ctx.drawImage(image, drawX, drawZ, drawW, drawH);
    }
    // Bul lembut: gradasi tepi agar PNG menyatu dengan rumput di sekelilingnya.
    const feather = 14;
    const gradients: [number, number, number, number, [number, number, number, number]][] = [
      [drawX, drawZ, drawX + feather, drawZ],
      [drawX + drawW, drawZ, drawX + drawW - feather, drawZ],
      [drawX, drawZ, drawX, drawZ + feather],
      [drawX, drawZ + drawH, drawX, drawZ + drawH - feather],
    ].map(([x0, y0, x1, y1]) => [x0, y0, x1, y1, [102, 135, 75, 0.85]] as [number, number, number, number, [number, number, number, number]]);
    for (const [x0, y0, x1, y1, color] of gradients) {
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${color[3]})`);
      gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
      ctx.fillStyle = gradient;
      if (y0 === y1) ctx.fillRect(Math.min(x0, x1), drawZ, feather, drawH);
      else ctx.fillRect(drawX, Math.min(y0, y1), drawW, feather);
    }
    ctx.restore();
    if (this.terrainTexture) this.terrainTexture.needsUpdate = true;
  }

  private distanceToPathSquared(x: number, z: number) {
    let nearest = Infinity;
    for (const samples of this.paths) {
      for (let index = 0; index < samples.length; index += 3) {
        const point = samples[index];
        const dx = point.x - x;
        const dz = point.z - z;
        const distance = dx * dx + dz * dz;
        if (distance < nearest) nearest = distance;
      }
    }
    return nearest;
  }

  private clearDecorations() {
    for (const mesh of this.decorationVisuals) {
      this.scene.remove(mesh);
      mesh.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.decorationVisuals = [];
    this.terrainObstacles = [];
  }

  private createDecorations() {
    // Peta PNG: terrain sudah berupa gambar, dekorasi 3D dinonaktifkan.
    if (this.svgGrid) return;
    const random = randomGenerator(4623 ^ this.trackSeed);
    const dummy = new THREE.Object3D();
    const configs = [
      {
        count: 420,
        geometry: new THREE.ConeGeometry(0.25, 0.8, 3),
        colors: [0x7d9e4c, 0x648c3c, 0x8da759, 0xa6aa66],
        minScale: 0.45,
        maxScale: 1.5,
        padding: 4.1,
      },
      {
        count: 190,
        geometry: new THREE.IcosahedronGeometry(0.7, 0),
        colors: [0x315c34, 0x3b703e, 0x508342, 0x467339],
        minScale: 0.4,
        maxScale: 1.25,
        padding: 8.5,
      },
      {
        count: 145,
        geometry: new THREE.DodecahedronGeometry(0.46, 0),
        colors: [0x938879, 0x867d6d, 0xb1a894, 0x79796b],
        minScale: 0.4,
        maxScale: 1.5,
        padding: 6.8,
      },
      {
        count: 46,
        geometry: new THREE.ConeGeometry(1.0, 2.8, 5),
        colors: [0x26562e, 0x317038, 0x397d3d, 0x2c6131],
        minScale: 0.65,
        maxScale: 1.25,
        padding: 10.8,
      },
    ];

    for (const config of configs) {
      const mesh = new THREE.InstancedMesh(
        config.geometry,
        new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
        config.count,
      );
      let placed = 0;
      let attempts = 0;
      while (placed < config.count && attempts < config.count * 30) {
        attempts++;
        const x = (random() - 0.5) * (this.arenaHalfX * 2 - 6);
        const z = (random() - 0.5) * (this.arenaHalfZ * 2 - 6);
        if (this.distanceToPathSquared(x, z) < config.padding * config.padding) continue;
        if (this.svgGrid && gridBlocked(this.svgGrid, x, z, 1.8)) continue;
        if ((x - this.fortressX) ** 2 + z * z < 10.5 ** 2) continue;
        if (this.towers.some((tower) => (tower.x - x) ** 2 + (tower.z - z) ** 2 < 3.1 ** 2)) continue;
        const scale = config.minScale + random() * (config.maxScale - config.minScale);
        dummy.position.set(x, config.count === 145 ? 0.12 * scale : config.count === 190 ? 0.38 * scale : config.count === 46 ? 1.25 * scale : 0.32 * scale, z);
        dummy.scale.set(scale, scale * (0.75 + random() * 0.45), scale);
        dummy.rotation.set(0, random() * Math.PI * 2, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        mesh.setColorAt(placed, new THREE.Color(config.colors[Math.floor(random() * config.colors.length)]));
        if ((config.count === 145 || config.count === 190 || config.count === 46) && this.distanceToPathSquared(x, z) < 8 ** 2) {
          this.terrainObstacles.push({ x, z, radius: (config.count === 46 ? 0.7 : config.count === 190 ? 0.52 : 0.45) * scale });
        }
        placed++;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.decorationVisuals.push(mesh);
    }
  }

  private createFortress() {
    const stone = new THREE.MeshLambertMaterial({ color: 0x9c947d, flatShading: true });
    const stoneTop = new THREE.MeshLambertMaterial({ color: 0xc2b597, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x493529, flatShading: true });
    const metal = new THREE.MeshLambertMaterial({ color: 0x875442, flatShading: true });
    const banner = new THREE.MeshLambertMaterial({ color: 0xb84730, side: THREE.DoubleSide });
    const group = new THREE.Group();

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    const foundation = new THREE.Mesh(new THREE.CircleGeometry(8.4, 32), new THREE.MeshBasicMaterial({ color: 0x4c713d }));
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(0, -0.04, 0);
    group.add(foundation);

    const dais = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.8, 0.5, 8), stoneTop);
    dais.position.y = 0.21;
    group.add(dais);

    // Four open gates frame the central keep without blocking any incoming lane.
    for (const side of [-1, 1]) {
      for (const offset of [-4.25, 4.25]) {
        box(2.3, 2.35, 0.95, offset, 1.2, side * 5.25, stone);
        box(0.95, 2.35, 2.3, side * 5.25, 1.2, offset, stone);
        box(2.55, 0.28, 1.13, offset, 2.54, side * 5.25, stoneTop);
        box(1.13, 0.28, 2.55, side * 5.25, 2.54, offset, stoneTop);
      }
    }

    for (const x of [-5.2, 5.2]) {
      for (const z of [-5.2, 5.2]) {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 4.4, 8), stone);
        turret.position.set(x, 2.2, z);
        group.add(turret);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.35, 8), stoneTop);
        rim.position.set(x, 4.55, z);
        group.add(rim);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 8), metal);
        roof.position.set(x, 5.35, z);
        group.add(roof);
      }
    }

    box(4.5, 4.1, 4.5, 0, 2.35, 0, stone);
    box(5.05, 0.5, 5.05, 0, 4.7, 0, stoneTop);
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.7, 4), dark);
    keepRoof.position.set(0, 6.18, 0);
    keepRoof.rotation.y = Math.PI / 4;
    group.add(keepRoof);
    for (const side of [-1, 1]) {
      box(0.12, 1.32, 0.82, 0, 2.98, side * 2.31, banner);
      box(0.82, 1.32, 0.12, side * 2.31, 2.98, 0, banner);
    }

    const flagpole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 3.3, 5), metal);
    flagpole.position.set(0, 8.82, 0);
    group.add(flagpole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), banner);
    flag.position.set(0, 9.6, 1.05);
    this.fortressFlag = flag;
    group.add(flag);
    // Benteng berdiri di tepi timur (kanan layar) — tujuan akhir horde orc.
    group.position.set(this.fortressX, 0, 0);
    this.scene.add(group);

    const stakeMaterial = new THREE.MeshLambertMaterial({ color: 0x704b31, flatShading: true });
    for (const lane of this.lanes) {
      const start = lane.controls[0];
      for (const side of [-1, 1]) {
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.45, 5), stakeMaterial);
        if (Math.abs(start[0]) > Math.abs(start[1])) stake.position.set(start[0], 0.7, start[1] + side * 3.4);
        else stake.position.set(start[0] + side * 3.4, 0.7, start[1]);
        stake.rotation.z = side * 0.13;
        this.scene.add(stake);
      }
    }
  }

  private createOrcInstances() {
    const parts: { geometry: THREE.BufferGeometry; part: number }[] = [];
    const addPart = (geometry: THREE.BufferGeometry, color: number, part = 0) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      const count = flat.getAttribute("position").count;
      const vertexColor = new THREE.Color(color);
      const colors = new Float32Array(count * 3);
      for (let index = 0; index < count; index++) {
        colors[index * 3] = vertexColor.r;
        colors[index * 3 + 1] = vertexColor.g;
        colors[index * 3 + 2] = vertexColor.b;
      }
      flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      parts.push({ geometry: flat, part });
    };

    const body = new THREE.CylinderGeometry(0.31, 0.4, 0.9, 5);
    body.translate(0, 0.65, 0);
    addPart(body, 0x516c26);
    const face = new THREE.IcosahedronGeometry(0.35, 0);
    face.translate(0, 1.31, 0);
    addPart(face, 0x82a641, 1);
    const helmet = new THREE.ConeGeometry(0.34, 0.35, 5);
    helmet.translate(0, 1.63, 0);
    addPart(helmet, 0x574b2e, 1);
    for (const side of [-1, 1]) {
      const tusk = new THREE.ConeGeometry(0.08, 0.24, 4);
      tusk.translate(0.17, 1.22, side * 0.2);
      addPart(tusk, 0xe8d7a2, 1);
    }

    const orcMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const hitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.68,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    // The head can be removed; arms, legs, and clubs are animated in one separate instanced rig.
    for (let mask = 0; mask < 2; mask++) {
      const merged = mergeGeometries(parts.filter(({ part }) => part === 0 || !(mask & part)).map(({ geometry }) => geometry));
      if (!merged) throw new Error("Could not create instanced orc geometry");
      const orc = new THREE.InstancedMesh(merged, orcMaterial, MAX_ORCS + MAX_CORPSES);
      orc.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      orc.setColorAt(0, ORC_TINTS[0]);
      orc.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      orc.count = 0;
      orc.frustumCulled = false;
      this.scene.add(orc);
      this.orcMeshes.push(orc);

      const highlight = new THREE.InstancedMesh(merged, hitMaterial, MAX_HIT_FLASHES);
      highlight.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      highlight.setColorAt(0, HIT_PALETTE.gunner[3]);
      highlight.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      highlight.count = 0;
      highlight.frustumCulled = false;
      highlight.renderOrder = 6;
      this.scene.add(highlight);
      this.hitMeshes.push(highlight);
    }
    parts.forEach(({ geometry }) => geometry.dispose());
  }

  private createEffectsLayer() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const random = randomGenerator(9631);
    ctx.translate(64, 64);
    const gradient = ctx.createRadialGradient(-9, -11, 3, 0, 0, 51);
    gradient.addColorStop(0, "rgba(232,64,43,0.97)");
    gradient.addColorStop(0.43, "rgba(155,30,27,0.96)");
    gradient.addColorStop(0.84, "rgba(83,16,17,0.86)");
    gradient.addColorStop(1, "rgba(60,13,13,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (let index = 0; index <= 28; index++) {
      const angle = (index / 28) * Math.PI * 2;
      const radius = 33 + random() * 16;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius * (0.72 + random() * 0.18);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    for (let index = 0; index < 12; index++) {
      const angle = random() * Math.PI * 2;
      const distance = 42 + random() * 18;
      ctx.fillStyle = index % 3 === 0 ? "rgba(208,49,34,0.78)" : "rgba(99,19,21,0.8)";
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.72, 1.5 + random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    this.splatTexture = new THREE.CanvasTexture(canvas);
    this.splatTexture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    this.splatMesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: this.splatTexture, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.08 }),
      MAX_SPLATS,
    );
    this.splatMesh.count = 0;
    this.splatMesh.frustumCulled = false;
    this.scene.add(this.splatMesh);

    this.bloodMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.085, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_BLOOD,
    );
    this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.setColorAt(0, BLOOD_COLORS[0]);
    this.bloodMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.count = 0;
    this.bloodMesh.frustumCulled = false;
    this.scene.add(this.bloodMesh);

    this.shotMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.13, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
      MAX_SHOT_PARTICLES,
    );
    this.shotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shotMesh.setColorAt(0, SHOT_COLORS[0]);
    this.shotMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    this.shotMesh.count = 0;
    this.shotMesh.frustumCulled = false;
    this.scene.add(this.shotMesh);

    this.rifleMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.048, 0.074, 0.67, 6),
      new THREE.MeshBasicMaterial({ color: 0xffecaa, toneMapped: false, depthWrite: false }),
      MAX_RIFLE_SHOTS,
    );
    this.rifleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rifleMesh.count = 0;
    this.rifleMesh.frustumCulled = false;
    this.scene.add(this.rifleMesh);

    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0xbafaff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    inner.position.y = 12;
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x47d7e9, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    outer.position.y = 12;
    const impact = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.62, 32),
      new THREE.MeshBasicMaterial({ color: 0xc6fbff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    impact.rotation.x = -Math.PI / 2;
    impact.position.y = 0.22;
    this.beam.add(outer, inner, impact);
    this.beam.visible = false;
    this.scene.add(this.beam);
  }

  private createPlacementGhost() {
    this.ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(0.992, 1.008, 96),
      new THREE.MeshBasicMaterial({ color: 0xf0e0af, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.position.y = 0.29;
    this.ghostCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.09, 16),
      new THREE.MeshBasicMaterial({ color: 0xe6d9af, transparent: true, opacity: 0.65, depthWrite: false }),
    );
    this.ghostCore.position.y = 0.18;
    this.ghost.add(this.ghostRing, this.ghostCore);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  private createPreviewOrcs() {
    const random = randomGenerator(8449);
    for (let row = 0; row < 10; row++) {
      for (let column = 0; column < 7; column++) {
        this.previewOrcs.push({
          id: this.nextEnemyId++,
          lane: (row * 7 + column) % this.paths.length,
          x: -37.5 + column * 1.1 + random() * 0.35,
          z: -13.7 + row * 0.72 + random() * 0.24,
          vx: 0,
          vz: 0,
          stagger: 0,
          hitFlash: 0,
          hitTheme: "gunner",
          lostParts: 0,
          shockTime: 0,
          shockSparkTimer: 0,
          distance: 0,
          offset: 0,
          speed: 0,
          hp: 1,
          alive: true,
          armored: row % 4 === 0 && column % 3 === 0,
          variant: Math.floor(random() * 4),
          wobble: random() * Math.PI * 2,
          scale: 0.83 + random() * 0.24,
          angle: 0,
          baseOffset: 0,
          raider: false,
          attackTimer: 0,
          attackPulse: 0,
          lift: 0,
          liftV: 0,
          tumble: 0,
          tumbleV: 0,
        });
      }
    }
    this.positionPreviewOrcs();
  }

  private positionPreviewOrcs() {
    for (let index = 0; index < this.previewOrcs.length; index++) {
      const enemy = this.previewOrcs[index];
      enemy.lane = index % this.paths.length;
      const rank = Math.floor(index / this.paths.length);
      enemy.distance = 1.2 + rank * 0.88;
      enemy.offset = ((rank % 6) - 2.5) * 0.7 + Math.sin(index * 5.3) * 0.09;
      this.samplePath(enemy, true);
    }
  }

  private addTower(type: TowerType, x: number, z: number) {
    const config = TOWERS[type];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const head = new THREE.Group();
    head.position.y = 1.18;
    const stone = new THREE.MeshLambertMaterial({ color: 0x847455, flatShading: true });
    const metal = new THREE.MeshLambertMaterial({ color: 0xbbb19a, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x594637, flatShading: true });
    const accent = new THREE.MeshLambertMaterial({ color: config.color, emissive: new THREE.Color(config.color), emissiveIntensity: 0.22, flatShading: true });

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.22, 20),
      new THREE.MeshBasicMaterial({ color: 0x17241d, transparent: true, opacity: 0.37, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.055;
    group.add(shadow);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.91, 1.12, 0.78, 8), stone);
    base.position.y = 0.43;
    group.add(base);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.79, 0.84, 0.2, 8), metal);
    rim.position.y = 0.9;
    group.add(rim);

    const addHead = (geometry: THREE.BufferGeometry, material: THREE.Material, px: number, py: number, pz: number) => {
      const part = new THREE.Mesh(geometry, material);
      part.position.set(px, py, pz);
      head.add(part);
      return part;
    };

    let radarDish: THREE.Group | undefined;
    let leftPod: THREE.Group | undefined;
    let rightPod: THREE.Group | undefined;
    let targetLaser: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined;
    let laserDot: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | undefined;

    if (type === "gunner") {
      addHead(new THREE.BoxGeometry(1.1, 0.62, 0.87), dark, 0, 0.1, 0);
      for (const side of [-1, 1]) {
        addHead(new THREE.BoxGeometry(1.34, 0.16, 0.16), metal, 0.95, 0.16, side * 0.23);
        addHead(new THREE.BoxGeometry(0.18, 0.22, 0.2), accent, 1.63, 0.16, side * 0.23);
      }
      addHead(new THREE.BoxGeometry(0.62, 0.18, 0.48), accent, -0.15, 0.46, 0);
    } else if (type === "flame") {
      addHead(new THREE.BoxGeometry(1.05, 0.75, 0.9), dark, 0, 0.12, 0);
      const nozzle = addHead(new THREE.CylinderGeometry(0.31, 0.22, 1.2, 8), metal, 0.88, 0.16, 0);
      nozzle.rotation.z = Math.PI / 2;
      const tip = addHead(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 8), accent, 1.51, 0.16, 0);
      tip.rotation.z = Math.PI / 2;
      addHead(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 8), accent, -0.45, 0.65, 0);
    } else if (type === "mortar") {
      addHead(new THREE.BoxGeometry(1.1, 0.55, 1.0), dark, 0, 0, 0);
      const barrel = addHead(new THREE.CylinderGeometry(0.38, 0.48, 1.7, 10), metal, 0.45, 0.56, 0);
      barrel.rotation.z = -0.72;
      addHead(new THREE.BoxGeometry(0.72, 0.13, 0.9), accent, -0.22, 0.32, 0);
    } else if (type === "tesla") {
      addHead(new THREE.CylinderGeometry(0.47, 0.58, 1.22, 8), dark, 0, 0.54, 0);
      for (const y of [0.25, 0.75, 1.18]) {
        addHead(new THREE.CylinderGeometry(0.58, 0.58, 0.14, 8), metal, 0, y, 0);
      }
      addHead(new THREE.IcosahedronGeometry(0.43, 0), accent, 0, 1.6, 0);
    } else if (type === "barracks") {
      const iron = new THREE.MeshLambertMaterial({ color: 0x555869, flatShading: true });
      const crimson = new THREE.MeshLambertMaterial({ color: 0x9d3733, flatShading: true });
      addHead(new THREE.BoxGeometry(1.3, 0.76, 1.16), iron, 0, 0.08, 0);
      addHead(new THREE.BoxGeometry(1.68, 0.17, 1.44), crimson, 0, 0.53, 0);
      addHead(new THREE.BoxGeometry(0.55, 0.58, 0.5), accent, 0, 0.92, 0);
      for (const side of [-1, 1]) {
        addHead(new THREE.BoxGeometry(0.32, 0.48, 0.24), crimson, 0.29, 0.77, side * 0.55);
        addHead(new THREE.BoxGeometry(0.12, 0.9, 0.12), metal, -0.43, 0.96, side * 0.39);
      }
    } else if (type === "rocket") {
      // Rocket Battery turret head with independent left/right pods and revolving radar
      addHead(new THREE.BoxGeometry(1.22, 0.48, 1.12), dark, 0, 0.12, 0);
      addHead(new THREE.BoxGeometry(0.76, 0.65, 0.76), metal, 0, 0.44, 0);
      for (const side of [-1, 1]) {
        const podGroup = new THREE.Group();
        podGroup.position.set(0.14, 0.54, side * 0.58);
        podGroup.rotation.z = 0.22;
        const podMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.44, 0.52), dark);
        podGroup.add(podMesh);
        const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 0.55), accent);
        trimMesh.position.y = 0.2;
        podGroup.add(trimMesh);

        // Rear backblast exhaust vent
        const ventMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.42), metal);
        ventMesh.position.set(-0.58, 0, 0);
        podGroup.add(ventMesh);

        for (const dy of [-0.11, 0.11]) {
          for (const dz of [-0.14, 0.14]) {
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.35, 8), metal);
            tube.position.set(0.52, dy, dz);
            tube.rotation.z = Math.PI / 2;
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), accent);
            tip.position.set(0.66, dy, dz);
            tip.rotation.z = -Math.PI / 2;
            podGroup.add(tube, tip);
          }
        }
        head.add(podGroup);
        if (side === -1) leftPod = podGroup;
        else rightPod = podGroup;
      }
      radarDish = new THREE.Group();
      radarDish.position.set(-0.35, 0.95, 0);
      const dishMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.18, 8), metal);
      dishMesh.rotation.z = -0.45;
      const lensMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), accent);
      lensMesh.position.set(0.06, 0.04, 0);
      const antennaMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.65, 4), metal);
      antennaMesh.position.set(-0.05, 0.32, 0.22);
      antennaMesh.rotation.x = 0.25;
      radarDish.add(dishMesh, lensMesh, antennaMesh);
      head.add(radarDish);

      const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const laserMat = new THREE.LineBasicMaterial({
        color: 0xff1500,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      targetLaser = new THREE.Line(laserGeo, laserMat);
      targetLaser.frustumCulled = false;
      targetLaser.visible = false;
      this.scene.add(targetLaser);

      const dotGeo = new THREE.RingGeometry(0.25, 0.42, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      laserDot = new THREE.Mesh(dotGeo, dotMat);
      laserDot.rotation.x = -Math.PI / 2;
      laserDot.visible = false;
      this.scene.add(laserDot);
    } else {
      addHead(new THREE.BoxGeometry(1.25, 0.6, 0.85), dark, 0, 0.1, 0);
      addHead(new THREE.BoxGeometry(1.7, 0.19, 0.22), metal, 1.12, 0.2, 0);
      addHead(new THREE.BoxGeometry(0.22, 0.33, 0.34), accent, 2.02, 0.2, 0);
      addHead(new THREE.BoxGeometry(0.7, 0.16, 0.52), accent, -0.18, 0.49, 0);
    }

    group.add(head);
    const rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.996, 1.004, 96),
      new THREE.MeshBasicMaterial({ color: 0xf1eed6, transparent: true, opacity: 0.21, side: THREE.DoubleSide, depthWrite: false }),
    );
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.y = 0.12;
    rangeRing.scale.setScalar(config.range);
    group.add(rangeRing);
    const healthGroup = new THREE.Group();
    healthGroup.position.set(0, 2.9, 0);
    healthGroup.rotation.x = -Math.atan2(76, 59);
    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x321f19, depthTest: false }),
    );
    const healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.54, 0.17),
      new THREE.MeshBasicMaterial({ color: 0x94d36f, depthTest: false }),
    );
    healthFill.position.z = 0.01;
    healthGroup.add(healthBack, healthFill);
    healthGroup.visible = false;
    group.add(healthGroup);
    this.scene.add(group);
    const maxHp = type === "barracks" ? 240 : type === "flame" ? 160 : type === "gunner" ? 145 : type === "rocket" ? 150 : 125;
    const tower: Tower = {
      id: this.nextTowerId++, type, x, z, level: 1, cooldown: Math.random() * 0.2, recoil: 0, barrelSide: 1,
      maxHp, hp: maxHp, hitTimer: 0, group, head, rangeRing, healthGroup, healthFill,
      radarDish, leftPod, rightPod, targetLaser, laserDot, salvoQueue: [],
    };
    this.towers.push(tower);
    if (tower.type === "barracks") this.syncMarineUnits();
    this.updateRangeRings();
    return tower;
  }

  private syncMarineUnits() {
    const sites = this.towers.filter((tower) => tower.type === "barracks");
    this.marineUnits = this.marineUnits.filter((unit) =>
      unit.towerId < 0 || sites.some((tower) =>
        tower.id === unit.towerId && unit.slot < Math.min(4, tower.level + 1)));

    for (const tower of sites) {
      const soldiers = Math.min(4, tower.level + 1);
      for (let slot = 0; slot < soldiers; slot++) {
        const existing = this.marineUnits.find((unit) => unit.towerId === tower.id && unit.slot === slot);
        if (existing) {
          existing.homeX = tower.x;
          existing.homeZ = tower.z;
          existing.maxHp = 200 + (tower.level - 1) * 55;
          existing.hp = Math.min(existing.hp, existing.maxHp);
          if (Math.hypot(existing.x - tower.x, existing.z - tower.z) > 18) {
            existing.x = tower.x + Math.cos(slot * 2.7) * 2.4;
            existing.z = tower.z + Math.sin(slot * 2.7) * 2.4;
          }
          continue;
        }
        if (this.marineUnits.length >= MAX_MARINES) return;
        const direction = slot * Math.PI * 1.32 + tower.id * 0.15;
        this.marineUnits.push({
          id: this.nextMarineId++,
          towerId: tower.id,
          slot,
          homeX: tower.x,
          homeZ: tower.z,
          x: tower.x + Math.cos(direction) * 2.45,
          z: tower.z + Math.sin(direction) * 2.45,
          angle: direction,
          walkPhase: slot * 1.9,
          walkAmount: 0,
          impactPulse: 0,
          action: "idle",
          actionTime: 0,
          actionDuration: 0,
          swingVariant: slot,
          hitTime: 0,
          scale: 1.14,
          hp: 200 + (tower.level - 1) * 55,
          maxHp: 200 + (tower.level - 1) * 55,
          respawn: 0,
          gunTimer: Math.random() * 0.18,
          meleeTimer: 0.3 + slot * 0.15,
          hurtTimer: 0,
          attacks: 0,
          footstepTimer: 0,
          hitApplied: false,
        });
      }
    }
  }

  private initLaneGuardMarines() {
    // 4 lanes x 2 flanks (left & right) x 3 marines = 24 marines standing guard at start of game
    for (let lane = 0; lane < this.paths.length; lane++) {
      const path = this.paths[lane];
      if (!path || path.length < 240) continue;
      for (const side of [-1, 1]) {
        for (let rank = 0; rank < 3; rank++) {
          const guardId = -100 - (lane * 6 + (side === 1 ? 3 : 0) + rank);
          // Spaced evenly along the defense line flanking the road (~80-85% along path,
          // menjaga pendekatan benteng di tepi timur)
          const stepIndex = clamp(286 + rank * 11, 0, path.length - 1);
          const pt = path[stepIndex];
          const homeX = pt.x + pt.nx * (side * 5.8);
          const homeZ = pt.z + pt.nz * (side * 5.8);
          const prevPt = path[Math.max(0, stepIndex - 12)];
          const facing = Math.atan2(prevPt.z - pt.z, prevPt.x - pt.x);

          let existing = this.marineUnits.find((u) => u.towerId === guardId);
          if (existing) {
            existing.homeX = homeX;
            existing.homeZ = homeZ;
            if (this.phase === "build") {
              existing.x = homeX;
              existing.z = homeZ;
              existing.angle = facing;
            }
          } else {
            this.marineUnits.push({
              id: this.nextMarineId++,
              towerId: guardId,
              slot: rank,
              homeX,
              homeZ,
              x: homeX,
              z: homeZ,
              angle: facing,
              walkPhase: rank * 1.8 + lane * 0.7,
              walkAmount: 0,
              impactPulse: 0,
              action: "idle",
              actionTime: 0,
              actionDuration: 0,
              swingVariant: rank % 5,
              hitTime: 0,
              scale: 1.14,
              hp: 250,
              maxHp: 250,
              respawn: 0,
              gunTimer: Math.random() * 0.18,
              meleeTimer: 0.3 + rank * 0.15,
              hurtTimer: 0,
              attacks: 0,
              footstepTimer: 0,
              hitApplied: false,
            });
          }
        }
      }
    }
  }

  private emitSmoke(x: number, y: number, z: number, count = 10, scale = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.6 + Math.random() * 2.2) * scale;
      this.addShotParticle({
        x: x + (Math.random() - 0.5) * 0.9 * scale,
        y: y + Math.random() * 0.5 * scale,
        z: z + (Math.random() - 0.5) * 0.9 * scale,
        vx: Math.cos(angle) * speed,
        vy: (1.8 + Math.random() * 3.4) * scale,
        vz: Math.sin(angle) * speed,
        age: 0,
        life: 0.45 + Math.random() * 0.38,
        size: (0.75 + Math.random() * 0.8) * scale,
        gravity: -1.4,
        drag: 1.6,
        color: 5,
      });
    }
  }

  private findMarineTarget(unit: MarineUnit, range: number): Enemy | null {
    const cellX = Math.floor(unit.x / 1.3);
    const cellZ = Math.floor(unit.z / 1.3);
    const reach = Math.ceil(range / 1.3);
    let nearest = range * range;
    let target: Enemy | null = null;
    for (let cx = cellX - reach; cx <= cellX + reach; cx++) {
      for (let cz = cellZ - reach; cz <= cellZ + reach; cz++) {
        const bucket = this.collisionCells.get(cx * 1024 + cz);
        if (!bucket) continue;
        for (const body of bucket) {
          if (!("hp" in body) || !body.alive) continue;
          if ((body.x - unit.homeX) ** 2 + (body.z - unit.homeZ) ** 2 > 19 ** 2) continue;
          const dist = (body.x - unit.x) ** 2 + (body.z - unit.z) ** 2;
          if (dist < nearest) {
            nearest = dist;
            target = body;
          }
        }
      }
    }
    return target;
  }

  private updateMarineUnits(dt: number) {
    for (const unit of this.marineUnits) {
      const tower = unit.towerId >= 0 ? this.towers.find((site) => site.id === unit.towerId) : null;
      if (unit.towerId >= 0 && !tower) continue;
      if (tower) {
        unit.homeX = tower.x;
        unit.homeZ = tower.z;
      }
      unit.hitTime = Math.max(0, unit.hitTime - dt);
      unit.impactPulse = Math.max(0, unit.impactPulse - dt * 5);
      unit.hurtTimer = Math.max(0, unit.hurtTimer - dt);
      unit.footstepTimer = Math.max(0, unit.footstepTimer - dt);

      // Knockback trajectory, tumbling in the air, and smoking from Hulk smash
      if (unit.vx || unit.vz || (unit.liftV !== undefined && unit.liftV !== 0) || (unit.lift !== undefined && unit.lift > 0)) {
        unit.x = clamp(unit.x + (unit.vx || 0) * dt, -this.arenaHalfX + 4, this.arenaHalfX - 4);
        unit.z = clamp(unit.z + (unit.vz || 0) * dt, -this.arenaHalfZ + 4, this.arenaHalfZ - 4);
        unit.vx = (unit.vx || 0) * Math.exp(-dt * 2.8);
        unit.vz = (unit.vz || 0) * Math.exp(-dt * 2.8);

        unit.lift = Math.max(0, (unit.lift || 0) + (unit.liftV || 0) * dt);
        unit.liftV = (unit.liftV || 0) - 24.0 * dt;
        unit.tumble = (unit.tumble || 0) + (unit.tumbleV || 0) * dt;
        unit.tumbleV = (unit.tumbleV || 0) * Math.exp(-dt * 2.2);

        if (unit.smoking && unit.smoking > 0) {
          unit.smoking -= dt;
          if (Math.random() < 0.65) {
            this.emitSmoke(unit.x, (unit.lift || 0) + 0.8, unit.z, 2, 0.75);
            this.shotBurst(unit.x, (unit.lift || 0) + 0.8, unit.z, 2, 0, 4.0);
          }
        }

        if (unit.lift <= 0 && (unit.liftV || 0) <= 0) {
          unit.lift = 0;
          unit.liftV = 0;
          unit.tumble = 0;
          unit.tumbleV = 0;
          if (unit.hp <= 0 && !unit.isBlownUp) {
            unit.isBlownUp = true;
            this.emitSmoke(unit.x, 1.0, unit.z, 28, 2.2);
            this.createExplosion(unit.x, unit.z, 2.8, 0xff4411, true, 0.6);
            this.shotBurst(unit.x, 1.0, unit.z, 30, 1, 12.0);
            this.addSplat(unit.x, unit.z, 1.4);
            this.playSound("explosion", unit.x);
          }
        }
      }

      if (unit.hp <= 0) {
        unit.respawn -= dt;
        if (unit.respawn <= 0) {
          unit.hp = unit.maxHp;
          unit.x = tower ? tower.x + Math.cos(unit.slot * 2.7) * 2.4 : unit.homeX;
          unit.z = tower ? tower.z + Math.sin(unit.slot * 2.7) * 2.4 : unit.homeZ;
          unit.walkAmount = 0;
          unit.action = "idle";
          unit.vx = 0;
          unit.vz = 0;
          unit.lift = 0;
          unit.liftV = 0;
          unit.tumble = 0;
          unit.tumbleV = 0;
          unit.smoking = 0;
          unit.isBlownUp = false;
          this.createExplosion(unit.x, unit.z, 0.9, 0xe4c887, false, 0.32);
        }
        continue;
      }

      unit.gunTimer = Math.max(0, unit.gunTimer - dt);
      unit.meleeTimer = Math.max(0, unit.meleeTimer - dt);
      unit.actionTime = Math.max(0, unit.actionTime - dt);
      const fight = this.phase === "battle";
      const target = fight ? this.findMarineTarget(unit, 15.2) : null;

      if (!unit.hitApplied && unit.actionTime <= unit.actionDuration * 0.52 && (unit.action === "slash" || unit.action === "kick")) {
        unit.hitApplied = true;
        if (unit.action === "slash") this.marineCleave(unit);
        else this.marineKick(unit);
      }
      if (unit.actionTime <= 0 && unit.action !== "walk") unit.action = "idle";

      if (target && unit.actionTime <= 0 && unit.meleeTimer <= 0 &&
        (target.x - unit.x) ** 2 + (target.z - unit.z) ** 2 < 3.8 ** 2) {
        unit.attacks++;
        // Kicks every 3rd attack so marines regularly kick zombies flying
        const kick = unit.attacks % 3 === 0;
        unit.action = kick ? "kick" : "slash";
        unit.actionDuration = kick ? 0.58 : 0.64;
        unit.actionTime = unit.actionDuration;
        unit.swingVariant = unit.attacks % 5;
        unit.hitApplied = false;
        unit.meleeTimer = kick ? 0.85 : 0.7;
        unit.angle = Math.atan2(target.z - unit.z, target.x - unit.x);
      }

      if (target && fight && unit.action !== "slash" && unit.action !== "kick" && unit.gunTimer <= 0 &&
        (target.x - unit.x) ** 2 + (target.z - unit.z) ** 2 <= 11.5 ** 2) {
        const damage = TOWERS.gunner.damage * (1 + this.progress.upgrades.ballistics * 0.18) * (tower ? 1 + (tower.level - 1) * 0.38 : 1.35);
        const heading = Math.atan2(target.z - unit.z, target.x - unit.x);
        unit.angle = heading;
        const forwardX = Math.cos(heading);
        const forwardZ = Math.sin(heading);
        const muzzle = new THREE.Vector3(
          unit.x + (forwardX * 1.7 + forwardZ * 0.72) * unit.scale,
          1.38 * unit.scale,
          unit.z + (forwardZ * 1.7 - forwardX * 0.72) * unit.scale,
        );
        this.fireRifleShot(unit.x, unit.z, muzzle, target, damage, "barracks");
        unit.gunTimer = 1 / (TOWERS.gunner.rate * (1 + this.progress.upgrades.overclock * 0.13));
        unit.action = "shoot";
        unit.actionDuration = 0.16;
        unit.actionTime = 0.16;
        this.playSound("marineShot", unit.x);
      }

      let desiredX: number;
      let desiredZ: number;
      let pace: number;
      if (target && fight) {
        desiredX = target.x;
        desiredZ = target.z;
        pace = 5.6;
      } else if (!tower) {
        // Lane guard stands alert on flank with subtle watchful stance adjustments
        desiredX = unit.homeX + Math.sin(this.elapsed * 0.45 + unit.id) * 0.35;
        desiredZ = unit.homeZ + Math.cos(this.elapsed * 0.45 + unit.id) * 0.35;
        pace = 2.4;
      } else {
        // Continuous lively patrol around outpost with heavy Hulkbuster stride
        const patrolAngle = this.elapsed * 0.68 + unit.slot * (Math.PI * 2 / Math.min(4, tower.level + 1)) + tower.id * 0.47;
        const patrolRadius = 2.8 + (unit.slot % 2) * 1.1;
        desiredX = tower.x + Math.cos(patrolAngle) * patrolRadius;
        desiredZ = tower.z + Math.sin(patrolAngle) * patrolRadius;
        pace = 3.6;
      }
      const dirX = desiredX - unit.x;
      const dirZ = desiredZ - unit.z;
      const distance = Math.hypot(dirX, dirZ);
      const shouldMove = distance > (target ? 2.6 : 0.18) && unit.action !== "slash" && unit.action !== "kick";
      if (shouldMove) {
        const step = Math.min(distance, pace * dt);
        const oldX = unit.x;
        const oldZ = unit.z;
        unit.x += dirX / distance * step;
        unit.z += dirZ / distance * step;
        if (unit.x * unit.x + unit.z * unit.z < 8.5 ** 2) {
          unit.x = oldX;
          unit.z = oldZ;
        }
        unit.x = clamp(unit.x, -this.arenaHalfX + 5, this.arenaHalfX - 5);
        unit.z = clamp(unit.z, -this.arenaHalfZ + 5, this.arenaHalfZ - 5);
        const moved = Math.hypot(unit.x - oldX, unit.z - oldZ);
        const oldPhase = unit.walkPhase;
        // Heavy Hulkbuster walking stride
        unit.walkPhase += moved * 3.8;
        if (Math.floor(oldPhase / Math.PI) !== Math.floor(unit.walkPhase / Math.PI) && unit.footstepTimer <= 0 && moved > 0.003) {
          unit.impactPulse = 1;
          unit.footstepTimer = 0.18;
          this.shotBurst(unit.x, 0.12, unit.z, 4, 5, 2.4);
          this.playSound("marineStep", unit.x);
        }
        unit.walkAmount = Math.min(1, unit.walkAmount + dt * 6.5);
        if (unit.actionTime <= 0) unit.action = "walk";
      } else {
        unit.walkAmount = Math.max(0, unit.walkAmount - dt * 5);
        if (unit.actionTime <= 0) unit.action = "idle";
      }
      if (target) {
        const facing = Math.atan2(target.z - unit.z, target.x - unit.x);
        unit.angle += Math.atan2(Math.sin(facing - unit.angle), Math.cos(facing - unit.angle)) * Math.min(1, dt * 7.5);
      } else if (distance > 0.4) {
        const facing = Math.atan2(dirZ, dirX);
        unit.angle += Math.atan2(Math.sin(facing - unit.angle), Math.cos(facing - unit.angle)) * Math.min(1, dt * 4.5);
      }

      if (fight && unit.hurtTimer <= 0) {
        const enemy = this.findMarineTarget(unit, 1.45);
        if (enemy) {
          unit.hurtTimer = 0.9;
          unit.hitTime = 0.27;
          unit.hp = Math.max(0, unit.hp - (enemy.armored ? 8 : 4));
          enemy.attackPulse = 0.22;
          if (unit.hp === 0) {
            unit.respawn = 6.3;
            unit.action = "idle";
            unit.walkAmount = 0;
            this.createExplosion(unit.x, unit.z, 1.15, 0xf0b66c, false, 0.32);
            this.playSound("marineFall", unit.x);
          }
        }
      }
    }
  }

  private createMarineArc(unit: MarineUnit) {
    if (this.effects.length > 320) return;
    const variant = unit.swingVariant % 5;
    const facing = unit.angle;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const radius = 3.25 * unit.scale;
    const points: THREE.Vector3[] = [];
    const steps = 14;

    if (variant === 0) {
      // 0: High-to-Low Diagonal Executioner Cleave (Top-Right to Low-Left)
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = facing + (-1.05 + t * 2.1);
        const r = radius * (0.95 + Math.sin(t * Math.PI) * 0.35);
        const y = 2.45 - t * 1.8 + Math.sin(t * Math.PI) * 0.35;
        points.push(new THREE.Vector3(unit.x + Math.cos(angle) * r, y, unit.z + Math.sin(angle) * r));
      }
    } else if (variant === 1) {
      // 1: Rising Uppercut Cleave (Ground-Left launching to High-Right)
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = facing + (1.05 - t * 2.1);
        const r = radius * (0.95 + Math.sin(t * Math.PI) * 0.35);
        const y = 0.35 + t * 1.95 + Math.sin(t * Math.PI) * 0.3;
        points.push(new THREE.Vector3(unit.x + Math.cos(angle) * r, y, unit.z + Math.sin(angle) * r));
      }
    } else if (variant === 2) {
      // 2: Wide Horizontal 180° Level Sweep
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = facing + (-1.45 + t * 2.9);
        const r = radius * (1.1 + Math.sin(t * Math.PI) * 0.3);
        const y = 1.35 + Math.sin(t * Math.PI) * 0.22;
        points.push(new THREE.Vector3(unit.x + Math.cos(angle) * r, y, unit.z + Math.sin(angle) * r));
      }
    } else if (variant === 3) {
      // 3: Vertical Overhead Downward Ground Slam (crashing down straight in front)
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const forward = (1.15 + t * 2.4) * unit.scale;
        const y = Math.max(0.18, 3.2 - Math.pow(t, 0.72) * 3.0);
        points.push(new THREE.Vector3(unit.x + cos * forward, y, unit.z + sin * forward));
      }
    } else {
      // 4: Whirlwind 360° Spin Cleave (Full Circle)
      const fullSteps = 24;
      for (let i = 0; i <= fullSteps; i++) {
        const t = i / fullSteps;
        const angle = facing + t * Math.PI * 2;
        const r = radius * 1.15;
        const y = 1.38 + Math.sin(t * Math.PI * 4) * 0.16;
        points.push(new THREE.Vector3(unit.x + Math.cos(angle) * r, y, unit.z + Math.sin(angle) * r));
      }
    }

    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points);
    const colors = variant === 1 ? [0x32ccdf, 0xebffff] : variant === 3 ? [0xf85e33, 0xffefc6] : variant === 4 ? [0xd781ff, 0xffedff] : [0xed682b, 0xffeb9e];

    // Outer broad glowing energy blade sheath
    const outerGeo = new THREE.TubeGeometry(curve, variant === 4 ? 36 : 24, 0.34, 6, false);
    const outerMat = new THREE.MeshBasicMaterial({
      color: colors[0], transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.frustumCulled = false;
    this.scene.add(outerMesh);
    this.effects.push({ mesh: outerMesh, kind: "tracer", age: 0, life: 0.28, opacity: 0.65, size: 1, ownsGeometry: true });

    // Inner razor-sharp white-hot cutting core
    const innerGeo = new THREE.TubeGeometry(curve, variant === 4 ? 36 : 24, 0.095, 5, false);
    const innerMat = new THREE.MeshBasicMaterial({
      color: colors[1], transparent: true, opacity: 0.98, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.frustumCulled = false;
    this.scene.add(innerMesh);
    this.effects.push({ mesh: innerMesh, kind: "tracer", age: 0, life: 0.22, opacity: 0.98, size: 1, ownsGeometry: true });

    // Throw sparks along the crescent arc
    for (let s = 0; s < 4; s++) {
      const pt = points[Math.floor(Math.random() * points.length)];
      this.shotBurst(pt.x, pt.y, pt.z, 3, variant === 1 ? 3 : 0, 4.8);
    }
  }

  private nearbyMarineTargets(unit: MarineUnit, radius: number) {
    const reach = Math.ceil(radius / 1.3);
    const cx = Math.floor(unit.x / 1.3);
    const cz = Math.floor(unit.z / 1.3);
    const targets: { enemy: Enemy; distance: number }[] = [];
    for (let ix = -reach; ix <= reach; ix++) {
      for (let iz = -reach; iz <= reach; iz++) {
        const bucket = this.collisionCells.get((cx + ix) * 1024 + cz + iz);
        if (!bucket) continue;
        for (const body of bucket) {
          if (!("hp" in body) || !body.alive) continue;
          const dx = body.x - unit.x;
          const dz = body.z - unit.z;
          const squared = dx * dx + dz * dz;
          if (squared > radius * radius || squared < 0.2) continue;
          const direction = Math.atan2(dz, dx);
          const variant = unit.swingVariant % 5;
          // Spin cleave reaches all 360 degrees, others reach front 180 degrees
          if (variant !== 4) {
            const difference = Math.abs(Math.atan2(Math.sin(direction - unit.angle), Math.cos(direction - unit.angle)));
            if (difference > 1.75) continue;
          }
          targets.push({ enemy: body, distance: squared });
        }
      }
    }
    targets.sort((a, b) => a.distance - b.distance);
    return targets;
  }

  private marineCleave(unit: MarineUnit) {
    this.createMarineArc(unit);
    this.playSound("marineSlash", unit.x);
    const variant = unit.swingVariant % 5;
    const radius = variant === 4 ? 4.3 * unit.scale : 3.85 * unit.scale;
    const targets = this.nearbyMarineTargets(unit, radius);
    const limit = variant === 4 ? 6 : variant === 3 ? 4 : 3 + (unit.attacks % 2);
    for (let index = 0; index < Math.min(limit, targets.length); index++) {
      const enemy = targets[index].enemy;
      if (!enemy.alive) continue;
      const isBoss = enemy.isSuperHulk || enemy.isHulk;
      const damage = isBoss
        ? (enemy.isSuperHulk ? 115 : 155) * (1 + (unit.attacks % 3) * 0.15)
        : Math.max(enemy.hp + 1, 95);
      const force = enemy.isSuperHulk ? 0.0 : enemy.isHulk ? 0.35 : 36;
      this.damageEnemy(enemy, damage, unit.x, unit.z, force, true, "barracks", !isBoss);
      this.shotBurst(enemy.x, 1.05 + enemy.lift, enemy.z, 7, 0, 8.2);
    }
    if (targets.length > 0) {
      this.cameraShake = Math.min(0.9, this.cameraShake + 0.16 + Math.min(4, targets.length) * 0.05);
      if (variant === 3) {
        // Vertical ground slam cracks the earth in front of the marine
        const slamX = unit.x + Math.cos(unit.angle) * 2.2;
        const slamZ = unit.z + Math.sin(unit.angle) * 2.2;
        this.createExplosion(slamX, slamZ, 1.6, 0xf7b36a, false, 0.32);
        this.shotBurst(slamX, 0.3, slamZ, 14, 1, 6.8);
      } else {
        this.createExplosion(unit.x + Math.cos(unit.angle) * 2.2, unit.z + Math.sin(unit.angle) * 2.2, 1.15, 0xf6bd7e, false, 0.22);
      }
    }
  }

  private marineKick(unit: MarineUnit) {
    this.playSound("marineKick", unit.x);
    const kickX = unit.x + Math.cos(unit.angle) * 1.55;
    const kickZ = unit.z + Math.sin(unit.angle) * 1.55;

    // Localized screen shake (gempa kecil di titik nendang)
    this.cameraShake = Math.min(1.4, this.cameraShake + 0.38);

    // Ground shockwave & debris at kick impact point
    this.createExplosion(kickX, kickZ, 1.4, 0xf6ba78, false, 0.32);
    this.shotBurst(kickX, 0.35, kickZ, 16, 5, 8.5);

    // Kicked enemies fly backwards violently ("mental") with high velocity
    const targets = this.nearbyMarineTargets(unit, 3.2 * unit.scale);
    for (let index = 0; index < Math.min(4, targets.length); index++) {
      const enemy = targets[index].enemy;
      if (!enemy.alive) continue;
      if (enemy.isSuperHulk) {
        // Super Hulk does NOT budge from kicks - armor deflects boot
        this.damageEnemy(enemy, 75, unit.x, unit.z, 0, true, "barracks");
        this.shotBurst(kickX, 0.8, kickZ, 8, 0, 6.0);
        continue;
      }
      if (enemy.isHulk) {
        // Hulk barely flinches from kick (tidak mental)
        this.damageEnemy(enemy, 95, unit.x, unit.z, 0.3, true, "barracks");
        enemy.stagger = 0;
        continue;
      }
      const launchForce = 68;
      this.damageEnemy(enemy, 68 + (unit.attacks % 3) * 12, unit.x, unit.z, launchForce, true, "barracks");
      enemy.liftV = 13 + Math.random() * 3.5;
      enemy.tumbleV = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 9);
      enemy.stagger = 0.95;
    }
  }

  private destroyGroup(group: THREE.Group) {
    this.scene.remove(group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  private removeTowerExtras(tower: Tower) {
    if (tower.targetLaser) {
      this.scene.remove(tower.targetLaser);
      tower.targetLaser.geometry.dispose();
      tower.targetLaser.material.dispose();
      tower.targetLaser = undefined;
    }
    if (tower.laserDot) {
      this.scene.remove(tower.laserDot);
      tower.laserDot.geometry.dispose();
      (tower.laserDot.material as THREE.Material).dispose();
      tower.laserDot = undefined;
    }
  }

  private getTowerUpgradeCost(tower: Tower) {
    return Math.round(TOWERS[tower.type].cost * (0.72 + tower.level * 0.42));
  }

  private getRepairCost(tower: Tower) {
    return 45 + tower.level * 19;
  }

  private updateTowerHealthBar(tower: Tower) {
    const ratio = clamp(tower.hp / tower.maxHp, 0, 1);
    tower.healthGroup.visible = ratio < 0.998;
    tower.healthFill.scale.x = ratio;
    tower.healthFill.position.x = -0.77 * (1 - ratio);
    tower.healthFill.material.color.setHex(ratio < 0.33 ? 0xf16c4f : ratio < 0.65 ? 0xf2bb65 : 0x92ce65);
  }

  private damageTower(tower: Tower, damage: number, attacker: Enemy) {
    if (tower.hp <= 0) return;
    const freshHit = tower.hitTimer <= 0.15;
    tower.hp = Math.max(0, tower.hp - damage);
    tower.hitTimer = 0.85;
    this.updateTowerHealthBar(tower);
    this.playSound("towerHit", tower.x);
    if (freshHit) {
      this.createExplosion(tower.x, tower.z, 0.7, 0xffbb70, false, 0.21);
      this.shotBurst(tower.x, 1.05, tower.z, 5, 1, 5);
    }
    attacker.vx -= Math.cos(attacker.angle) * 1.35;
    attacker.vz -= Math.sin(attacker.angle) * 1.35;
    if (tower.hp > 0) {
      if (this.elapsed - this.lastTowerWarning > 7) {
        this.lastTowerWarning = this.elapsed;
        this.onToast("Orc menyerang tower! Perbaiki dengan coin sebelum hancur.");
      }
      return;
    }
    this.towers = this.towers.filter((item) => item.id !== tower.id);
    if (tower.type === "barracks") this.syncMarineUnits();
    if (this.selectedTowerId === tower.id) this.selectedTowerId = null;
    this.removeTowerExtras(tower);
    this.destroyGroup(tower.group);
    this.towersLost++;
    this.createExplosion(tower.x, tower.z, 2.2, 0xff9e56);
    this.playSound("towerBreak", tower.x);
    this.onToast(`${TOWERS[tower.type].name} dihancurkan orc! Bangun ulang setelah wave.`);
    this.emit();
  }

  public repairTower() {
    if (this.phase !== "build" && this.phase !== "battle") return;
    const selected = this.towers.find((tower) => tower.id === this.selectedTowerId && tower.hp < tower.maxHp);
    const target = selected ?? this.towers.reduce<Tower | null>((lowest, tower) => {
      if (tower.hp >= tower.maxHp) return lowest;
      return !lowest || tower.hp / tower.maxHp < lowest.hp / lowest.maxHp ? tower : lowest;
    }, null);
    if (!target) {
      this.onToast("Semua turret masih dalam kondisi baik.");
      return;
    }
    const cost = this.getRepairCost(target);
    if (this.scrap < cost) {
      this.onToast(`Butuh ${cost} coin untuk memperbaiki tower.`);
      return;
    }
    this.scrap -= cost;
    target.hp = Math.min(target.maxHp, target.hp + Math.ceil(target.maxHp * 0.52));
    target.hitTimer = 0;
    this.updateTowerHealthBar(target);
    this.playSound("repair", target.x);
    this.createExplosion(target.x, target.z, 1.1, 0x92d980, false, 0.35);
    this.onToast(`${TOWERS[target.type].name} diperbaiki (${Math.round(target.hp / target.maxHp * 100)}% HP).`);
    this.emit();
  }

  private getSellValue(tower: Tower) {
    return Math.round(TOWERS[tower.type].cost * 0.65 + (tower.level - 1) * TOWERS[tower.type].cost * 0.35);
  }

  private updateRangeRings() {
    for (const tower of this.towers) {
      tower.rangeRing.visible = this.phase === "build" && tower.id === this.selectedTowerId;
      tower.rangeRing.material.opacity = 0.72;
      tower.rangeRing.material.color.set(tower.id === this.selectedTowerId ? TOWERS[tower.type].color : 0xf1eed6);
      tower.rangeRing.scale.setScalar(TOWERS[tower.type].range + (tower.level - 1) * 0.8);
    }
  }

  private updateOrcInstances() {
    const list = this.phase === "build" || this.phase === "victory" ? this.previewOrcs : this.enemies;
    const count = Math.min(list.length, MAX_ORCS);
    this.orcCounts.fill(0);
    this.hitCounts.fill(0);
    let highlights = 0;

    for (let index = 0; index < count; index++) {
      const enemy = list[index];
      const gait = runCycle(enemy);
      const isRunning = enemy.stagger < 0.12 && enemy.shockTime <= 0;

      // Stride dynamics: lean into run, waddle, and grounded heavy bounce
      const hopDamp = Math.min(1, 1.25 / Math.sqrt(Math.max(0.6, enemy.scale)));
      const forwardLean = isRunning ? 0.22 * hopDamp : 0;
      const waddle = isRunning ? Math.sin(gait) * 0.09 * hopDamp : 0;
      const hop = isRunning ? Math.abs(Math.sin(gait)) * 0.08 * hopDamp : 0;
      const headNod = isRunning ? Math.sin(gait * 2) * 0.05 * hopDamp : 0;

      const swing = enemy.attackPulse > 0 ? Math.sin((1 - Math.min(1, enemy.attackPulse / 0.32)) * Math.PI) : 0;
      const shock = enemy.shockTime > 0;
      const jitter = shock ? Math.sin(this.elapsed * 87 + enemy.id * 0.67) * 0.055 : 0;
      this.dummy.position.set(enemy.x + jitter, enemy.lift + hop * enemy.scale, enemy.z - jitter * 0.5);

      this.dummy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -enemy.angle);
      this.dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -(forwardLean + headNod)));
      this.dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), waddle));
      if (enemy.tumble || swing) {
        this.dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), enemy.tumble + swing * 0.23));
      }
      this.dummy.scale.set(enemy.scale * (1 + swing * 0.09), enemy.scale * (1 - swing * 0.08), enemy.scale);
      this.dummy.updateMatrix();
      const mask = enemy.lostParts & 1;
      const variant = this.orcMeshes[mask];
      const slot = this.orcCounts[mask]++;
      variant.setMatrixAt(slot, this.dummy.matrix);
      const enemyColor = shock
        ? SHOCK_TINT
        : enemy.isSuperHulk
          ? SUPER_HULK_TINT
          : enemy.isHulk
            ? HULK_TINT
            : enemy.armored
              ? ARMORED_TINT
              : ORC_TINTS[enemy.variant];
      variant.setColorAt(slot, enemyColor);
      if ((enemy.hitFlash > 0 || shock) && enemy.alive && highlights < MAX_HIT_FLASHES) {
        this.dummy.scale.multiplyScalar(1.055);
        this.dummy.updateMatrix();
        const flash = this.hitMeshes[mask];
        const flashSlot = this.hitCounts[mask]++;
        flash.setMatrixAt(flashSlot, this.dummy.matrix);
        const theme = enemy.hitFlash > 0 ? enemy.hitTheme : "tesla";
        const flicker = shock ? Math.sin(this.elapsed * 70 + enemy.id) * 0.5 + 0.5 : 0;
        const level = enemy.hitFlash > 0
          ? clamp(Math.ceil(enemy.hitFlash / 0.22 * 4) - 1, 0, 3)
          : Math.floor(1 + flicker * 2);
        flash.setColorAt(flashSlot, HIT_PALETTE[theme][level]);
        highlights++;
      }
    }

    if (this.phase === "battle" || this.phase === "defeat") {
      for (const corpse of this.corpses) {
        if (this.ragdolls.has(corpse.id)) continue;
        this.dummy.position.set(corpse.x, corpse.y + 0.08, corpse.z);
        this.dummy.rotation.set(0, -corpse.angle, corpse.spin);
        this.dummy.scale.setScalar(corpse.scale * Math.max(0.3, 1 - Math.max(0, corpse.age - 1.1) * 0.64));
        this.dummy.updateMatrix();
        const mask = corpse.lostParts & 1;
        const variant = this.orcMeshes[mask];
        const slot = this.orcCounts[mask]++;
        variant.setMatrixAt(slot, this.dummy.matrix);
        variant.setColorAt(slot, CORPSE_TINT);
      }
    }

    for (let mask = 0; mask < 2; mask++) {
      const variant = this.orcMeshes[mask];
      variant.count = this.orcCounts[mask];
      if (variant.count) {
        variant.instanceMatrix.needsUpdate = true;
        if (variant.instanceColor) variant.instanceColor.needsUpdate = true;
      }
      const flash = this.hitMeshes[mask];
      flash.count = this.hitCounts[mask];
      if (flash.count) {
        flash.instanceMatrix.needsUpdate = true;
        if (flash.instanceColor) flash.instanceColor.needsUpdate = true;
      }
    }
  }

  private samplePath(enemy: Enemy, snap = false, correction = 0) {
    const samples = this.paths[enemy.lane];
    const progress = clamp((enemy.distance / this.pathLengths[enemy.lane]) * PATH_STEPS, 0, PATH_STEPS - 0.001);
    const index = Math.floor(progress);
    const mix = progress - index;
    const a = samples[index];
    const b = samples[index + 1];
    const nx = a.nx + (b.nx - a.nx) * mix;
    const nz = a.nz + (b.nz - a.nz) * mix;
    const targetX = a.x + (b.x - a.x) * mix + nx * enemy.offset;
    const targetZ = a.z + (b.z - a.z) * mix + nz * enemy.offset;
    if (snap) {
      enemy.x = targetX;
      enemy.z = targetZ;
    } else {
      // A stunned orc keeps its world position and momentum before steering back to its lane.
      enemy.x += (targetX - enemy.x) * correction;
      enemy.z += (targetZ - enemy.z) * correction;
    }
    if (enemy.stagger < 0.16) enemy.angle = Math.atan2(b.z - a.z, b.x - a.x);
  }

  private constrainToLane(body: Enemy | Corpse) {
    const samples = this.paths[body.lane];
    const center = clamp(Math.floor((body.distance / this.pathLengths[body.lane]) * PATH_STEPS), 0, PATH_STEPS - 1);
    const waypoint = samples[center];
    if (body.stagger <= 0.05 &&
      (body.x - waypoint.x) ** 2 + (body.z - waypoint.z) ** 2 < (LANE_HALF_WIDTH - 0.4) ** 2) return;
    const search = body.stagger > 0 ? 25 : 10;
    let nearest = Infinity;
    let anchorX = 0;
    let anchorZ = 0;
    let normalX = 0;
    let normalZ = 1;

    // Project onto nearby road segments instead of snapping to a single waypoint at bends.
    for (let index = Math.max(0, center - search); index <= Math.min(PATH_STEPS - 1, center + search); index++) {
      const a = samples[index];
      const b = samples[index + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const along = clamp(((body.x - a.x) * vx + (body.z - a.z) * vz) / (vx * vx + vz * vz || 1), 0, 1);
      const px = a.x + vx * along;
      const pz = a.z + vz * along;
      const distance = (body.x - px) ** 2 + (body.z - pz) ** 2;
      if (distance < nearest) {
        nearest = distance;
        anchorX = px;
        anchorZ = pz;
        normalX = a.nx + (b.nx - a.nx) * along;
        normalZ = a.nz + (b.nz - a.nz) * along;
      }
    }

    const normalLength = Math.hypot(normalX, normalZ) || 1;
    normalX /= normalLength;
    normalZ /= normalLength;
    const lateral = (body.x - anchorX) * normalX + (body.z - anchorZ) * normalZ;
    const width = Math.max(1.65, LANE_HALF_WIDTH - (body.scale - 1) * 0.25);
    if (Math.abs(lateral) <= width) return;

    const overflow = lateral - clamp(lateral, -width, width);
    body.x -= normalX * overflow;
    body.z -= normalZ * overflow;
    const outward = body.vx * normalX + body.vz * normalZ;
    if (outward * overflow > 0) {
      body.vx -= normalX * outward * 1.42;
      body.vz -= normalZ * outward * 1.42;
    }
  }

  private resolveCircle(body: Enemy | Corpse, x: number, z: number, radius: number) {
    const dx = body.x - x;
    const dz = body.z - z;
    const minDistance = radius + body.scale * 0.39;
    const squared = dx * dx + dz * dz;
    if (squared >= minDistance * minDistance) return false;
    const distance = Math.sqrt(squared);
    const nx = distance > 0.001 ? dx / distance : 1;
    const nz = distance > 0.001 ? dz / distance : 0;
    body.x = x + nx * minDistance;
    body.z = z + nz * minDistance;
    const inward = body.vx * nx + body.vz * nz;
    if (inward < 0) {
      body.vx -= nx * inward * 1.38;
      body.vz -= nz * inward * 1.38;
    }
    return true;
  }

  private constrainToTerrain(body: Enemy | Corpse) {
    this.constrainToLane(body);
    let collided = false;
    for (const tower of this.towers) {
      if (Math.abs(tower.x - body.x) > 2.4 || Math.abs(tower.z - body.z) > 2.4) continue;
      collided = this.resolveCircle(body, tower.x, tower.z, 1.05) || collided;
    }
    for (const obstacle of this.terrainObstacles) {
      if (Math.abs(obstacle.x - body.x) > 2 || Math.abs(obstacle.z - body.z) > 2) continue;
      collided = this.resolveCircle(body, obstacle.x, obstacle.z, obstacle.radius) || collided;
    }
    if (this.svgGrid) {
      // Tabrakan eksak kotak-sel: orc menempel pas di tepi tembok PNG.
      const bodyRadius = body.scale * 0.39;
      gridCollideBox(this.svgGrid, body, bodyRadius, (nx, nz, depth) => {
        body.x += nx * depth;
        body.z += nz * depth;
        const inward = body.vx * nx + body.vz * nz;
        if (inward < 0) {
          body.vx -= nx * inward * 1.38;
          body.vz -= nz * inward * 1.38;
        }
        collided = true;
      });
    }
    if (Math.abs(body.x - this.fortressX) < 8.5 && Math.abs(body.z) < 8.5) {
      collided = this.resolveCircle(body, this.fortressX, 0, 3.25) || collided;
      for (const x of [-5.2, 5.2]) {
        for (const z of [-5.2, 5.2]) collided = this.resolveCircle(body, this.fortressX + x, z, 1.17) || collided;
      }
    }
    if (collided) this.constrainToLane(body);
    body.x = clamp(body.x, -this.arenaHalfX - 14, this.arenaHalfX + 8);
    body.z = clamp(body.z, -this.arenaHalfZ + 3, this.arenaHalfZ - 3);
    if (this.svgGrid) {
      // Anti-terowongan: knockback cepat bisa melompati tembok tipis dalam
      // satu frame. Segmen dari posisi aman frame lalu ke posisi sekarang
      // tidak boleh memotong sel tembok mana pun.
      const sx = body.safeX ?? body.x;
      const sz = body.safeZ ?? body.z;
      if (segmentHitsWall(this.svgGrid, sx, sz, body.x, body.z)) {
        body.x = sx;
        body.z = sz;
        body.vx *= 0.15;
        body.vz *= 0.15;
        this.constrainToLane(body);
      } else if (!gridIsWall(this.svgGrid, body.x, body.z)) {
        body.safeX = body.x;
        body.safeZ = body.z;
      }
    }
  }

  private spawnOrc() {
    const lane = Math.floor(this.spawned / 6) % ENTRY_ORDER.length;
    const armored = this.spawned > 12 && this.spawned % 12 === 0;

    // 10x Super Hulk:
    // Strictly 1 Super Hulk per wave as requested ("yg hulk ukuran 10 x tu 1 aja jangan banyak")
    // Appears at orc #35 in the wave (or #28 in wave 1) as the single climactic boss!
    const isSuperHulk = !this.superHulkSpawnedThisWave && this.spawned >= (this.wave === 1 ? 28 : 35);
    if (isSuperHulk) {
      this.superHulkSpawnedThisWave = true;
    }

    // 3x Hulk Boss:
    // Wave 1: Spawns at orc #14 and #56
    // Later waves: Spawns periodically (every 45 orcs)
    const isHulk = !isSuperHulk && ((this.wave === 1 && (this.spawned === 14 || this.spawned === 56)) || (this.spawned > 12 && this.spawned % 45 === 0));

    const hp = isSuperHulk
      ? Math.round(SUPER_HULK_CONFIG.hp * (1 + (this.wave - 1) * 0.12))
      : isHulk
        ? Math.round(HULK_CONFIG.hp * (1 + (this.wave - 1) * 0.10))
        : (31 + (this.wave - 1) * 14) * (armored ? 2.2 : 1);

    const speed = isSuperHulk
      ? SUPER_HULK_CONFIG.speed
      : isHulk
        ? HULK_CONFIG.speed
        : (5.2 + Math.min(2.5, (this.wave - 1) * 0.24)) * (0.85 + Math.random() * 0.28) * (armored ? 0.78 : 1);

    const scale = isSuperHulk
      ? SUPER_HULK_CONFIG.scale
      : isHulk
        ? HULK_CONFIG.scale
        : armored
          ? 1.18
          : 0.85 + Math.random() * 0.2;

    const enemy: Enemy = {
      id: this.nextEnemyId++,
      lane,
      x: this.paths[lane][0].x,
      z: this.paths[lane][0].z,
      vx: 0,
      vz: 0,
      stagger: 0,
      hitFlash: 0,
      hitTheme: "gunner",
      lostParts: 0,
      shockTime: 0,
      shockSparkTimer: 0,
      distance: 0,
      offset: isSuperHulk ? 0 : (Math.random() - 0.5) * 4.3,
      speed,
      hp,
      maxHp: hp,
      alive: true,
      armored: isSuperHulk || isHulk || armored,
      variant: isSuperHulk ? 0 : Math.floor(Math.random() * 4),
      wobble: Math.random() * Math.PI * 2,
      scale,
      angle: 0,
      baseOffset: 0,
      raider: isSuperHulk || isHulk || this.spawned % 15 === 0 || (armored && this.spawned % 24 === 0),
      attackTimer: 0.45 + Math.random() * 0.5,
      attackPulse: 0,
      lift: 0,
      liftV: 0,
      tumble: 0,
      tumbleV: 0,
      isHulk,
      isSuperHulk,
    };
    enemy.baseOffset = enemy.offset;
    this.samplePath(enemy, true);
    this.enemies.push(enemy);
    this.spawned++;

    if (isSuperHulk) {
      this.onToast("⚠️ PERINGATAN: 10X SUPER HULK MEMASUKI JALUR " + this.lanes[lane].label + "!");
      this.cameraShake = Math.min(2.2, this.cameraShake + 0.9);
      this.playSound("start", enemy.x);
    } else if (isHulk) {
      this.onToast("⚠️ HULK BOSS (3X) MENDEKATI JALUR " + this.lanes[lane].label + "!");
      this.cameraShake = Math.min(1.4, this.cameraShake + 0.35);
    }
  }

  public spawnBoss(type: "hulk" | "superHulk", laneIndex?: number) {
    const isSuper = type === "superHulk";
    if (isSuper) {
      const existing = this.enemies.find((e) => e.alive && e.isSuperHulk);
      if (existing) {
        this.onToast("⚠️ 1 Super Hulk (10x) sudah ada di arena!");
        return;
      }
      this.superHulkSpawnedThisWave = true;
    }
    const lane = laneIndex !== undefined ? laneIndex % ENTRY_ORDER.length : Math.floor(Math.random() * ENTRY_ORDER.length);
    const hp = isSuper
      ? Math.round(SUPER_HULK_CONFIG.hp * (1 + (this.wave - 1) * 0.12))
      : Math.round(HULK_CONFIG.hp * (1 + (this.wave - 1) * 0.10));
    const speed = isSuper ? SUPER_HULK_CONFIG.speed : HULK_CONFIG.speed;
    const scale = isSuper ? SUPER_HULK_CONFIG.scale : HULK_CONFIG.scale;

    const enemy: Enemy = {
      id: this.nextEnemyId++,
      lane,
      x: this.paths[lane][0].x,
      z: this.paths[lane][0].z,
      vx: 0,
      vz: 0,
      stagger: 0,
      hitFlash: 0,
      hitTheme: "gunner",
      lostParts: 0,
      shockTime: 0,
      shockSparkTimer: 0,
      distance: 0,
      offset: 0,
      speed,
      hp,
      maxHp: hp,
      alive: true,
      armored: true,
      variant: 0,
      wobble: 0,
      scale,
      angle: 0,
      baseOffset: 0,
      raider: true,
      attackTimer: 0.5,
      attackPulse: 0,
      lift: 0,
      liftV: 0,
      tumble: 0,
      tumbleV: 0,
      isHulk: !isSuper,
      isSuperHulk: isSuper,
    };
    this.samplePath(enemy, true);
    this.enemies.push(enemy);
    this.spawned++;

    if (isSuper) {
      this.onToast("⚠️ 10X SUPER HULK BERHASIL DIMUNCULKAN DI JALUR " + this.lanes[lane].label + "!");
      this.cameraShake = Math.min(2.4, this.cameraShake + 1.1);
      this.playSound("start", enemy.x);
    } else {
      this.onToast("⚠️ HULK BOSS (3X) BERHASIL DIMUNCULKAN DI JALUR " + this.lanes[lane].label + "!");
      this.cameraShake = Math.min(1.4, this.cameraShake + 0.4);
    }
  }

  private updateEnemies(dt: number) {
    this.spawnAccumulator += dt * Math.sqrt(this.director.orcSpeed);
    const interval = Math.max(0.006, 0.026 - (this.wave - 1) * 0.0023) / Math.sqrt(this.director.hordeMultiplier);
    while (this.spawnAccumulator >= interval && this.spawned < this.total && this.enemies.length < MAX_ORCS) {
      this.spawnAccumulator -= interval;
      this.spawnOrc();
    }
    if (this.enemies.length >= MAX_ORCS) this.spawnAccumulator = Math.min(this.spawnAccumulator, 0.12);

    const dragStunned = Math.exp(-dt * 2.65);
    const dragWalking = Math.exp(-dt * 5.2);
    const steerStunned = 1 - Math.exp(-dt * 0.28);
    const steerWalking = 1 - Math.exp(-dt * 3.8);
    let shockSparks = 0;

    for (const tower of this.towers) tower.hitTimer = Math.max(0, tower.hitTimer - dt);

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.stagger = Math.max(0, enemy.stagger - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.shockTime = Math.max(0, enemy.shockTime - dt);
      if (enemy.shockTime > 0) {
        enemy.shockSparkTimer -= dt;
        if (enemy.shockSparkTimer <= 0 && shockSparks < 10) {
          enemy.shockSparkTimer = 0.085 + Math.random() * 0.11;
          this.shotBurst(enemy.x, 0.7 + enemy.lift, enemy.z, 2, 3, 3.6);
          shockSparks++;
        }
      }
      enemy.attackPulse = Math.max(0, enemy.attackPulse - dt);
      enemy.lift += enemy.liftV * dt;
      enemy.liftV -= 21 * dt;
      if (enemy.lift <= 0) {
        enemy.lift = 0;
        enemy.liftV = enemy.liftV < -2.5 ? -enemy.liftV * 0.16 : 0;
      }
      enemy.tumble += enemy.tumbleV * dt;
      enemy.tumbleV *= Math.exp(-dt * 5);
      enemy.tumble = clamp(enemy.tumble * Math.exp(-dt * (enemy.stagger > 0 ? 0.5 : 5.8)), -0.68, 0.68);
      enemy.attackTimer -= dt * this.director.orcSpeed * (enemy.shockTime > 0 ? 0.25 : 1);
      let raidTower: Tower | null = null;
      let raidDistance = 6.25 * 6.25;
      if (enemy.raider && enemy.stagger < 0.2) {
        for (const tower of this.towers) {
          const squared = (tower.x - enemy.x) ** 2 + (tower.z - enemy.z) ** 2;
          if (squared < raidDistance) {
            raidTower = tower;
            raidDistance = squared;
          }
        }
        if (raidTower) {
          const progress = clamp(Math.floor(enemy.distance / this.pathLengths[enemy.lane] * PATH_STEPS), 0, PATH_STEPS);
          const road = this.paths[enemy.lane][progress];
          const side = (raidTower.x - road.x) * road.nx + (raidTower.z - road.z) * road.nz;
          enemy.offset += ((side >= 0 ? 2.28 : -2.28) - enemy.offset) * Math.min(1, dt * 4.5);
        } else {
          enemy.offset += (enemy.baseOffset - enemy.offset) * Math.min(1, dt * 2);
        }
      }
      const atTower = raidTower && raidDistance < 3.4 * 3.4;
      enemy.distance += enemy.speed * this.director.orcSpeed * dt * (enemy.stagger > 0 ? 0.06 : enemy.shockTime > 0 ? 0.22 : atTower ? 0.27 : 1);
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;
      enemy.vx *= enemy.stagger > 0 ? dragStunned : dragWalking;
      enemy.vz *= enemy.stagger > 0 ? dragStunned : dragWalking;
      this.samplePath(enemy, false, enemy.stagger > 0 ? steerStunned : steerWalking);
      this.constrainToTerrain(enemy);
      if (enemy.stagger > 0.13 && enemy.vx * enemy.vx + enemy.vz * enemy.vz > 7) {
        enemy.angle = Math.atan2(enemy.vz, enemy.vx);
      }
      if (raidTower && (raidTower.x - enemy.x) ** 2 + (raidTower.z - enemy.z) ** 2 < 3.4 * 3.4 && enemy.stagger < 0.17 && enemy.shockTime < 0.1) {
        enemy.angle = Math.atan2(raidTower.z - enemy.z, raidTower.x - enemy.x);
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = (enemy.armored ? 0.94 : 1.35) + Math.random() * 0.38;
          enemy.attackPulse = 0.22;
          this.damageTower(raidTower, enemy.armored ? 6 : 4, enemy);
        }
      }
      const breachX = enemy.isSuperHulk ? this.arenaHalfX - 9 : this.arenaHalfX - 6;
      if (enemy.distance >= this.pathLengths[enemy.lane] - 14 && enemy.x >= breachX) {
        enemy.alive = false;
        this.escaped++;
        const breachDamage = enemy.isSuperHulk ? 10 : enemy.isHulk ? 4 : enemy.armored ? 2 : 1;
        this.baseHp = Math.max(0, this.baseHp - breachDamage);
        this.createExplosion(enemy.x, enemy.z, enemy.isSuperHulk ? 4.8 : 1.6, 0xe36c55);
        if (enemy.isSuperHulk) this.cameraShake = Math.min(2.5, this.cameraShake + 1.5);
        if (this.baseHp <= 0) {
          this.endBattle(false);
          break;
        }
      }

      if (enemy.isSuperHulk || enemy.isHulk) {
        const attackReach = enemy.isSuperHulk ? 8.2 : 3.8;
        for (const unit of this.marineUnits) {
          if (unit.hp <= 0) continue;
          const distSq = (unit.x - enemy.x) ** 2 + (unit.z - enemy.z) ** 2;
          if (distSq < attackReach * attackReach) {
            enemy.angle = Math.atan2(unit.z - enemy.z, unit.x - enemy.x);
            if (enemy.attackTimer <= 0) {
              enemy.attackTimer = enemy.isSuperHulk ? 1.55 : 1.15;
              enemy.attackPulse = 0.32;

              const dx = unit.x - enemy.x;
              const dz = unit.z - enemy.z;
              const dist = Math.hypot(dx, dz) || 1;
              const nx = dx / dist;
              const nz = dz / dist;

              const knockSpeed = enemy.isSuperHulk ? 38.0 : 22.0;
              const liftSpeed = enemy.isSuperHulk ? 14.5 : 9.5;
              const damage = enemy.isSuperHulk ? SUPER_HULK_CONFIG.damage : HULK_CONFIG.damage;

              // Marine gets launched flying through the air like getting hit by Hulk ("kek kena gebuk hulk marine nya mental")
              unit.vx = nx * knockSpeed;
              unit.vz = nz * knockSpeed;
              unit.lift = 0.2;
              unit.liftV = liftSpeed;
              unit.tumble = 0.2;
              unit.tumbleV = (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 8);
              unit.smoking = 2.8; // keluar asap terus-menerus!
              unit.isBlownUp = false;

              unit.hp = Math.max(0, unit.hp - damage);
              unit.hurtTimer = 1.0;
              unit.hitTime = 0.6;
              unit.impactPulse = 1.0;

              this.playSound(enemy.isSuperHulk ? "explosion" : "marineFall", unit.x);
              this.shotBurst(unit.x, 1.2, unit.z, enemy.isSuperHulk ? 25 : 15, 0, 10.0);
              this.emitSmoke(unit.x, 1.0, unit.z, enemy.isSuperHulk ? 16 : 9, 1.5);
              this.cameraShake = Math.min(2.5, this.cameraShake + (enemy.isSuperHulk ? 1.4 : 0.65));

              if (unit.hp <= 0) {
                // Marine dies, smokes and explodes! ("rusak dan mati dan keluar asap lalu meledak")
                unit.respawn = 9.0;
                unit.action = "idle";
                unit.walkAmount = 0;
                this.emitSmoke(unit.x, 1.2, unit.z, 26, 2.0);
                this.createExplosion(unit.x, unit.z, enemy.isSuperHulk ? 2.8 : 1.8, 0xff5522, true, 0.52);
                this.shotBurst(unit.x, 1.0, unit.z, 26, 1, 11.0);
                this.addSplat(unit.x, unit.z, 1.2);
                this.playSound("explosion", unit.x);
              }
            }
          }
        }
      }
    }
    this.updateCorpses(dt);
    this.collisionAccumulator += dt;
    if (this.collisionAccumulator >= (this.speed === 2 ? 0.064 : 0.031)) {
      this.collisionAccumulator = 0;
      this.resolveOrcCollisions();
    }
    this.ragdolls.update(dt);
  }

  private updateCorpses(dt: number) {
    for (let index = this.corpses.length - 1; index >= 0; index--) {
      const corpse = this.corpses[index];
      corpse.age += dt;
      const pathIndex = clamp(Math.floor(corpse.distance / this.pathLengths[corpse.lane] * PATH_STEPS), 0, PATH_STEPS - 1);
      const from = this.paths[corpse.lane][pathIndex];
      const to = this.paths[corpse.lane][pathIndex + 1];
      const along = (corpse.vx * (to.x - from.x) + corpse.vz * (to.z - from.z)) / (Math.hypot(to.x - from.x, to.z - from.z) || 1);
      corpse.distance = clamp(corpse.distance + along * dt, 0, this.pathLengths[corpse.lane]);
      corpse.x += corpse.vx * dt;
      corpse.z += corpse.vz * dt;
      corpse.y += corpse.vy * dt;
      corpse.vy -= 21 * dt;
      const drag = Math.exp(-dt * 1.65);
      corpse.vx *= drag;
      corpse.vz *= drag;
      this.constrainToTerrain(corpse);
      corpse.spin += dt * Math.min(12, Math.hypot(corpse.vx, corpse.vz) * 0.7 + 3);
      if (corpse.y <= 0) {
        corpse.y = 0;
        if (!corpse.landed) {
          corpse.landed = true;
          this.addSplat(corpse.x, corpse.z, 0.65 + Math.random() * 0.55);
          this.emitBlood(corpse.x, corpse.z, corpse.vx * 0.25, corpse.vz * 0.25, 3);
          if (Math.hypot(corpse.vx, corpse.vz) > 3.6) {
            this.playSound("collision", corpse.x);
            this.shotBurst(corpse.x, 0.18, corpse.z, 3, 5, 2.6);
          }
        }
        corpse.vy = Math.abs(corpse.vy) > 2 ? Math.abs(corpse.vy) * 0.28 : 0;
      }
      if (corpse.age > 1.8 || Math.abs(corpse.x) > this.arenaHalfX || Math.abs(corpse.z) > this.arenaHalfZ) {
        this.corpses.splice(index, 1);
      }
    }
  }

  private resolveOrcCollisions() {
    // Spatial buckets keep knockback chains close to linear even in a multi-thousand orc horde.
    for (const bucket of this.collisionCells.values()) bucket.length = 0;
    const bodies: (Enemy | Corpse)[] = [];
    const add = (body: Enemy | Corpse) => {
      const cx = Math.floor(body.x / 1.3);
      const cz = Math.floor(body.z / 1.3);
      const key = cx * 1024 + cz;
      let bucket = this.collisionCells.get(key);
      if (!bucket) {
        bucket = [];
        this.collisionCells.set(key, bucket);
      }
      bucket.push(body);
      bodies.push(body);
    };
    for (const enemy of this.enemies) if (enemy.alive) add(enemy);
    for (const corpse of this.corpses) if (corpse.age < 0.9) add(corpse);

    const queue: (Enemy | Corpse)[] = [];
    const queued = new Set<number>();
    for (const body of bodies) {
      if (body.vx * body.vx + body.vz * body.vz > 7) {
        queue.push(body);
        queued.add(body.id);
      }
    }

    for (let cursor = 0; cursor < queue.length && cursor < 1800; cursor++) {
      const moving = queue[cursor];
      if ("hp" in moving && !moving.alive) continue;
      const cx = Math.floor(moving.x / 1.3);
      const cz = Math.floor(moving.z / 1.3);
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          const bucket = this.collisionCells.get((cx + ix) * 1024 + cz + iz);
          if (!bucket) continue;
          for (const other of bucket) {
            if (other.id === moving.id || ("hp" in other && !other.alive)) continue;
            const dx = other.x - moving.x;
            const dz = other.z - moving.z;
            const distanceSquared = dx * dx + dz * dz;
            const radius = (moving.scale + other.scale) * 0.48;
            if (distanceSquared > radius * radius) continue;
            const distance = Math.max(0.001, Math.sqrt(distanceSquared));
            const nx = distance < 0.04 ? (moving.id % 2 ? 1 : -1) : dx / distance;
            const nz = distance < 0.04 ? (moving.id % 2 ? -1 : 1) : dz / distance;
            const approach = (moving.vx - other.vx) * nx + (moving.vz - other.vz) * nz;
            if (approach < 1.7) continue;

            const impulse = Math.min(17, approach * 0.79 * (moving.scale / other.scale));
            other.vx = clamp(other.vx + nx * impulse, -21, 21);
            other.vz = clamp(other.vz + nz * impulse, -21, 21);
            moving.vx -= nx * impulse * 0.34;
            moving.vz -= nz * impulse * 0.34;
            other.stagger = Math.max(other.stagger, Math.min(0.78, 0.18 + impulse * 0.034));
            if ("hp" in other) {
              other.liftV = Math.max(other.liftV, Math.min(6.5, impulse * 0.3));
              other.tumbleV += (other.id % 2 ? 1 : -1) * Math.min(7, impulse * 0.38);
            }
            const separation = Math.min(0.21, (radius - distance) * 0.5);
            other.x += nx * separation;
            other.z += nz * separation;
            moving.x -= nx * separation;
            moving.z -= nz * separation;

            if (approach > 4.8) {
              if ("hp" in other) this.damageEnemy(other, Math.min(17, approach * 1.1), moving.x, moving.z, 0, false, "collision");
              this.playSound("collision", other.x);
              this.chainCombo = Math.min(99, this.chainCombo + 1);
              this.chainTimer = 2.1;
              if (this.chainCombo % 8 === 0) this.scrap += 5;
            }
            if (!queued.has(other.id) && other.vx * other.vx + other.vz * other.vz > 7) {
              queue.push(other);
              queued.add(other.id);
            }
          }
        }
      }
    }
    for (const body of queue) {
      if ("hp" in body && !body.alive) continue;
      this.constrainToTerrain(body);
    }
  }

  private findTarget(tower: Tower) {
    const range = TOWERS[tower.type].range + (tower.level - 1) * 0.8;
    const rangeSquared = range * range;
    let target: Enemy | null = null;
    let furthest = -1;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - tower.x;
      const dz = enemy.z - tower.z;
      const progress = enemy.distance / this.pathLengths[enemy.lane];
      if (dx * dx + dz * dz <= rangeSquared && progress > furthest && this.hasLineOfSight(tower, enemy)) {
        target = enemy;
        furthest = progress;
      }
    }
    return target;
  }

  private hasLineOfSight(tower: Tower, enemy: Enemy) {
    if (tower.type === "mortar" || tower.type === "tesla" || tower.type === "rocket") return true;
    const dx = enemy.x - tower.x;
    const dz = enemy.z - tower.z;
    const along = clamp(-(tower.x * dx + tower.z * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const closestX = tower.x + dx * along;
    const closestZ = tower.z + dz * along;
    return closestX * closestX + closestZ * closestZ > 3.65 ** 2;
  }

  private updateTowers(dt: number) {
    for (const tower of this.towers) {
      if (tower.type === "barracks") continue;
      tower.recoil = Math.max(0, tower.recoil - dt * 9);
      tower.head.position.x = -tower.recoil * 0.23;

      const target = this.findTarget(tower);

      // Rocket Battery: targeting laser, scanning radar, and pod recoil recovery
      if (tower.type === "rocket") {
        if (tower.leftPod) tower.leftPod.position.x = THREE.MathUtils.lerp(tower.leftPod.position.x, 0.14, dt * 10);
        if (tower.rightPod) tower.rightPod.position.x = THREE.MathUtils.lerp(tower.rightPod.position.x, 0.14, dt * 10);

        if (target && this.phase === "battle") {
          tower.head.rotation.y = -Math.atan2(target.z - tower.z, target.x - tower.x);
          if (tower.radarDish) tower.radarDish.rotation.y = 0;
          if (tower.targetLaser && tower.laserDot) {
            const laserPositions = (tower.targetLaser.geometry.attributes.position as THREE.BufferAttribute);
            laserPositions.setXYZ(0, tower.x, 1.85, tower.z);
            laserPositions.setXYZ(1, target.x, target.lift + 0.85, target.z);
            laserPositions.needsUpdate = true;
            tower.targetLaser.visible = true;
            tower.laserDot.position.set(target.x, target.lift + 0.1, target.z);
            tower.laserDot.scale.setScalar(1 + Math.sin(this.elapsed * 26) * 0.22);
            tower.laserDot.visible = true;
          }
        } else {
          if (tower.targetLaser) tower.targetLaser.visible = false;
          if (tower.laserDot) tower.laserDot.visible = false;
          if (tower.radarDish) tower.radarDish.rotation.y = this.elapsed * 2.8;
        }

        // Process staggered salvo launches
        if (tower.salvoQueue && tower.salvoQueue.length > 0) {
          for (const item of tower.salvoQueue) {
            item.delay -= dt;
          }
          while (tower.salvoQueue.length > 0 && tower.salvoQueue[0].delay <= 0) {
            const item = tower.salvoQueue.shift()!;
            const currentTarget = this.enemies.find((e) => e.id === item.targetId && e.alive) || target;
            if (currentTarget) {
              const heading = -tower.head.rotation.y;
              const curDx = Math.cos(heading);
              const curDz = Math.sin(heading);
              const podOffset = item.side * 0.58;
              const launchPos = new THREE.Vector3(
                tower.x + curDx * 1.05 - curDz * podOffset,
                1.78,
                tower.z + curDz * 1.05 + curDx * podOffset,
              );
              const backblastPos = new THREE.Vector3(
                tower.x - curDx * 0.62 - curDz * podOffset,
                1.78,
                tower.z - curDz * 0.62 + curDx * podOffset,
              );

              if (item.side === -1 && tower.leftPod) tower.leftPod.position.x = -0.22;
              if (item.side === 1 && tower.rightPod) tower.rightPod.position.x = -0.22;

              const cosS = Math.cos(item.spreadAngle);
              const sinS = Math.sin(item.spreadAngle);
              const spreadDx = curDx * cosS - curDz * sinS;
              const spreadDz = curDz * cosS + curDx * sinS;

              this.fireHomingRocket(launchPos, spreadDx, spreadDz, currentTarget, item.damage, item.radius);

              this.createMuzzleFlash(launchPos, 0xff7722, 0.95);
              this.shotBurst(launchPos.x, launchPos.y, launchPos.z, 8, 1, 5.2);
              this.shotBurst(backblastPos.x, backblastPos.y, backblastPos.z, 10, 5, 5.8);
              this.shotBurst(backblastPos.x, backblastPos.y, backblastPos.z, 6, 1, 7.2);
              this.cameraShake = Math.min(1.2, this.cameraShake + 0.06);
              this.playSound("rocket", tower.x);
            }
          }
        }
      }

      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      if (!target) continue;

      const config = TOWERS[tower.type];
      const rate = config.rate * (1 + this.progress.upgrades.overclock * 0.13) * (1 + (tower.level - 1) * 0.15);
      tower.cooldown = 1 / rate;
      tower.head.rotation.y = -Math.atan2(target.z - tower.z, target.x - tower.x);
      let damage = config.damage * (1 + (tower.level - 1) * 0.38);
      if (tower.type === "gunner") damage *= 1 + this.progress.upgrades.ballistics * 0.18;
      const directionX = target.x - tower.x;
      const directionZ = target.z - tower.z;
      const distance = Math.hypot(directionX, directionZ) || 1;
      const dx = directionX / distance;
      const dz = directionZ / distance;
      const start = tower.type === "tesla"
        ? new THREE.Vector3(tower.x, 2.8, tower.z)
        : new THREE.Vector3(tower.x + dx * (tower.type === "mortar" ? 0.65 : 1.4), tower.type === "mortar" ? 2.1 : 1.6, tower.z + dz * (tower.type === "mortar" ? 0.65 : 1.4));
      const end = new THREE.Vector3(target.x, 1.0 + target.lift, target.z);

      if (tower.type === "gunner") {
        tower.barrelSide *= -1;
        start.x += -dz * tower.barrelSide * 0.22;
        start.z += dx * tower.barrelSide * 0.22;
        this.fireRifleShot(tower.x, tower.z, start, target, damage);
        this.addShotParticle({
          x: tower.x + dx * 0.5, y: 1.54, z: tower.z + dz * 0.5,
          vx: -dx * 1.5 + dz * tower.barrelSide * 5.5,
          vy: 3 + Math.random() * 2,
          vz: -dz * 1.5 - dx * tower.barrelSide * 5.5,
          age: 0, life: 0.36, size: 0.6, gravity: 18, drag: 1.9, color: 6, kind: "shell",
        });
        tower.recoil = 1;
        this.playSound("gunner", tower.x);
      } else if (tower.type === "flame") {
        this.damageFlameCone(tower, start, end, damage);
        this.flames.emit(start, end);
        this.shotBurst(start.x, start.y, start.z, 2, 0, 2.7);
        tower.recoil = 0.27;
        this.playSound("flame", tower.x);
      } else if (tower.type === "mortar") {
        const shell = new THREE.Mesh(this.shellGeometry, this.shellMaterial);
        shell.position.copy(start);
        this.scene.add(shell);
        this.projectiles.push({
          mesh: shell,
          start,
          end: new THREE.Vector3(target.x, 0.3, target.z),
          age: 0,
          duration: 0.68,
          damage,
          radius: 3.5 * (1 + this.progress.upgrades.blast * 0.2),
          trailTimer: 0,
        });
        tower.recoil = 0.95;
        this.createMuzzleFlash(start, 0xffc884, 0.75);
        this.playSound("mortar", tower.x);
      } else if (tower.type === "tesla") {
        this.shockEnemy(target);
        this.damageEnemy(target, damage, tower.x, tower.z, 9.5, true, "tesla");
        this.createLightning(start, end, true);
        let previous = target;
        const chained = new Set<number>([target.id]);
        const maxTargets = Math.min(10, 4 + this.progress.upgrades.arc * 2);
        for (let link = 1; link < maxTargets; link++) {
          const next = this.findTeslaTarget(previous, chained);
          if (!next) break;
          this.createLightning(
            new THREE.Vector3(previous.x, previous.lift + 1.1, previous.z),
            new THREE.Vector3(next.x, next.lift + 1.1, next.z),
            link % 3 === 0,
          );
          this.shockEnemy(next);
          this.damageEnemy(next, damage * Math.max(0.53, 0.82 - link * 0.035), previous.x, previous.z, 7.5, true, "tesla");
          chained.add(next.id);
          previous = next;
        }
        this.playSound("tesla", tower.x);
      } else if (tower.type === "rocket") {
        const salvo = tower.level >= 3 ? 3 : tower.level >= 2 ? 2 : 1;
        const blastRadius = 3.6 * (1 + this.progress.upgrades.blast * 0.18);
        tower.salvoQueue = [];
        for (let s = 0; s < salvo; s++) {
          const side = (s % 2 === 0 ? 1 : -1);
          const spreadAngle = (s - (salvo - 1) / 2) * 0.22;
          tower.salvoQueue.push({
            delay: s * 0.09,
            side,
            spreadAngle,
            targetId: target.id,
            damage,
            radius: blastRadius,
          });
        }
        tower.recoil = 1.0;
      } else {
        this.damageLaserLine(tower, start, end, target, damage);
        this.createLaserPulse(start, end);
        tower.recoil = 0.7;
        this.playSound("laser", tower.x);
      }
    }
  }

  private createRocketModel(): { group: THREE.Group; flare: THREE.Mesh } {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2e352b, flatShading: true });
    const warheadMat = new THREE.MeshLambertMaterial({ color: 0xe63920, emissive: new THREE.Color(0x881500), flatShading: true });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffbb00 });
    const finMat = new THREE.MeshLambertMaterial({ color: 0x565e52, flatShading: true });
    const nozzleMat = new THREE.MeshBasicMaterial({ color: 0xff8811 });
    const flareMat = new THREE.MeshBasicMaterial({ color: 0xfff4bb, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });

    // Rocket body aligned along positive X
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.098, 0.84, 8), bodyMat);
    body.rotation.z = -Math.PI / 2;
    group.add(body);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.12, 8), stripeMat);
    stripe.rotation.z = -Math.PI / 2;
    stripe.position.x = 0.26;
    group.add(stripe);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.108, 0.42, 8), warheadMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.58;
    group.add(nose);

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.082, 0.12, 8), nozzleMat);
    nozzle.rotation.z = -Math.PI / 2;
    nozzle.position.x = -0.46;
    group.add(nozzle);

    const flare = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.58, 6), flareMat);
    flare.rotation.z = Math.PI / 2;
    flare.position.x = -0.74;
    group.add(flare);

    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.19, 0.022), finMat);
      fin.position.set(-0.32, Math.cos(angle) * 0.13, Math.sin(angle) * 0.13);
      fin.rotation.x = angle;
      group.add(fin);

      const canard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.095, 0.018), finMat);
      canard.position.set(0.24, Math.cos(angle) * 0.11, Math.sin(angle) * 0.11);
      canard.rotation.x = angle;
      group.add(canard);
    }

    return { group, flare };
  }

  private fireHomingRocket(start: THREE.Vector3, dirX: number, dirZ: number, target: Enemy, damage: number, radius: number) {
    const { group: mesh, flare: flareMesh } = this.createRocketModel();
    mesh.position.copy(start);
    this.scene.add(mesh);

    const initialSpeed = 16;
    const initialVy = 4.8 + Math.random() * 2.4;
    this.homingRockets.push({
      mesh,
      flareMesh,
      x: start.x,
      y: start.y,
      z: start.z,
      vx: dirX * initialSpeed,
      vy: initialVy,
      vz: dirZ * initialSpeed,
      targetId: target.id,
      targetX: target.x,
      targetZ: target.z,
      damage,
      radius,
      age: 0,
      life: 3.5,
      speed: initialSpeed,
      turnSpeed: 15,
      trailTimer: 0,
      spiralPhase: Math.random() * Math.PI * 2,
      spiralRadius: 0.18,
      climbBoost: 0.32,
    });

    this.createMuzzleFlash(start, 0xff7733, 0.72);
    this.shotBurst(start.x, start.y, start.z, 6, 1, 5.0);
  }

  private findTeslaTarget(previous: Enemy, visited: Set<number>): Enemy | null {
    const cx = Math.floor(previous.x / 1.3);
    const cz = Math.floor(previous.z / 1.3);
    let best: Enemy | null = null;
    let nearest = 6.3 ** 2;
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        const bucket = this.collisionCells.get((cx + dx) * 1024 + cz + dz);
        if (!bucket) continue;
        for (const body of bucket) {
          if (!("hp" in body) || !body.alive || visited.has(body.id)) continue;
          const distance = (body.x - previous.x) ** 2 + (body.z - previous.z) ** 2;
          if (distance < nearest) {
            nearest = distance;
            best = body;
          }
        }
      }
    }
    return best;
  }

  private shockEnemy(enemy: Enemy) {
    enemy.shockTime = Math.max(enemy.shockTime, 0.68);
    enemy.shockSparkTimer = 0;
    enemy.hitTheme = "tesla";
    enemy.hitFlash = 0.22;
  }

  private fireRifleShot(sourceX: number, sourceZ: number, muzzle: THREE.Vector3, target: Enemy, damage: number, theme: "gunner" | "barracks" = "gunner") {
    const roll = Math.random();
    let part: "head" | "leftArm" | "rightArm" | "torso" = roll < 0.2
      ? "head" : roll < 0.32 ? "leftArm" : roll < 0.44 ? "rightArm" : "torso";
    if ((part === "leftArm" && target.lostParts & 2) || (part === "rightArm" && target.lostParts & 4) ||
      (part === "head" && target.lostParts & 1)) part = "torso";

    const relativeX = target.x - muzzle.x;
    const relativeZ = target.z - muzzle.z;
    const distance = Math.hypot(relativeX, relativeZ);
    const lead = Math.min(0.57, target.speed * this.director.orcSpeed * distance / 123 * 0.58);
    const side = part === "leftArm" ? -1 : part === "rightArm" ? 1 : 0;
    const aimX = target.x + Math.cos(target.angle) * lead - Math.sin(target.angle) * side * 0.42 * target.scale;
    const aimZ = target.z + Math.sin(target.angle) * lead + Math.cos(target.angle) * side * 0.42 * target.scale;
    const aimY = target.lift + (part === "head" ? 1.32 : side ? 0.82 : 0.75) * target.scale;
    const dx = aimX - muzzle.x;
    const dy = aimY - muzzle.y;
    const dz = aimZ - muzzle.z;
    const length = Math.max(0.01, Math.hypot(dx, dy, dz));
    const speed = 123;

    if (this.rifleShots.length >= MAX_RIFLE_SHOTS) this.rifleShots.shift();
    this.rifleShots.push({
      x: muzzle.x, y: muzzle.y, z: muzzle.z,
      vx: dx / length * speed,
      vy: dy / length * speed,
      vz: dz / length * speed,
      age: 0,
      life: Math.min(0.3, length / speed + 0.07),
      damage,
      sourceX,
      sourceZ,
      theme,
    });
    this.createMuzzleFlash(muzzle, 0xffe29a, 0.65);
    this.shotBurst(muzzle.x, muzzle.y, muzzle.z, 4, 0, 5.2);
  }

  private rifleHitPart(enemy: Enemy, x: number, y: number, z: number): "head" | "leftArm" | "rightArm" | "torso" | null {
    const s = enemy.scale;
    const height = y - enemy.lift;
    const dx = x - enemy.x;
    const dz = z - enemy.z;
    const centerDist = dx * dx + dz * dz;
    if (!(enemy.lostParts & 1) && height > s * 1.04 && height < s * 1.75 && centerDist < (s * 0.46) ** 2) {
      return "head";
    }
    if (height > s * 0.37 && height < s * 1.23) {
      const sideX = -Math.sin(enemy.angle) * 0.43 * s;
      const sideZ = Math.cos(enemy.angle) * 0.43 * s;
      if (!(enemy.lostParts & 2) && (dx + sideX) ** 2 + (dz + sideZ) ** 2 < (s * 0.33) ** 2) return "leftArm";
      if (!(enemy.lostParts & 4) && (dx - sideX) ** 2 + (dz - sideZ) ** 2 < (s * 0.33) ** 2) return "rightArm";
    }
    if (height > s * 0.15 && height < s * 1.35 && centerDist < (s * 0.49) ** 2) return "torso";
    return null;
  }

  private severPart(enemy: Enemy, part: "head" | "leftArm" | "rightArm", bullet: RifleShot) {
    const bit = part === "head" ? 1 : part === "leftArm" ? 2 : 4;
    if (enemy.lostParts & bit) return;
    enemy.lostParts |= bit;
    const side = part === "leftArm" ? -1 : part === "rightArm" ? 1 : 0;
    const x = enemy.x - Math.sin(enemy.angle) * side * 0.43 * enemy.scale;
    const z = enemy.z + Math.cos(enemy.angle) * side * 0.43 * enemy.scale;
    const y = enemy.lift + (part === "head" ? 1.32 : 0.82) * enemy.scale;
    this.fragments.spawn(part === "head" ? "head" : "arm", x, y, z,
      enemy.vx + bullet.vx * 0.14, enemy.vz + bullet.vz * 0.14, enemy.scale);
    this.emitBlood(x, z, enemy.vx, enemy.vz, part === "head" ? 12 : 8);
    this.shotBurst(x, y, z, 6, 6, 4.4);
  }

  private resolveRifleHit(shot: RifleShot, enemy: Enemy, part: "head" | "leftArm" | "rightArm" | "torso", x: number, y: number, z: number) {
    const multiplier = part === "head" ? 2.3 : part === "torso" ? 1 : 0.88;
    const damage = shot.damage * multiplier;
    if (part === "head" && enemy.hp <= damage) {
      this.severPart(enemy, part, shot);
    } else if (part === "leftArm" || part === "rightArm") {
      if (enemy.hp <= damage * 1.45 || Math.random() < 0.38) this.severPart(enemy, part, shot);
    }
    const kick = enemy.isSuperHulk ? 0.05 : enemy.isHulk ? 0.35 : (part === "head" ? 18.5 : part === "torso" ? 14.5 : 12.5);
    this.damageEnemy(enemy, damage, shot.sourceX, shot.sourceZ, kick, true, shot.theme);
    this.shotBurst(x, y, z, part === "head" ? 8 : 5, 0, part === "head" ? 7 : 5);
    if (part === "head") this.cameraShake = Math.min(0.46, this.cameraShake + 0.075);
  }

  private updateRifleShots(dt: number) {
    let visible = 0;
    for (let index = this.rifleShots.length - 1; index >= 0; index--) {
      const shot = this.rifleShots[index];
      const time = Math.min(dt, Math.max(0, shot.life - shot.age));
      const nextX = shot.x + shot.vx * time;
      const nextY = shot.y + shot.vy * time;
      const nextZ = shot.z + shot.vz * time;
      const distance = Math.hypot(nextX - shot.x, nextZ - shot.z);
      const steps = Math.max(1, Math.ceil(distance / 0.35));
      let hit = false;

      for (let step = 1; step <= steps && !hit; step++) {
        const t = step / steps;
        const x = shot.x + (nextX - shot.x) * t;
        const y = shot.y + (nextY - shot.y) * t;
        const z = shot.z + (nextZ - shot.z) * t;
        const cellX = Math.floor(x / 1.3);
        const cellZ = Math.floor(z / 1.3);
        for (let offsetX = -1; offsetX <= 1 && !hit; offsetX++) {
          for (let offsetZ = -1; offsetZ <= 1 && !hit; offsetZ++) {
            const bucket = this.collisionCells.get((cellX + offsetX) * 1024 + cellZ + offsetZ);
            if (!bucket) continue;
            for (const body of bucket) {
              if (!("hp" in body) || !body.alive || Math.abs(body.x - x) > 0.9 || Math.abs(body.z - z) > 0.9) continue;
              const part = this.rifleHitPart(body, x, y, z);
              if (!part) continue;
              this.resolveRifleHit(shot, body, part, x, y, z);
              hit = true;
              break;
            }
          }
        }
      }

      shot.age += dt;
      if (hit || shot.age >= shot.life || nextY < 0.1) {
        this.rifleShots.splice(index, 1);
        continue;
      }
      shot.x = nextX;
      shot.y = nextY;
      shot.z = nextZ;
      this.dummy.position.set(shot.x, shot.y, shot.z);
      this.shotDirection.set(shot.vx, shot.vy, shot.vz).normalize();
      this.dummy.quaternion.setFromUnitVectors(SHOT_UP, this.shotDirection);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.rifleMesh.setMatrixAt(visible++, this.dummy.matrix);
    }
    this.rifleMesh.count = visible;
    if (visible) this.rifleMesh.instanceMatrix.needsUpdate = true;
  }

  private damageFlameCone(tower: Tower, start: THREE.Vector3, end: THREE.Vector3, damage: number) {
    const distance = Math.hypot(end.x - start.x, end.z - start.z) || 1;
    const dx = (end.x - start.x) / distance;
    const dz = (end.z - start.z) / distance;
    const length = Math.min(TOWERS.flame.range - 1.1, distance + 1);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const offsetX = enemy.x - start.x;
      const offsetZ = enemy.z - start.z;
      const along = offsetX * dx + offsetZ * dz;
      if (along < -0.25 || along > length) continue;
      const spread = 0.48 + 1.48 * Math.max(0, along / length);
      if (Math.abs(offsetX * dz - offsetZ * dx) > spread) continue;
      this.damageEnemy(enemy, damage * (1 - Math.max(0, along / length) * 0.3), tower.x, tower.z, 4.8, true, "flame");
    }
  }

  private damageLaserLine(tower: Tower, start: THREE.Vector3, end: THREE.Vector3, target: Enemy, damage: number) {
    this.damageEnemy(target, damage, tower.x, tower.z, 14, true, "laser");
    const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
    const dx = (end.x - start.x) / length;
    const dz = (end.z - start.z) / length;
    let pierced = 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy === target) continue;
      const ex = enemy.x - start.x;
      const ez = enemy.z - start.z;
      const along = ex * dx + ez * dz;
      if (along < 0 || along > length + 1.15 || Math.abs(ex * dz - ez * dx) > 0.55) continue;
      this.damageEnemy(enemy, damage * 0.48, tower.x, tower.z, 7, true, "laser");
      pierced++;
      if (pierced >= 7) break;
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, originX = enemy.x - 1, originZ = enemy.z, force = 8, spray = true, theme: HitTheme = "missile", cleaved = false) {
    if (!enemy.alive) return;
    let dx = enemy.x - originX;
    let dz = enemy.z - originZ;
    const length = Math.hypot(dx, dz);
    if (length < 0.08) {
      dx = Math.cos(enemy.wobble);
      dz = Math.sin(enemy.wobble);
    } else {
      dx /= length;
      dz /= length;
    }
    const massFactor = enemy.isSuperHulk ? 180 : enemy.isHulk ? 45 : enemy.armored ? 1.65 : 1;
    const impulse = force / massFactor;
    enemy.vx = clamp(enemy.vx + dx * impulse, -22, 22);
    enemy.vz = clamp(enemy.vz + dz * impulse, -22, 22);
    if (!enemy.isSuperHulk && !enemy.isHulk) {
      enemy.stagger = Math.max(enemy.stagger, Math.min(0.74, 0.16 + impulse * 0.036));
      if (impulse > 0.5) {
        enemy.liftV = Math.max(enemy.liftV, Math.min(6.2, 1.2 + impulse * 0.26));
        enemy.tumbleV += (dx * 0.35 + dz * 0.6 + (Math.random() - 0.5) * 0.7) * Math.min(9, impulse * 0.8);
      }
    } else if (enemy.isHulk) {
      // Hulk does not fly backward when shot or slashed ("ga terlalu mental kalo ditembak dan dislash")
      enemy.stagger = Math.min(0.012, enemy.stagger + impulse * 0.0003);
      enemy.liftV = 0;
      enemy.tumbleV = 0;
    } else if (enemy.isSuperHulk) {
      // Super Hulk is a 10x colossus, completely immovable by gunfire/slashes
      enemy.stagger = 0;
      enemy.liftV = 0;
      enemy.tumbleV = 0;
    }
    enemy.hitTheme = theme;
    enemy.hitFlash = 0.22;
    enemy.hp -= amount;
    if (enemy.hp > 0) {
      this.hitFxCounter++;
      if (spray && this.hitFxCounter % (this.enemies.length > 2400 ? 6 : 3) === 0) {
        this.emitBlood(enemy.x, enemy.z, dx * impulse, dz * impulse, 3);
        this.addSplat(enemy.x, enemy.z, 0.22 + Math.random() * 0.17);
      }
      return;
    }

    if (enemy.isSuperHulk) {
      enemy.alive = false;
      this.waveKills++;
      this.kills++;
      this.cameraShake = Math.min(2.5, this.cameraShake + 1.8);
      this.createExplosion(enemy.x, enemy.z, 5.0, 0xff3814, true, 0.85);
      this.createExplosion(enemy.x, enemy.z, 7.5, 0xff8822, false, 0.65);
      this.shotBurst(enemy.x, 3.5, enemy.z, 40, 1, 16.0);
      this.emitSmoke(enemy.x, 2.5, enemy.z, 30, 2.5);
      this.addSplat(enemy.x, enemy.z, 2.8);
      this.progress.crystals += 30;
      this.waveCrystals += 30;
      this.scrap += 500;
      this.onToast("💥 10X SUPER HULK TUMBANG! (+30 Crystals, +500 Coins)");
      this.playSound("nuke", enemy.x);
      return;
    }
    if (enemy.isHulk) {
      enemy.alive = false;
      this.waveKills++;
      this.kills++;
      this.cameraShake = Math.min(1.8, this.cameraShake + 0.8);
      this.createExplosion(enemy.x, enemy.z, 3.0, 0xff5522, true, 0.6);
      this.shotBurst(enemy.x, 1.8, enemy.z, 22, 1, 11.0);
      this.emitSmoke(enemy.x, 1.5, enemy.z, 18, 1.8);
      this.addSplat(enemy.x, enemy.z, 1.7);
      this.progress.crystals += 8;
      this.waveCrystals += 8;
      this.scrap += 120;
      this.onToast("⚔️ HULK BOSS BERHASIL DIKALAHKAN! (+8 Crystals, +120 Coins)");
      this.playSound("explosion", enemy.x);
      return;
    }

    enemy.alive = false;
    this.waveKills++;
    this.kills++;
    this.scrap += enemy.armored ? 8 : 3;
    if (this.kills % 5 === 0) {
      this.progress.crystals++;
      this.waveCrystals++;
      if (this.elapsed - this.lastSavedElapsed > 3) this.saveProgress();
    }
    this.addSplat(enemy.x, enemy.z, enemy.armored ? 0.9 : 0.55 + Math.random() * 0.3);
    this.emitBlood(enemy.x, enemy.z, enemy.vx, enemy.vz, this.enemies.length > 2700 ? 5 : 9);
    if (this.shotParticles.length < MAX_SHOT_PARTICLES - 8) {
      this.shotBurst(enemy.x, 0.9 + enemy.lift, enemy.z, 4, HIT_SPARK_INDEX[theme], 3.5);
    }
    if (cleaved) {
      const sideX = -dz;
      const sideZ = dx;
      this.fragments.spawn("upper", enemy.x + sideX * 0.25, enemy.lift + 1.05, enemy.z + sideZ * 0.25,
        enemy.vx + sideX * 9, enemy.vz + sideZ * 9, enemy.scale);
      this.fragments.spawn("lower", enemy.x - sideX * 0.22, enemy.lift + 0.36, enemy.z - sideZ * 0.22,
        enemy.vx - sideX * 8, enemy.vz - sideZ * 8, enemy.scale);
      this.emitBlood(enemy.x, enemy.z, enemy.vx, enemy.vz, this.enemies.length > 2700 ? 9 : 15);
      return;
    }
    if (this.corpses.length >= MAX_CORPSES) this.corpses.shift();
    const isHeavyLaunch = enemy.liftV > 6;
    const corpse: Corpse = {
      id: enemy.id,
      lane: enemy.lane,
      x: enemy.x,
      z: enemy.z,
      vx: enemy.vx * (isHeavyLaunch ? 1.35 : 1.06),
      vz: enemy.vz * (isHeavyLaunch ? 1.35 : 1.06),
      stagger: enemy.stagger,
      scale: enemy.scale,
      angle: enemy.angle,
      variant: enemy.variant,
      armored: enemy.armored,
      alive: false,
      age: 0,
      distance: enemy.distance,
      y: 0.22 + enemy.lift,
      vy: Math.min(18, 3.5 + Math.hypot(enemy.vx, enemy.vz) * 0.35 + Math.max(0, enemy.liftV) * 0.75),
      spin: 0,
      landed: false,
      lostParts: enemy.lostParts,
    };
    this.corpses.push(corpse);
    const ragdollChance = this.enemies.length > 2800 ? 0.3 : this.enemies.length > 1500 ? 0.65 : 1;
    if (this.fps >= 42 || this.kills % 2 === 0) {
      if (Math.random() < ragdollChance) this.ragdolls.spawn(corpse);
    }
  }

  private damageArea(x: number, z: number, radius: number, damage: number, force = 14, theme: HitTheme = "missile") {
    const squared = radius * radius;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const distance = (enemy.x - x) ** 2 + (enemy.z - z) ** 2;
      if (distance < squared) {
        const falloff = 1 - Math.sqrt(distance) / radius;
        this.damageEnemy(enemy, damage * (0.72 + 0.28 * falloff), x, z, force * (0.65 + falloff * 0.68), true, theme);
      }
    }
  }

  private addSplat(x: number, z: number, size: number) {
    this.dummy.position.set(x, 0.08 + Math.random() * 0.016, z);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.scale.set(size * (0.85 + Math.random() * 0.7), 1, size * (0.75 + Math.random() * 0.55));
    this.dummy.updateMatrix();
    this.splatMesh.setMatrixAt(this.splatIndex, this.dummy.matrix);
    this.splatIndex = (this.splatIndex + 1) % MAX_SPLATS;
    this.splatCount = Math.min(MAX_SPLATS, this.splatCount + 1);
    this.splatMesh.count = this.splatCount;
    this.splatMesh.instanceMatrix.needsUpdate = true;
  }

  private emitBlood(x: number, z: number, vx: number, vz: number, count: number) {
    for (let index = 0; index < count && this.bloodDrops.length < MAX_BLOOD; index++) {
      const angle = Math.random() * Math.PI * 2;
      const power = 1.8 + Math.random() * 3.9;
      this.bloodDrops.push({
        x, z, y: 0.8 + Math.random() * 0.55,
        vx: vx * 0.31 + Math.cos(angle) * power,
        vz: vz * 0.31 + Math.sin(angle) * power,
        vy: 2.1 + Math.random() * 5.3,
        size: 0.65 + Math.random() * 1.45,
        color: Math.floor(Math.random() * BLOOD_COLORS.length),
      });
    }
  }

  private updateBlood(dt: number) {
    let write = 0;
    const originalCount = this.bloodDrops.length;
    for (let index = 0; index < originalCount; index++) {
      const drop = this.bloodDrops[index];
      drop.x += drop.vx * dt;
      drop.z += drop.vz * dt;
      drop.y += drop.vy * dt;
      drop.vy -= 22 * dt;
      if (drop.y <= 0.08) {
        if (Math.random() < 0.27) this.addSplat(drop.x, drop.z, 0.11 + drop.size * 0.08);
        continue;
      }
      this.bloodDrops[write++] = drop;
    }
    this.bloodDrops.length = write;
    for (let index = 0; index < write; index++) {
      const drop = this.bloodDrops[index];
      this.dummy.position.set(drop.x, drop.y, drop.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(drop.size);
      this.dummy.updateMatrix();
      this.bloodMesh.setMatrixAt(index, this.dummy.matrix);
      this.bloodMesh.setColorAt(index, BLOOD_COLORS[drop.color]);
    }
    this.bloodMesh.count = write;
    if (write) {
      this.bloodMesh.instanceMatrix.needsUpdate = true;
      if (this.bloodMesh.instanceColor) this.bloodMesh.instanceColor.needsUpdate = true;
    }
  }

  private addShotParticle(particle: ShotParticle) {
    if (this.shotParticles.length < MAX_SHOT_PARTICLES) this.shotParticles.push(particle);
  }

  private shotBurst(x: number, y: number, z: number, count: number, color: number, force = 5) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const strength = force * (0.42 + Math.random() * 0.86);
      this.addShotParticle({
        x, y, z,
        vx: Math.cos(angle) * strength,
        vy: strength * (0.35 + Math.random() * 0.68),
        vz: Math.sin(angle) * strength,
        age: 0,
        life: 0.12 + Math.random() * 0.17,
        size: 0.52 + Math.random() * 0.65,
        gravity: 16,
        drag: 3,
        color,
      });
    }
  }

  private fireVisualBullet(start: THREE.Vector3, end: THREE.Vector3, color: number, speed = 85) {
    const distance = start.distanceTo(end);
    const duration = clamp(distance / speed, 0.06, 0.22);
    this.addShotParticle({
      x: start.x, y: start.y, z: start.z,
      vx: (end.x - start.x) / duration,
      vy: (end.y - start.y) / duration,
      vz: (end.z - start.z) / duration,
      age: 0, life: duration, size: 1.32, gravity: 0, drag: 0, color,
      kind: "bullet", impactX: end.x, impactY: end.y, impactZ: end.z,
    });
    this.shotBurst(start.x, start.y, start.z, 4, color, 6);
    this.createMuzzleFlash(start, 0xffdf83, 0.56);
  }

  private updateShotParticles(dt: number) {
    let count = 0;
    const impacts: ShotParticle[] = [];
    const originalCount = this.shotParticles.length;
    for (let index = 0; index < originalCount; index++) {
      const particle = this.shotParticles[index];
      particle.age += dt;
      if (particle.age >= particle.life) {
        if (particle.kind === "bullet") impacts.push(particle);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy -= particle.gravity * dt;
      if (particle.drag > 0) {
        const drag = Math.exp(-particle.drag * dt);
        particle.vx *= drag;
        particle.vz *= drag;
      }
      if (particle.y < 0.04) continue;
      this.shotParticles[count] = particle;
      this.dummy.position.set(particle.x, particle.y, particle.z);
      this.shotDirection.set(particle.vx, particle.vy, particle.vz).normalize();
      this.dummy.quaternion.setFromUnitVectors(SHOT_UP, this.shotDirection);
      const fade = Math.max(0.2, 1 - particle.age / particle.life);
      this.dummy.scale.set(particle.size * 0.65 * fade, particle.size * (particle.kind === "bullet" ? 4 : particle.gravity > 0 ? 1.1 : 2.7) * fade, particle.size * 0.65 * fade);
      this.dummy.updateMatrix();
      this.shotMesh.setMatrixAt(count, this.dummy.matrix);
      this.shotMesh.setColorAt(count, SHOT_COLORS[particle.color]);
      count++;
    }
    this.shotParticles.length = count;
    this.shotMesh.count = count;
    if (count) {
      this.shotMesh.instanceMatrix.needsUpdate = true;
      if (this.shotMesh.instanceColor) this.shotMesh.instanceColor.needsUpdate = true;
    }
    for (const particle of impacts) {
      this.shotBurst(particle.impactX ?? particle.x, particle.impactY ?? particle.y, particle.impactZ ?? particle.z, 4, 2, 4.8);
    }
  }

  private lightningTube(points: THREE.Vector3[], radius: number, color: number, opacity: number, life: number) {
    if (this.effects.length >= 344) return;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let index = 0; index < points.length - 1; index++) {
      curve.add(new THREE.LineCurve3(points[index], points[index + 1]));
    }
    const geometry = new THREE.TubeGeometry(curve, (points.length - 1) * 2, radius, 4, false);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.effects.push({ mesh, kind: "tracer", age: 0, life, size: 1, opacity, ownsGeometry: true });
  }

  private createLightning(start: THREE.Vector3, end: THREE.Vector3, branch = false) {
    if (this.effects.length >= 340) return;
    const steps = 9;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const distance = Math.hypot(dx, dz) || 1;
    const nx = -dz / distance;
    const nz = dx / distance;
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const jagged = index === 0 || index === steps ? 0 : (Math.random() - 0.5) * (1.2 + distance * 0.1) * Math.sin(Math.PI * t);
      points.push(new THREE.Vector3(
        start.x + dx * t + nx * jagged,
        start.y + (end.y - start.y) * t + (index === 0 || index === steps ? 0 : (Math.random() - 0.5) * 0.5),
        start.z + dz * t + nz * jagged,
      ));
    }
    this.lightningTube(points, 0.21, 0x30aeee, 0.34, 0.21);
    this.lightningTube(points, 0.065, 0xe7ffff, 0.98, 0.16);
    if (branch) {
      const fork = points[4];
      const split = new THREE.Vector3(fork.x + nx * (1.5 + Math.random() * 1.6), 0.5, fork.z + nz * (1.5 + Math.random() * 1.6));
      const middle = fork.clone().lerp(split, 0.58).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.18, (Math.random() - 0.5) * 0.5));
      this.lightningTube([fork, middle, split], 0.055, 0xc9faff, 0.87, 0.12);
    }
    this.shotBurst(end.x, end.y, end.z, 4, 3, 4.8);
  }

  private createTracer(start: THREE.Vector3, end: THREE.Vector3, color: number, thickness: number, life: number) {
    if (this.effects.length > 350) return;
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.01) return;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(this.tracerGeometry, material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.scale.set(thickness, length, thickness);
    this.scene.add(mesh);
    this.effects.push({ mesh, kind: "tracer", age: 0, life, size: thickness, opacity: 0.92 });
  }

  private createMuzzleFlash(position: THREE.Vector3, color: number, size: number) {
    if (this.effects.length > 340) return;
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.burstGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(size * 0.42);
    this.scene.add(mesh);
    this.effects.push({ mesh, kind: "muzzle", age: 0, life: 0.12, size, opacity: 0.9 });
  }

  private createLaserPulse(start: THREE.Vector3, end: THREE.Vector3) {
    this.createTracer(start, end, 0x7d32c9, 0.39, 0.28);
    this.createTracer(start, end, 0xed79f8, 0.19, 0.24);
    this.createTracer(start, end, 0xfff6ff, 0.052, 0.17);
    this.createMuzzleFlash(start, 0xe5b4ff, 0.76);
    this.createMuzzleFlash(end, 0xffe5ff, 1.12);
    this.createExplosion(end.x, end.z, 2.1, 0xca75e9, false, 0.31);
    this.shotBurst(end.x, end.y, end.z, 11, 4, 7);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    this.createTracer(
      new THREE.Vector3(end.x - nx * 0.85, end.y, end.z - nz * 0.85),
      new THREE.Vector3(end.x + nx * 0.85, end.y, end.z + nz * 0.85),
      0xf5bfff, 0.05, 0.14,
    );
  }

  private createExplosion(x: number, z: number, size: number, color: number, withBurst = true, life = 0.52) {
    if (this.effects.length > 350) return;
    this.cameraShake = Math.min(1.2, this.cameraShake + size * (withBurst ? 0.07 : 0.012));
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(this.ringGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.26, z);
    ring.scale.setScalar(0.25);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, kind: "ring", age: 0, life, size, opacity: 0.85 });
    if (withBurst) {
      this.shotBurst(x, 0.5, z, Math.min(20, Math.ceil(size * 3.5)), 1, Math.min(14, 4 + size * 1.3));
      const burstMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
      const burst = new THREE.Mesh(this.burstGeometry, burstMaterial);
      burst.position.set(x, 0.65, z);
      this.scene.add(burst);
      this.effects.push({ mesh: burst, kind: "burst", age: 0, life: life * 0.64, size: size * 0.39, opacity: 0.6 });
    }
  }

  private updateProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const projectile = this.projectiles[index];
      projectile.age += dt;
      const progress = Math.min(1, projectile.age / projectile.duration);
      projectile.mesh.position.lerpVectors(projectile.start, projectile.end, progress);
      projectile.mesh.position.y += Math.sin(progress * Math.PI) * 6.5;
      projectile.trailTimer += dt;
      while (projectile.trailTimer >= 0.055 && progress < 1) {
        projectile.trailTimer -= 0.055;
        this.shotBurst(projectile.mesh.position.x, projectile.mesh.position.y, projectile.mesh.position.z, 2, 1, 2.5);
      }
      if (progress >= 1) {
        this.damageArea(projectile.end.x, projectile.end.z, projectile.radius, projectile.damage, 23, "mortar");
        this.createExplosion(projectile.end.x, projectile.end.z, projectile.radius * 0.85, 0xffad62);
        this.playSound("explosion", projectile.end.x);
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(index, 1);
      }
    }
  }

  private updateHomingRockets(dt: number) {
    for (let index = this.homingRockets.length - 1; index >= 0; index--) {
      const rocket = this.homingRockets[index];
      rocket.age += dt;

      // Dynamic rocket thruster nozzle flame flicker
      if (rocket.flareMesh) {
        const pulse = 0.85 + Math.random() * 0.55;
        rocket.flareMesh.scale.set(pulse, 0.75 + Math.random() * 0.55, 0.75 + Math.random() * 0.55);
      }

      // Retarget to nearest living zombie if target was eliminated or missing
      let target = this.enemies.find((enemy) => enemy.id === rocket.targetId && enemy.alive);
      if (!target) {
        let closest: Enemy | null = null;
        let closestDistSq = 32 * 32;
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const dSq = (enemy.x - rocket.x) ** 2 + (enemy.z - rocket.z) ** 2;
          if (dSq < closestDistSq) {
            closestDistSq = dSq;
            closest = enemy;
          }
        }
        if (closest) {
          target = closest;
          rocket.targetId = closest.id;
        }
      }

      if (target) {
        rocket.targetX = target.x;
        rocket.targetZ = target.z;
      }

      const targetY = target ? target.lift + 0.85 : 0.4;
      const toX = rocket.targetX - rocket.x;
      const toY = targetY - rocket.y;
      const toZ = rocket.targetZ - rocket.z;
      const distance = Math.hypot(toX, toY, toZ) || 0.1;

      // Accelerated guidance steering towards target
      rocket.speed = Math.min(44, rocket.speed + dt * 46);
      const desiredVx = (toX / distance) * rocket.speed;
      const desiredVy = (toY / distance) * rocket.speed;
      const desiredVz = (toZ / distance) * rocket.speed;

      const steerRate = Math.min(1, dt * rocket.turnSpeed);
      rocket.vx += (desiredVx - rocket.vx) * steerRate;
      rocket.vy += (desiredVy - rocket.vy) * steerRate;
      rocket.vz += (desiredVz - rocket.vz) * steerRate;

      // Dynamic aerodynamic corkscrew micro-wave
      const corkscrewAngle = rocket.age * 22 + rocket.spiralPhase;
      const waveX = -rocket.vz * Math.sin(corkscrewAngle) * rocket.spiralRadius;
      const waveZ = rocket.vx * Math.sin(corkscrewAngle) * rocket.spiralRadius;

      const currentSpeed = Math.hypot(rocket.vx, rocket.vy, rocket.vz) || 1;
      rocket.vx = (rocket.vx / currentSpeed) * rocket.speed;
      rocket.vy = (rocket.vy / currentSpeed) * rocket.speed;
      rocket.vz = (rocket.vz / currentSpeed) * rocket.speed;

      rocket.x += (rocket.vx + waveX) * dt;
      rocket.y += rocket.vy * dt;
      rocket.z += (rocket.vz + waveZ) * dt;
      rocket.mesh.position.set(rocket.x, rocket.y, rocket.z);

      this.shotDirection.set(rocket.vx, rocket.vy, rocket.vz).normalize();
      rocket.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.shotDirection);
      rocket.mesh.rotateX(rocket.age * 16);

      // Multi-layer exhaust plume: incandescent core + fiery flame puff + billowing smoke trail
      rocket.trailTimer += dt;
      while (rocket.trailTimer >= 0.012) {
        rocket.trailTimer -= 0.012;
        const tailX = rocket.x - this.shotDirection.x * 0.48;
        const tailY = rocket.y - this.shotDirection.y * 0.48;
        const tailZ = rocket.z - this.shotDirection.z * 0.48;

        // Layer 1: Incandescent white-hot core spark
        this.addShotParticle({
          x: tailX,
          y: tailY,
          z: tailZ,
          vx: -this.shotDirection.x * 8.5 + (Math.random() - 0.5) * 1.8,
          vy: -this.shotDirection.y * 8.5 + (Math.random() - 0.5) * 1.8,
          vz: -this.shotDirection.z * 8.5 + (Math.random() - 0.5) * 1.8,
          age: 0,
          life: 0.10 + Math.random() * 0.08,
          size: 0.52 + Math.random() * 0.32,
          gravity: 0,
          drag: 2.2,
          color: 2,
          kind: "bullet",
        });

        // Layer 2: Expanding fiery orange flame puff
        this.addShotParticle({
          x: tailX,
          y: tailY,
          z: tailZ,
          vx: -this.shotDirection.x * 5.2 + (Math.random() - 0.5) * 2.2,
          vy: -this.shotDirection.y * 5.2 + (Math.random() - 0.5) * 2.2,
          vz: -this.shotDirection.z * 5.2 + (Math.random() - 0.5) * 2.2,
          age: 0,
          life: 0.18 + Math.random() * 0.12,
          size: 0.72 + Math.random() * 0.48,
          gravity: 1,
          drag: 1.8,
          color: 1,
          kind: "shell",
        });

        // Layer 3: Billowing lingering smoke cloud with gentle upward drift
        if (Math.random() < 0.65) {
          this.addShotParticle({
            x: tailX + (Math.random() - 0.5) * 0.15,
            y: tailY + (Math.random() - 0.5) * 0.15,
            z: tailZ + (Math.random() - 0.5) * 0.15,
            vx: -this.shotDirection.x * 2.0 + (Math.random() - 0.5) * 1.5,
            vy: 0.75 + Math.random() * 1.2,
            vz: -this.shotDirection.z * 2.0 + (Math.random() - 0.5) * 1.5,
            age: 0,
            life: 0.38 + Math.random() * 0.28,
            size: 0.95 + Math.random() * 0.65,
            gravity: -0.4,
            drag: 1.1,
            color: 5,
            kind: "shell",
          });
        }
      }

      const hit = distance < 0.9 || rocket.y <= 0.22 || rocket.age >= rocket.life;
      if (hit) {
        // High impact explosive blast
        this.damageArea(rocket.x, rocket.z, rocket.radius, rocket.damage, 34, "rocket");

        // Primary fiery shockwave
        this.createExplosion(rocket.x, rocket.z, rocket.radius * 1.1, 0xff4714, true, 0.56);
        // Secondary outer amber shockwave ring
        this.createExplosion(rocket.x, rocket.z, rocket.radius * 1.45, 0xff9922, false, 0.42);

        // Core flash
        this.createMuzzleFlash(new THREE.Vector3(rocket.x, Math.max(0.4, rocket.y), rocket.z), 0xfff0aa, 1.3);

        // Ground blast scorch mark crater
        this.addSplat(rocket.x, rocket.z, Math.min(2.1, 0.75 + rocket.radius * 0.3));

        // Shrapnel bursts in hemispherical dome
        this.shotBurst(rocket.x, Math.max(0.4, rocket.y), rocket.z, 20, 1, 9.5);
        this.shotBurst(rocket.x, Math.max(0.4, rocket.y), rocket.z, 14, 2, 11.5);
        this.shotBurst(rocket.x, Math.max(0.4, rocket.y), rocket.z, 10, 5, 6.0);

        // Screen shake
        this.cameraShake = Math.min(1.4, this.cameraShake + 0.28);
        this.playSound("explosion", rocket.x);

        // Blast wave knockback & lift on nearby enemies
        const blastRadiusSq = (rocket.radius * 0.9) ** 2;
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const distSq = (enemy.x - rocket.x) ** 2 + (enemy.z - rocket.z) ** 2;
          if (distSq < blastRadiusSq) {
            enemy.liftV = 13 + Math.random() * 6;
            enemy.tumbleV = (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 10);
            enemy.stagger = 0.95;
          }
        }

        this.scene.remove(rocket.mesh);
        this.destroyGroup(rocket.mesh);
        this.homingRockets.splice(index, 1);
      }
    }
  }

  private updateEffects(dt: number) {
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      effect.age += dt;
      const progress = effect.age / effect.life;
      if (progress >= 1) {
        this.scene.remove(effect.mesh);
        effect.mesh.material.dispose();
        if (effect.ownsGeometry) effect.mesh.geometry.dispose();
        this.effects.splice(index, 1);
        continue;
      }
      effect.mesh.material.opacity = effect.opacity * (1 - progress) ** 1.4;
      if (effect.kind === "ring") effect.mesh.scale.setScalar(0.25 + effect.size * progress);
      if (effect.kind === "burst") effect.mesh.scale.setScalar(0.15 + effect.size * progress);
      if (effect.kind === "muzzle") effect.mesh.scale.setScalar(effect.size * (0.38 + progress * 0.75));
      if (effect.kind === "tracer" && !effect.ownsGeometry) {
        const pulse = 1 + 0.14 * Math.sin(this.elapsed * 83);
        effect.mesh.scale.x = effect.size * pulse;
        effect.mesh.scale.z = effect.size * pulse;
      }
    }
  }

  private updateAbilities(dt: number) {
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    for (const key of Object.keys(this.cooldowns) as AbilityType[]) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }

    for (let index = this.pendingImpacts.length - 1; index >= 0; index--) {
      const impact = this.pendingImpacts[index];
      impact.delay -= dt;
      if (impact.delay > 0) continue;
      this.damageArea(impact.x, impact.z, impact.radius, impact.damage, impact.big ? 37 : 21, impact.big ? "nuke" : "airstrike");
      this.createExplosion(impact.x, impact.z, impact.radius * (impact.big ? 1.15 : 0.8), impact.big ? 0xffcf87 : 0xff9b5c);
      if (impact.big) {
        this.onFlash();
        this.playSound("nuke", impact.x);
      } else {
        this.playSound("explosion", impact.x);
      }
      this.pendingImpacts.splice(index, 1);
    }

    if (this.beamTime > 0) {
      this.beamTime -= dt;
      this.beamTick -= dt;
      if (this.beamTick <= 0) {
        this.damageArea(this.beamX, this.beamZ, 3.6, 28, 14, "orbital");
        this.beamTick = 0.13;
      }
      this.beam.scale.setScalar(1 + Math.sin(this.elapsed * 24) * 0.12);
      if (this.beamTime <= 0) this.beam.visible = false;
    }

    for (let index = this.aircraft.length - 1; index >= 0; index--) {
      const plane = this.aircraft[index];
      plane.age += dt;
      plane.group.position.set(plane.x - 16 + plane.age * 23, 12, plane.z - 2);
      if (plane.age > 2) {
        this.destroyGroup(plane.group);
        this.aircraft.splice(index, 1);
      }
    }
  }

  private createAircraft(x: number, z: number) {
    const group = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xc4b6a0, flatShading: true });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 0.9), steel);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 4.4), steel);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.55), steel);
    wing.rotation.y = Math.PI / 2;
    body.rotation.y = Math.PI / 2;
    tail.position.x = -1.65;
    group.add(wing, body, tail);
    group.rotation.y = -0.12;
    this.scene.add(group);
    this.aircraft.push({ group, x, z, age: 0 });
  }

  private endBattle(won: boolean) {
    if (this.phase !== "battle") return;
    this.phase = won ? "victory" : "defeat";
    this.paused = false;
    this.targeting = null;
    this.ghost.visible = false;
    this.beam.visible = false;
    this.beamTime = 0;
    for (const projectile of this.projectiles) this.scene.remove(projectile.mesh);
    for (const rocket of this.homingRockets) {
      this.scene.remove(rocket.mesh);
      this.destroyGroup(rocket.mesh);
    }
    this.homingRockets = [];
    for (const plane of this.aircraft) this.destroyGroup(plane.group);
    this.projectiles = [];
    this.aircraft = [];
    this.pendingImpacts = [];
    this.bloodDrops = [];
    this.bloodMesh.count = 0;
    this.shotParticles = [];
    this.shotMesh.count = 0;
    this.rifleShots = [];
    this.rifleMesh.count = 0;
    this.flames.reset();
    if (won) {
      this.lastReward = 22 + this.wave * 10;
      this.progress.crystals += this.lastReward;
      this.progress.bestWave = Math.max(this.progress.bestWave, this.wave);
      this.scrap += 100 + this.wave * 35;
      this.playSound("victory");
    } else {
      this.lastReward = this.waveCrystals;
      this.enemies = [];
      this.playSound("defeat");
    }
    this.ragdolls.reset();
    this.fragments.reset();
    this.saveProgress();
    this.updateRangeRings();
    this.emit();
  }

  private animate = (now: number) => {
    if (!this.lastFrame) this.lastFrame = now;
    const frameSeconds = Math.max(0, (now - this.lastFrame) / 1000);
    const realDt = Math.min(frameSeconds, 0.05);
    this.lastFrame = now;
    this.frameCount++;
    this.fpsClock += Math.min(frameSeconds, 0.25);
    if (this.fpsClock >= 0.8) {
      this.fps = Math.round(this.frameCount / this.fpsClock);
      this.frameCount = 0;
      this.fpsClock = 0;
      if (this.phase === "battle" && !this.paused) {
        this.slowFrames = this.fps < 47 ? this.slowFrames + 1 : 0;
        this.fastFrames = this.fps > 58 ? this.fastFrames + 1 : 0;
        if (this.slowFrames >= 3 && this.renderer.getPixelRatio() > 0.8) {
          this.renderer.setPixelRatio(Math.max(0.8, this.renderer.getPixelRatio() - 0.15));
          this.slowFrames = 0;
        } else if (this.fastFrames >= 9 && this.renderer.getPixelRatio() < this.maxPixelRatio) {
          this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, this.renderer.getPixelRatio() + 0.1));
          this.fastFrames = 0;
        }
      }
    }

    if (!this.paused) {
      const dt = realDt * (this.phase === "battle" ? this.speed : 1);
      this.elapsed += dt;
      this.cameraShake = Math.max(0, this.cameraShake - realDt * 2.8);
      this.weather.update(dt);
      if (this.phase === "battle") {
        this.chainTimer = Math.max(0, this.chainTimer - dt);
        if (this.chainTimer === 0) this.chainCombo = 0;
        let remaining = dt;
        while (remaining > 0 && this.phase === "battle") {
          const step = Math.min(remaining, 0.022);
          this.updateEnemies(step);
          remaining -= step;
        }
        if (this.phase === "battle") {
          this.updateMarineUnits(dt);
          this.updateTowers(dt);
          this.updateRifleShots(dt);
          this.updateProjectiles(dt);
          this.updateHomingRockets(dt);
          this.updateAbilities(dt);
          this.updateBlood(dt);
          this.flames.update(dt);
          this.fragments.update(dt);
          let survivors = 0;
          for (const enemy of this.enemies) {
            if (enemy.alive) this.enemies[survivors++] = enemy;
          }
          this.enemies.length = survivors;
          if (this.spawned >= this.total && this.enemies.length === 0) this.endBattle(true);
        }
      } else if (this.phase === "build" || this.phase === "victory") {
        this.updateMarineUnits(dt);
      }
      this.updateShotParticles(dt);
      this.updateEffects(dt);
    }

    const shakeX = this.cameraShake > 0 ? Math.sin(this.elapsed * 87) * this.cameraShake * 0.19 : 0;
    const shakeZ = this.cameraShake > 0 ? Math.cos(this.elapsed * 113) * this.cameraShake * 0.14 : 0;
    this.applyCamera(shakeX, shakeZ);
    if (this.fortressFlag) this.fortressFlag.rotation.y = Math.sin(this.elapsed * 2.1) * 0.16;
    this.updateOrcInstances();
    const activeRunners = this.phase === "build" || this.phase === "victory" ? this.previewOrcs : this.enemies;
    this.orcRunners.render(
      activeRunners,
      this.cameraTarget.x,
      this.cameraTarget.z,
      (this.camera.right - this.camera.left) / this.camera.zoom / 2 + 12,
      (this.camera.top - this.camera.bottom) / this.camera.zoom * 1.4 + 12,
    );
    this.marineVisuals.render(this.marineUnits.filter((unit) => unit.hp > 0 || ((unit.lift && unit.lift > 0) && !unit.isBlownUp)));
    this.ragdolls.render();
    this.fragments.render();
    this.renderer.render(this.scene, this.camera);
    if (now - this.lastUi > 120) {
      this.lastUi = now;
      this.emit();
    }
  };

  private worldAt(clientX: number, clientY: number, target: THREE.Vector3) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, target);
  }

  private pointerToWorld(event: PointerEvent) {
    return this.worldAt(event.clientX, event.clientY, this.pointerPoint);
  }

  private panPixels(fromX: number, fromY: number, toX: number, toY: number) {
    if (!this.worldAt(fromX, fromY, this.panStartWorld) || !this.worldAt(toX, toY, this.panEndWorld)) return;
    this.cameraTarget.x += this.panStartWorld.x - this.panEndWorld.x;
    this.cameraTarget.z += this.panStartWorld.z - this.panEndWorld.z;
    this.clampCameraTarget();
    this.applyCamera();
  }

  private zoomAt(value: number, clientX: number, clientY: number) {
    const zoom = clamp(value, 0.75, 3.3);
    if (Math.abs(zoom - this.camera.zoom) < 0.001) return;
    const hasAnchor = !!this.worldAt(clientX, clientY, this.panStartWorld);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.applyCamera();
    if (hasAnchor && this.worldAt(clientX, clientY, this.panEndWorld)) {
      this.cameraTarget.x += this.panStartWorld.x - this.panEndWorld.x;
      this.cameraTarget.z += this.panStartWorld.z - this.panEndWorld.z;
    }
    this.clampCameraTarget();
    this.applyCamera();
    if (this.pointerInside && this.activePointers.size === 0) {
      this.worldAt(clientX, clientY, this.pointerPoint);
      this.updateGhost();
    }
    if (performance.now() - this.lastUi > 100) {
      this.lastUi = performance.now();
      this.emit();
    }
  }

  public adjustZoom(direction: 1 | -1) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.zoomAt(this.camera.zoom * (direction > 0 ? 1.25 : 0.8), rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  public resetCamera() {
    this.cameraTarget.set(0, 0, 0);
    this.camera.zoom = window.innerWidth < 650 ? 1.14 : 1;
    this.camera.updateProjectionMatrix();
    this.applyCamera();
    this.ghost.visible = false;
    this.emit();
  }

  private isValidPlacement(x: number, z: number, ignoredTowerId?: number, emergency = false) {
    // Peta PNG: koridor transparan sempit, jadi aturan diperlonggar agar
    // turret/outpost tetap bisa ditempatkan di area collision. Mode darurat
    // (lorong sangat sempit): clearance minimum tanpa overlap visual.
    const svgMode = this.svgGrid !== null;
    const marginX = svgMode ? (emergency ? 4 : 6) : 8;
    const marginZ = svgMode ? (emergency ? 3 : 5) : 7;
    const laneClearance = svgMode ? (emergency ? 3.2 : 4.0) : 6.4;
    const wallClearance = svgMode ? (emergency ? 1.2 : 1.6) : 2.1;
    if (Math.abs(x) > this.arenaHalfX - marginX || Math.abs(z) > this.arenaHalfZ - marginZ) return false;
    if ((x - this.fortressX) ** 2 + z * z < 8.7 ** 2) return false;
    if (this.distanceToPathSquared(x, z) < laneClearance ** 2) return false;
    // Turret hanya boleh di area collision terbuka (transparan pada PNG).
    if (this.svgGrid && gridBlocked(this.svgGrid, x, z, wallClearance)) return false;
    if (this.terrainObstacles.some((obstacle) => (obstacle.x - x) ** 2 + (obstacle.z - z) ** 2 < (obstacle.radius + 1.45) ** 2)) return false;
    return !this.towers.some((tower) => tower.id !== ignoredTowerId && (tower.x - x) ** 2 + (tower.z - z) ** 2 < 3.2 ** 2);
  }

  private relocateTowers() {
    for (const tower of this.towers) {
      if (this.isValidPlacement(tower.x, tower.z, tower.id)) continue;
      let destination: { x: number; z: number } | null = null;
      for (let radius = 1.5; radius <= 30 && !destination; radius += 1.5) {
        for (let angleIndex = 0; angleIndex < 24; angleIndex++) {
          const angle = angleIndex / 24 * Math.PI * 2 + tower.id * 0.19;
          const x = tower.x + Math.cos(angle) * radius;
          const z = tower.z + Math.sin(angle) * radius;
          if (this.isValidPlacement(x, z, tower.id)) {
            destination = { x, z };
            break;
          }
        }
      }
      if (!destination) continue;
      tower.x = destination.x;
      tower.z = destination.z;
      tower.group.position.set(tower.x, 0, tower.z);
    }
  }

  private rebuildTrack() {
    if (this.svgImage) this.paintTerrainFromImage(this.svgImage);
    else this.paintBaseTerrain();
    this.createPath();
    this.createRoad();

    this.clearDecorations();
    this.relocateTowers();
    this.initLaneGuardMarines();
    this.syncMarineUnits();
    this.createDecorations();
    this.positionPreviewOrcs();
    this.splatIndex = 0;
    this.splatCount = 0;
    this.splatMesh.count = 0;
    this.updateRangeRings();
    this.updateGhost();
    this.clampCameraTarget();
  }

  public generateTrack() {
    if (this.phase !== "build") {
      this.onToast("Buat jalur baru saat fase build, sebelum wave dimulai.");
      return;
    }

    let seed = Math.floor(Math.random() * 999999) + 1;
    if (seed === this.trackSeed) seed = seed % 999999 + 1;
    const lanes = createRaidLanes(seed, this.towers);
    this.trackSeed = seed;
    this.trackLanes = lanes;
    this.svgDataUrl = null;
    this.svgLanes = null;
    this.svgGrid = null;
    this.svgImage = null;
    this.svgRotation = 0;
    this.arenaHalfX = MAP_HALF_X;
    this.arenaHalfZ = MAP_HALF_Z;
    this.fortressX = FORTRESS_X;
    try {
      localStorage.removeItem(SVG_STORAGE_KEY);
    } catch {
      // Peta PNG lama boleh tetap ada bila storage diblokir.
    }
    this.rebuildTrack();
    this.playSound("place");
    try {
      localStorage.setItem(TRACK_STORAGE_KEY, JSON.stringify({ seed, lanes }));
    } catch {
      // Rerolling remains available even without persistent storage.
    }
    this.onToast(`${trackName(seed)}: 4 jalur baru dari barat ke timur, ${Math.round(this.pathLength)}m total.`);
    this.emit();
  }

  // Pasang peta dari gambar yang diunggah (PNG/JPG): area opaque/gelap jadi dinding.
  public async applySvgMap(dataUrl: string, preferredRotation = 0) {
    if (this.phase !== "build") {
      this.onToast("⏳ Peta hanya bisa diganti di fase bangun (sebelum wave dimulai).");
      return;
    }
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > SVG_MAX_DATAURL) {
      this.onToast("❌ File gambar tidak didukung atau terlalu besar (maks ~2MB).");
      return;
    }
    this.onToast("⏳ Memproses peta dari gambar...");
    let result: Awaited<ReturnType<typeof loadSvgMap>> | null = null;
    try {
      result = await loadSvgMap(dataUrl, preferredRotation);
    } catch {
      result = null;
    }
    if (!result || !result.ok) {
      const reason = result && !result.ok ? ` ${result.reason}` : "";
      this.onToast(`❌ Peta gagal dimuat: ${reason}`);
      return;
    }
    if (!("grid" in result)) return;
    this.svgDataUrl = dataUrl;
    this.svgLanes = result.lanes;
    this.svgGrid = result.grid;
    this.svgImage = result.image;
    this.svgRotation = result.rotation;
    this.trackLanes = result.lanes;
    // Arena mengikuti panjang & lebar PNG.
    this.arenaHalfX = result.grid.halfX;
    this.arenaHalfZ = result.grid.halfZ;
    this.fortressX = result.grid.endX - 6;
    try {
      localStorage.setItem(SVG_STORAGE_KEY, JSON.stringify({ data: dataUrl, rotation: this.svgRotation }));
    } catch {
      // Peta tetap aktif di sesi ini walau storage penuh.
    }
    this.rebuildTrack();
    this.playSound("place");
    const rotNote = result.rotation !== 0 ? `, diputar ${result.rotation}°` : "";
    const carveNote = result.carvedCells > 0
      ? ` ⚠️ Tidak ada lorong transparan kiri→kanan di arah ini: ${result.carvedCells} sel tembok dibuka paksa untuk jalur orc — tekan PUTAR 90° kalau mau arah lain.`
      : "";
    this.onToast(`🗺️ PNG ${result.width}×${result.height}px dipasang: arena ${Math.round(result.grid.halfX * 2)}×${Math.round(result.grid.halfZ * 2)}m, area opaque = tembok, transparan = jalur orc${rotNote}.${carveNote}`);
    this.emit();
  }

  // Putar peta PNG 90° searah jarum jam (jalur orc & collision dihitung ulang).
  public rotateSvgMap() {
    if (this.phase !== "build") {
      this.onToast("⏳ Peta hanya bisa diputar di fase bangun.");
      return;
    }
    if (!this.svgGrid || !this.svgImage || !this.svgDataUrl) {
      this.onToast("Peta PNG belum aktif — unggah dulu lewat PETA DARI PNG.");
      return;
    }
    const grid = this.svgGrid;
    const ngw = grid.gh;
    const ngh = grid.gw;
    const walls = new Uint8Array(ngw * ngh);
    for (let j = 0; j < grid.gh; j++) {
      for (let i = 0; i < grid.gw; i++) {
        walls[i * ngw + (ngw - 1 - j)] = grid.walls[j * grid.gw + i];
      }
    }
    const rotated: CollisionGrid = {
      walls,
      gw: ngw,
      gh: ngh,
      halfX: grid.halfZ,
      halfZ: grid.halfX,
      startX: -(grid.halfZ + 12),
      endX: grid.halfZ + 10,
    };
    // Selalu berhasil: kalau tidak ada lorong transparan kiri→kanan di arah
    // ini, jalur orc dicari "lunak" dan sel tembok yang dilewati dibuka paksa.
    const built = buildLanesFromWalls(rotated);
    this.svgGrid = built.carved;
    this.svgLanes = built.lanes;
    this.trackLanes = built.lanes;
    this.arenaHalfX = rotated.halfX;
    this.arenaHalfZ = rotated.halfZ;
    this.fortressX = rotated.endX - 6;
    this.svgRotation = (this.svgRotation + 90) % 360;
    this.rebuildTrack();
    this.playSound("place");
    try {
      localStorage.setItem(SVG_STORAGE_KEY, JSON.stringify({ data: this.svgDataUrl, rotation: this.svgRotation }));
    } catch {
      // Tanpa storage, rotasi tetap berlaku di sesi ini.
    }
    const carveNote = built.carvedCells > 0
      ? ` ⚠️ Tidak ada lorong transparan kiri→kanan di arah ini — ${built.carvedCells} sel tembok dibuka paksa.`
      : "";
    this.onToast(`🔄 Peta diputar 90° (total ${this.svgRotation}°). Jalur orc & collision dihitung ulang.${carveNote}`);
    this.emit();
  }

  public clearSvgMap() {
    if (this.phase !== "build") {
      this.onToast("⏳ Peta hanya bisa diganti di fase bangun (sebelum wave dimulai).");
      return;
    }
    if (!this.svgDataUrl) return;
    this.svgDataUrl = null;
    this.svgLanes = null;
    this.svgGrid = null;
    this.svgImage = null;
    this.svgRotation = 0;
    this.arenaHalfX = MAP_HALF_X;
    this.arenaHalfZ = MAP_HALF_Z;
    this.fortressX = FORTRESS_X;
    try {
      localStorage.removeItem(SVG_STORAGE_KEY);
    } catch {
      // Abaikan bila storage diblokir.
    }
    this.rebuildTrack();
    this.playSound("place");
    this.onToast("♻️ Peta PNG dihapus, kembali ke peta prosedural.");
    this.emit();
  }

  private updateGhost() {
    if (!this.pointerInside || !this.inputEnabled) {
      this.ghost.visible = false;
      return;
    }
    if (this.phase === "build" && this.selectedType) {
      const capacity = this.towers.length < MAX_TOWERS &&
        (this.selectedType !== "barracks" || this.towers.filter((tower) => tower.type === "barracks").length < MAX_BARRACKS);
      const px = this.pointerPoint.x;
      const pz = this.pointerPoint.z;
      const valid = capacity &&
        (this.isValidPlacement(px, pz) || (this.svgGrid !== null && this.isValidPlacement(px, pz, undefined, true))) &&
        this.scrap >= TOWERS[this.selectedType].cost;
      this.ghostRing.scale.setScalar(TOWERS[this.selectedType].range);
      this.ghostRing.material.color.set(valid ? 0xf1dfaa : 0xf17769);
      this.ghostCore.material.color.set(valid ? 0xe7c574 : 0xf17769);
      this.ghostCore.visible = true;
      this.ghost.visible = true;
    } else if (this.phase === "battle" && this.targeting && !this.paused) {
      const radius = this.targeting === "nuke" ? 10 : this.targeting === "orbital" ? 3.6 : 8;
      this.ghostRing.scale.setScalar(radius);
      this.ghostRing.material.color.set(ABILITIES[this.targeting].color);
      this.ghostCore.visible = false;
      this.ghost.visible = true;
    } else {
      this.ghost.visible = false;
    }
    this.ghost.position.set(this.pointerPoint.x, 0, this.pointerPoint.z);
  }

  private findClickedTower(x: number, z: number) {
    return this.towers.find((tower) => (tower.x - x) ** 2 + (tower.z - z) ** 2 < 1.7 ** 2);
  }

  private handlePointerMove = (event: PointerEvent) => {
    const state = this.activePointers.get(event.pointerId);
    if (state) {
      const previousX = state.lastX;
      const previousY = state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 5) state.moved = true;
      if (this.activePointers.size === 2 && event.pointerType === "touch") {
        const other = [...this.activePointers.values()].find((pointer) => pointer !== state)!;
        state.moved = true;
        other.moved = true;
        const previousDistance = Math.hypot(previousX - other.lastX, previousY - other.lastY);
        const currentDistance = Math.hypot(event.clientX - other.lastX, event.clientY - other.lastY);
        const previousMidX = (previousX + other.lastX) * 0.5;
        const previousMidY = (previousY + other.lastY) * 0.5;
        const currentMidX = (event.clientX + other.lastX) * 0.5;
        const currentMidY = (event.clientY + other.lastY) * 0.5;
        if (previousDistance > 8 && currentDistance > 8) this.zoomAt(this.camera.zoom * currentDistance / previousDistance, currentMidX, currentMidY);
        this.panPixels(previousMidX, previousMidY, currentMidX, currentMidY);
      } else if (state.moved) {
        this.panPixels(previousX, previousY, event.clientX, event.clientY);
      }
      this.ghost.visible = false;
      return;
    }
    if (!this.inputEnabled) return;
    if (!this.pointerToWorld(event)) return;
    this.pointerInside = true;
    this.updateGhost();
  };

  private handlePointerLeave = () => {
    if (this.activePointers.size === 0) {
      this.pointerInside = false;
      this.ghost.visible = false;
    }
  };

  private handleContextMenu = (event: MouseEvent) => event.preventDefault();

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.inputEnabled || (event.pointerType === "mouse" && event.button > 2)) return;
    event.preventDefault();
    this.activePointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      button: event.button,
      panOnly: event.button === 1 || (event.button === 0 && event.shiftKey),
      moved: false,
    });
    if (this.activePointers.size > 1) {
      for (const state of this.activePointers.values()) state.moved = true;
    }
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.ghost.visible = false;
  };

  private handlePointerUp = (event: PointerEvent) => {
    const state = this.activePointers.get(event.pointerId);
    if (!state) return;
    const isTap = this.activePointers.size === 1 && !state.moved && !state.panOnly;
    this.activePointers.delete(event.pointerId);
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    if (isTap && this.inputEnabled && this.pointerToWorld(event)) {
      this.handleWorldAction(state.button, this.pointerPoint.x, this.pointerPoint.z);
    }
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerInside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (this.pointerInside && this.pointerToWorld(event)) this.updateGhost();
    else this.ghost.visible = false;
  };

  private handlePointerCancel = (event: PointerEvent) => {
    this.activePointers.delete(event.pointerId);
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    this.ghost.visible = false;
  };

  private handleWheel = (event: WheelEvent) => {
    if (!this.inputEnabled) return;
    event.preventDefault();
    this.zoomAt(this.camera.zoom * Math.exp(-event.deltaY * 0.0012), event.clientX, event.clientY);
  };

  private handleWorldAction(button: number, x: number, z: number) {
    if (this.phase === "build") {
      const clicked = this.findClickedTower(x, z);
      if (button === 2) {
        if (clicked) this.sellTower(clicked);
        return;
      }
      if (clicked) {
        this.selectedTowerId = clicked.id;
        this.selectedType = null;
        this.updateRangeRings();
        this.updateGhost();
        this.emit();
        return;
      }
      if (!this.selectedType) {
        this.selectedTowerId = null;
        this.updateRangeRings();
        this.emit();
        return;
      }
      const config = TOWERS[this.selectedType];
      if (this.towers.length >= MAX_TOWERS || (this.selectedType === "barracks" &&
        this.towers.filter((tower) => tower.type === "barracks").length >= MAX_BARRACKS)) {
        this.onToast("Batas pertahanan tercapai. Jual tower lain untuk membuka ruang.");
      } else if (this.scrap < config.cost) {
        this.onToast("Coin tidak cukup untuk tower ini.");
      } else if (!this.isValidPlacement(x, z) && !(this.svgGrid !== null && this.isValidPlacement(x, z, undefined, true))) {
        this.onToast("Bangun di area transparan peta (bukan tembok/jalur orc).");
      } else {
        this.scrap -= config.cost;
        this.addTower(this.selectedType, x, z);
        this.playSound("place");
        this.onToast(`${config.name} siap menembak.`);
      }
      this.updateGhost();
      this.emit();
    } else if (this.phase === "battle" && !this.paused && button !== 2) {
      if (this.targeting) this.activateAbility(this.targeting, x, z);
      else {
        const clicked = this.findClickedTower(x, z);
        if (clicked) {
          this.selectedTowerId = clicked.id;
          this.emit();
        } else {
          this.selectedTowerId = null;
          this.fireMissile(x, z);
        }
      }
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.inputEnabled || event.repeat) return;
    if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
      event.preventDefault();
      this.adjustZoom(1);
      return;
    }
    if (event.key === "-" || event.code === "NumpadSubtract") {
      event.preventDefault();
      this.adjustZoom(-1);
      return;
    }
    if (event.key === "0" || event.code === "Numpad0") {
      event.preventDefault();
      this.resetCamera();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (this.phase === "build") this.startWave();
      else if (this.phase === "battle") this.togglePause();
      else if (this.phase === "victory") this.nextWave();
      else this.retry();
      return;
    }
    const key = event.key.toLowerCase();
    if (this.phase === "build") {
      const index = Number(key) - 1;
      if (index >= 0 && index < TOWER_ORDER.length) this.selectTowerType(TOWER_ORDER[index]);
      if (key === "g") this.generateTrack();
      if (key === "h") {
        this.startWave();
        this.spawnBoss("hulk");
      }
      if (key === "j") {
        this.startWave();
        this.spawnBoss("superHulk");
      }
    } else if (this.phase === "battle") {
      if (key === "h") this.spawnBoss("hulk");
      if (key === "j") this.spawnBoss("superHulk");
      if (key === "q") this.selectAbility("airstrike");
      if (key === "e") this.selectAbility("orbital");
      if (key === "r") this.selectAbility("nuke");
      if (key === "f") this.toggleSpeed();
      if (key === "t") this.repairTower();
      if (key === "escape") {
        if (this.targeting) {
          this.targeting = null;
          this.updateGhost();
          this.emit();
        } else this.togglePause();
      }
    }
  };

  private handleVisibilityChange = () => {
    if (document.hidden && this.phase === "battle" && !this.paused) this.togglePause();
  };

  public setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.ghost.visible = false;
      for (const id of this.activePointers.keys()) {
        if (this.renderer.domElement.hasPointerCapture(id)) this.renderer.domElement.releasePointerCapture(id);
      }
      this.activePointers.clear();
    }
  }

  public selectTowerType(type: TowerType) {
    if (this.phase !== "build") return;
    this.selectedType = type;
    this.selectedTowerId = null;
    this.updateRangeRings();
    this.updateGhost();
    this.emit();
  }

  public upgradeSelectedTower() {
    if (this.phase !== "build") return;
    const tower = this.towers.find((item) => item.id === this.selectedTowerId);
    if (!tower || tower.level >= 3) return;
    const cost = this.getTowerUpgradeCost(tower);
    if (this.scrap < cost) {
      this.onToast("Coin tidak cukup untuk upgrade.");
      return;
    }
    this.scrap -= cost;
    tower.level++;
    tower.maxHp += 42;
    tower.hp = Math.min(tower.maxHp, tower.hp + 42);
    this.updateTowerHealthBar(tower);
    tower.head.scale.setScalar(1 + (tower.level - 1) * 0.12);
    if (tower.type === "barracks") this.syncMarineUnits();
    if (tower.type === "rocket") this.upgradeRocketTowerVisuals(tower);
    this.updateRangeRings();
    this.playSound("place");
    this.onToast(`${TOWERS[tower.type].name} naik ke level ${tower.level}.`);
    this.emit();
  }

  private upgradeRocketTowerVisuals(tower: Tower) {
    const metal = new THREE.MeshLambertMaterial({ color: 0x474a58, flatShading: true });
    const accent = new THREE.MeshLambertMaterial({ color: 0xe64428, flatShading: true });
    const hazard = new THREE.MeshBasicMaterial({ color: 0xffb800 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1f232b, flatShading: true });

    if (tower.level === 2) {
      // Level 2: Add auxiliary upper missile racks & armored side skirts on both pods
      for (const pod of [tower.leftPod, tower.rightPod]) {
        if (!pod) continue;
        const upperRack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.48), dark);
        upperRack.position.set(-0.06, 0.32, 0);
        pod.add(upperRack);

        const hazardStrip = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 0.52), hazard);
        hazardStrip.position.set(-0.06, 0.42, 0);
        pod.add(hazardStrip);

        for (const dz of [-0.13, 0.13]) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 8), metal);
          tube.position.set(0.42, 0.32, dz);
          tube.rotation.z = Math.PI / 2;
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.16, 8), accent);
          tip.position.set(0.55, 0.32, dz);
          tip.rotation.z = -Math.PI / 2;
          pod.add(tube, tip);
        }
      }
      if (tower.radarDish) {
        const dishSensor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 6), hazard);
        dishSensor.position.set(0.18, 0.12, 0);
        dishSensor.rotation.z = -Math.PI / 2;
        tower.radarDish.add(dishSensor);
      }
    } else if (tower.level === 3) {
      // Level 3: Heavy Center Launcher Battery & Reinforced Titanium Blast Armor
      const centerPod = new THREE.Group();
      centerPod.position.set(0, 0.88, 0);
      centerPod.rotation.z = 0.26;

      const centerChassis = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.48, 0.62), dark);
      const centerArmor = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.12, 0.68), accent);
      centerArmor.position.y = 0.22;
      centerPod.add(centerChassis, centerArmor);

      for (const dy of [-0.11, 0.11]) {
        for (const dz of [-0.16, 0.16]) {
          const heavyTube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.38, 8), metal);
          heavyTube.position.set(0.58, dy, dz);
          heavyTube.rotation.z = Math.PI / 2;
          const heavyTip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 8), hazard);
          heavyTip.position.set(0.74, dy, dz);
          heavyTip.rotation.z = -Math.PI / 2;
          centerPod.add(heavyTube, heavyTip);
        }
      }
      tower.head.add(centerPod);

      if (tower.targetLaser) {
        (tower.targetLaser.material as THREE.LineBasicMaterial).color.setHex(0xff3300);
      }
      if (tower.laserDot) {
        (tower.laserDot.material as THREE.MeshBasicMaterial).color.setHex(0xff3300);
      }
    }
  }

  private sellTower(tower: Tower) {
    if (this.phase !== "build") return;
    this.scrap += this.getSellValue(tower);
    this.removeTowerExtras(tower);
    this.destroyGroup(tower.group);
    this.towers = this.towers.filter((item) => item.id !== tower.id);
    if (tower.type === "barracks") this.syncMarineUnits();
    if (this.selectedTowerId === tower.id) {
      this.selectedTowerId = null;
      this.selectedType = tower.type;
    }
    this.updateRangeRings();
    this.playSound("place");
    this.onToast("Tower dijual. Sebagian coin dikembalikan.");
    this.emit();
  }

  public sellSelectedTower() {
    const tower = this.towers.find((item) => item.id === this.selectedTowerId);
    if (tower) this.sellTower(tower);
  }

  public startWave() {
    if (this.phase !== "build") return;
    this.initLaneGuardMarines();
    this.syncMarineUnits();
    this.phase = "battle";
    this.paused = false;
    this.spawned = 0;
    this.superHulkSpawnedThisWave = false;
    this.waveKills = 0;
    this.waveCrystals = 0;
    this.towersLost = 0;
    this.chainCombo = 0;
    this.chainTimer = 0;
    this.escaped = 0;
    this.total = this.adjustedWaveSize;
    this.spawnAccumulator = 0.4;
    this.enemies = [];
    this.targeting = null;
    this.selectedTowerId = null;
    this.cooldowns = { airstrike: 0, orbital: 0, nuke: 0 };
    this.missileCooldown = 0;
    this.updateRangeRings();
    this.ghost.visible = false;
    this.playSound("start");
    this.onToast("Gerombolan orc datang! Klik medan untuk menembakkan misil.");
    this.emit();
  }

  private fireMissile(x: number, z: number) {
    if (this.missileCooldown > 0) return;
    this.missileCooldown = 0.85;
    this.damageArea(x, z, 2.55, 44 + this.wave * 3, 18);
    this.fireVisualBullet(new THREE.Vector3(0, 8.3, 0), new THREE.Vector3(x, 0.4, z), 0, 120);
    this.createTracer(new THREE.Vector3(0, 8.3, 0), new THREE.Vector3(x, 0.35, z), 0xffd893, 0.06, 0.15);
    this.createExplosion(x, z, 2.4, 0xffb66e);
    this.playSound("missile", x);
    this.emit();
  }

  public selectAbility(ability: AbilityType) {
    if (this.phase !== "battle" || this.paused) return;
    if (this.cooldowns[ability] > 0) {
      this.onToast(`${ABILITIES[ability].name} belum siap.`);
      return;
    }
    this.targeting = this.targeting === ability ? null : ability;
    this.updateGhost();
    if (this.targeting) this.onToast(`Klik medan untuk menggunakan ${ABILITIES[ability].name}.`);
    this.emit();
  }

  private activateAbility(ability: AbilityType, x: number, z: number) {
    if (this.cooldowns[ability] > 0) return;
    this.cooldowns[ability] = ABILITIES[ability].cooldown;
    this.targeting = null;
    this.ghost.visible = false;
    if (ability === "airstrike") {
      this.createAircraft(x, z);
      for (let index = 0; index < 9; index++) {
        this.pendingImpacts.push({
          x: x - 9 + index * 2.2,
          z: z + (Math.random() - 0.5) * 3.3,
          delay: 0.25 + index * 0.11,
          damage: 100,
          radius: 2.9,
        });
      }
      this.playSound("start");
    } else if (ability === "orbital") {
      this.beamX = x;
      this.beamZ = z;
      this.beamTime = 3.1;
      this.beamTick = 0;
      this.beam.position.set(x, 0, z);
      this.beam.visible = true;
      this.createExplosion(x, z, 3.2, 0x9af7ff);
      this.playSound("orbital", x);
    } else {
      this.pendingImpacts.push({ x, z, delay: 0.45, damage: 550, radius: 10.5, big: true });
      this.createExplosion(x, z, 2.0, 0xffe5a2);
      this.playSound("start");
    }
    this.emit();
  }

  public togglePause() {
    if (this.phase !== "battle") return;
    this.paused = !this.paused;
    if (this.paused) this.ghost.visible = false;
    else this.updateGhost();
    this.emit();
  }

  public toggleSpeed() {
    if (this.phase !== "battle") return;
    this.speed = this.speed === 1 ? 2 : 1;
    this.emit();
  }

  public toggleMute() {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.emit();
  }

  public setOrcSpeed(value: number) {
    if (!Number.isFinite(value)) return;
    this.director.orcSpeed = clamp(Math.round(value * 4) / 4, 0.75, 3);
    this.saveDirectorSettings();
    this.emit();
  }

  public setWeather(mode: WeatherMode) {
    this.weather.setMode(mode);
    this.applyWeatherToRoad();
    this.weather.update(0.016);
    this.emit();
  }

  public setHordeMultiplier(value: number) {
    if (!Number.isFinite(value)) return;
    this.director.hordeMultiplier = clamp(Math.round(value * 2) / 2, 1, 10);
    if (this.phase === "build" || this.phase === "battle") {
      this.total = Math.max(this.spawned, this.adjustedWaveSize);
    }
    this.saveDirectorSettings();
    this.emit();
  }

  public nextWave() {
    if (this.phase !== "victory") return;
    this.wave++;
    this.total = this.adjustedWaveSize;
    this.spawned = 0;
    this.superHulkSpawnedThisWave = false;
    this.waveKills = 0;
    this.escaped = 0;
    this.towersLost = 0;
    this.chainCombo = 0;
    this.chainTimer = 0;
    this.baseHp = Math.min(this.maxHp, this.baseHp + 5);
    for (const tower of this.towers) {
      tower.hp = Math.min(tower.maxHp, tower.hp + Math.ceil(tower.maxHp * 0.22));
      tower.hitTimer = 0;
      this.updateTowerHealthBar(tower);
    }
    for (const unit of this.marineUnits) {
      unit.hp = unit.maxHp;
      unit.respawn = 0;
      unit.hitTime = 0;
    }
    this.phase = "build";
    this.selectedType = "gunner";
    this.selectedTowerId = null;
    this.lastReward = 0;
    this.corpses = [];
    this.ragdolls.reset();
    this.fragments.reset();
    this.bloodDrops = [];
    this.bloodMesh.count = 0;
    this.shotParticles = [];
    this.shotMesh.count = 0;
    this.rifleShots = [];
    this.rifleMesh.count = 0;
    this.flames.reset();
    this.updateRangeRings();
    this.emit();
  }

  public retry() {
    if (this.phase !== "defeat") return;
    for (const tower of this.towers) this.destroyGroup(tower.group);
    for (const projectile of this.projectiles) this.scene.remove(projectile.mesh);
    for (const rocket of this.homingRockets) {
      this.scene.remove(rocket.mesh);
      this.destroyGroup(rocket.mesh);
    }
    this.homingRockets = [];
    for (const effect of this.effects) {
      this.scene.remove(effect.mesh);
      effect.mesh.material.dispose();
      if (effect.ownsGeometry) effect.mesh.geometry.dispose();
    }
    for (const plane of this.aircraft) this.destroyGroup(plane.group);
    this.towers = [];
    this.marineUnits = [];
    this.enemies = [];
    this.corpses = [];
    this.ragdolls.reset();
    this.fragments.reset();
    this.bloodDrops = [];
    this.bloodMesh.count = 0;
    this.shotParticles = [];
    this.shotMesh.count = 0;
    this.rifleShots = [];
    this.rifleMesh.count = 0;
    this.flames.reset();
    this.projectiles = [];
    this.effects = [];
    this.pendingImpacts = [];
    this.aircraft = [];
    this.splatMesh.count = 0;
    this.splatCount = 0;
    this.splatIndex = 0;
    this.wave = 1;
    this.total = this.adjustedWaveSize;
    this.baseHp = this.maxHp;
    this.scrap = 900000 + this.progress.upgrades.supplies * 65;
    this.kills = 0;
    this.waveKills = 0;
    this.waveCrystals = 0;
    this.towersLost = 0;
    this.chainCombo = 0;
    this.chainTimer = 0;
    this.escaped = 0;
    this.spawned = 0;
    this.superHulkSpawnedThisWave = false;
    this.lastReward = 0;
    this.phase = "build";
    this.selectedType = "gunner";
    this.selectedTowerId = null;
    this.targeting = null;
    this.paused = false;
    this.beam.visible = false;
    this.setupStartingTowers();
    this.clearDecorations();
    this.relocateTowers();
    this.initLaneGuardMarines();
    this.syncMarineUnits();
    this.createDecorations();
    this.emit();
  }

  private setupStartingTowers() {
    // 6 Benteng tengah (turret yang sudah ada)
    this.addTower("gunner", -12, 5);
    this.addTower("flame", -10, -10);
    this.addTower("gunner", 12, -5);
    this.addTower("flame", 10, 10);
    this.addTower("barracks", -18, -12);
    this.addTower("rocket", 14, 12);

    // 2 Turret di tiap jalur (Barat, Utara, Timur, Selatan)
    // Jalur Barat:
    this.addTower("rocket", -38, -20);
    this.addTower("tesla", -25, -13);
    // Jalur Utara:
    this.addTower("laser", -18, -36);
    this.addTower("mortar", -8, -20);
    // Jalur Timur:
    this.addTower("rocket", 38, 20);
    this.addTower("tesla", 25, 13);
    // Jalur Selatan:
    this.addTower("laser", 18, 36);
    this.addTower("mortar", 8, 20);
  }

  public buyUpgrade(id: UpgradeId) {
    if (this.phase === "battle") return;
    const config = UPGRADES.find((upgrade) => upgrade.id === id);
    if (!config) return;
    const current = this.progress.upgrades[id];
    if (current >= 3) return;
    const cost = config.cost * (current + 1);
    if (this.progress.crystals < cost) {
      this.onToast("Crystal belum cukup. Kalahkan lebih banyak orc.");
      return;
    }
    this.progress.crystals -= cost;
    this.progress.upgrades[id]++;
    if (id === "walls" && this.phase !== "defeat") this.baseHp += 5;
    if (id === "supplies") this.scrap += 65;
    this.saveProgress();
    this.playSound("place");
    this.onToast(`${config.name} ditingkatkan ke level ${current + 1}.`);
    this.emit();
  }

  private playSound(kind: GameSound, x = 0) {
    this.audio.play(kind, x);
  }

  public dispose() {
    this.renderer.setAnimationLoop(null);
    for (const rocket of this.homingRockets) {
      this.scene.remove(rocket.mesh);
      this.destroyGroup(rocket.mesh);
    }
    this.homingRockets = [];
    this.weather.dispose();
    this.flames.dispose();
    this.marineVisuals.dispose();
    this.orcRunners.dispose();
    this.ragdolls.dispose();
    this.fragments.dispose();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.handlePointerCancel);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("contextmenu", this.handleContextMenu);
    this.renderer.domElement.removeEventListener("wheel", this.handleWheel);
    this.activePointers.clear();
    window.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      }
    });
    [this.tracerGeometry, this.ringGeometry, this.burstGeometry, this.shellGeometry].forEach((geometry) => geometries.add(geometry));
    materials.add(this.shellMaterial);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.terrainTexture?.dispose();
    this.splatTexture?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.audio.dispose();
  }
}