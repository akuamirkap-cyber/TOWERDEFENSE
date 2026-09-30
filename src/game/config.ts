export type TowerType = "gunner" | "flame" | "mortar" | "tesla" | "laser" | "barracks" | "rocket";
export type AbilityType = "airstrike" | "orbital" | "nuke";
export type Phase = "build" | "battle" | "victory" | "defeat";
export type WeatherMode = "sunny" | "snow" | "rainyNight";

export interface TowerConfig {
  name: string;
  role: string;
  cost: number;
  range: number;
  rate: number;
  damage: number;
  color: string;
  hotkey: string;
}

export const TOWER_ORDER: TowerType[] = ["gunner", "flame", "mortar", "tesla", "laser", "barracks", "rocket"];

export const HULK_CONFIG = {
  name: "Hulk Boss",
  hp: 290,
  speed: 0.64,
  scale: 3,
  damage: 75,
  knockback: 11.5,
};

export const SUPER_HULK_CONFIG = {
  name: "Super Hulk",
  hp: 880,
  speed: 0.40,
  scale: 10,
  damage: 180,
  knockback: 24.0,
};

export const TOWERS: Record<TowerType, TowerConfig> = {
  gunner: {
    name: "Gunner",
    role: "Tembakan cepat, satu target",
    cost: 85,
    range: 11.5,
    rate: 5.2,
    damage: 18,
    color: "#e5c875",
    hotkey: "1",
  },
  flame: {
    name: "Flamethrower",
    role: "Membakar gerombolan dekat",
    cost: 130,
    range: 7.2,
    rate: 5.5,
    damage: 12,
    color: "#f08b58",
    hotkey: "2",
  },
  mortar: {
    name: "Mortar",
    role: "Ledakan area yang luas",
    cost: 175,
    range: 17,
    rate: 0.75,
    damage: 68,
    color: "#e9a76d",
    hotkey: "3",
  },
  tesla: {
    name: "Tesla Coil",
    role: "Petir merambat antar orc",
    cost: 220,
    range: 10.2,
    rate: 1.6,
    damage: 31,
    color: "#79cfdb",
    hotkey: "4",
  },
  laser: {
    name: "Laser",
    role: "Sinar presisi, daya tinggi",
    cost: 275,
    range: 15,
    rate: 2.2,
    damage: 60,
    color: "#d491dc",
    hotkey: "5",
  },
  barracks: {
    name: "Marine Outpost",
    role: "2 marine: rifle, tebasan, tendangan",
    cost: 50,
    range: 16,
    rate: 1,
    damage: 18,
    color: "#f0c36d",
    hotkey: "6",
  },
  rocket: {
    name: "Rocket Battery",
    role: "Roket pelacak kendali pintar, salvo multi-target & ledakan AOE",
    cost: 195,
    range: 18.5,
    rate: 1.25,
    damage: 58,
    color: "#e65538",
    hotkey: "7",
  },
};

export const ABILITIES: Record<AbilityType, { name: string; role: string; cooldown: number; hotkey: string; color: string }> = {
  airstrike: {
    name: "Airstrike",
    role: "Hujan bom sepanjang jalur",
    cooldown: 25,
    hotkey: "Q",
    color: "#e5bc78",
  },
  orbital: {
    name: "Orbital Laser",
    role: "Sinar panas selama 3 detik",
    cooldown: 36,
    hotkey: "E",
    color: "#77d9e2",
  },
  nuke: {
    name: "Nuke",
    role: "Sapu bersih satu area besar",
    cooldown: 70,
    hotkey: "R",
    color: "#f19668",
  },
};

export type UpgradeId = "ballistics" | "overclock" | "blast" | "arc" | "walls" | "supplies";

export interface UpgradeConfig {
  id: UpgradeId;
  name: string;
  description: string;
  effect: string;
  cost: number;
  color: string;
  category: string;
}

export const UPGRADES: UpgradeConfig[] = [
  {
    id: "ballistics",
    name: "Heavy Rounds",
    description: "Peluru Gunner menghantam lebih keras.",
    effect: "+18% damage Gunner / level",
    cost: 20,
    color: "gold",
    category: "OFFENSE",
  },
  {
    id: "overclock",
    name: "Overclock",
    description: "Seluruh turret menembak lebih cepat.",
    effect: "+13% fire rate / level",
    cost: 26,
    color: "gold",
    category: "OFFENSE",
  },
  {
    id: "blast",
    name: "Bigger Boom",
    description: "Ledakan Mortar & Roket menjangkau lebih luas.",
    effect: "+20% radius Mortar & +18% radius Roket / level",
    cost: 23,
    color: "coral",
    category: "ORDNANCE",
  },
  {
    id: "arc",
    name: "Chain Reaction",
    description: "Petir Tesla melompat lebih jauh.",
    effect: "+2 target Tesla / level (maks. 10)",
    cost: 28,
    color: "cyan",
    category: "ORDNANCE",
  },
  {
    id: "walls",
    name: "Fortified Walls",
    description: "Benteng bertahan lebih lama.",
    effect: "+5 health maksimal / level",
    cost: 22,
    color: "cyan",
    category: "SURVIVAL",
  },
  {
    id: "supplies",
    name: "War Chest",
    description: "Mulai setiap percobaan dengan coin ekstra.",
    effect: "+65 coin awal / level",
    cost: 25,
    color: "coral",
    category: "SURVIVAL",
  },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export interface SelectedTowerInfo {
  id: number;
  type: TowerType;
  level: number;
  hp: number;
  maxHp: number;
  upgradeCost: number;
  sellValue: number;
}

export interface GameSnapshot {
  phase: Phase;
  wave: number;
  bestWave: number;
  trackSeed: number;
  trackName: string;
  trackLength: number;
  weather: WeatherMode;
  cameraZoom: number;
  orcSpeed: number;
  hordeMultiplier: number;
  baseHp: number;
  maxHp: number;
  scrap: number;
  crystals: number;
  kills: number;
  waveKills: number;
  escaped: number;
  spawned: number;
  total: number;
  activeEnemies: number;
  marineCount: number;
  lanePressure: [number, number, number, number];
  towerCount: number;
  towersUnderAttack: number;
  towersLost: number;
  damagedTowers: number;
  repairCost: number | null;
  chainCombo: number;
  selectedType: TowerType | null;
  selectedTower: SelectedTowerInfo | null;
  targeting: AbilityType | null;
  cooldowns: Record<AbilityType, number>;
  missileCooldown: number;
  upgradeLevels: UpgradeLevels;
  paused: boolean;
  speed: number;
  muted: boolean;
  fps: number;
  lastReward: number;
}