import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bomb,
  Castle,
  ChevronLeft,
  CircleHelp,
  CloudRain,
  Coins,
  Crosshair,
  FastForward,
  Flame,
  Gauge,
  Gem,
  LockKeyhole,
  LocateFixed,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Rocket,
  RotateCw,
  ScanLine,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Snowflake,
  Skull,
  Sparkles,
  Sun,
  Swords,
  Target,
  Trash2,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { GameEngine } from "./game/GameEngine";
import {
  ABILITIES,
  TOWER_ORDER,
  TOWERS,
  UPGRADES,
  type AbilityType,
  type GameSnapshot,
  type TowerType,
  type UpgradeConfig,
  type WeatherMode,
} from "./game/config";

const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
const pad = (value: number) => String(value).padStart(2, "0");

const towerIcons = {
  gunner: Crosshair,
  flame: Flame,
  mortar: Bomb,
  tesla: Zap,
  laser: ScanLine,
  barracks: Swords,
  rocket: Rocket,
};

const arsenalOrder: TowerType[] = ["barracks", ...TOWER_ORDER.filter((type) => type !== "barracks")];

const abilityIcons = {
  airstrike: Wind,
  orbital: ScanLine,
  nuke: Bomb,
};

const upgradeIcons = {
  ballistics: Crosshair,
  overclock: FastForward,
  blast: Bomb,
  arc: Zap,
  walls: Shield,
  supplies: Coins,
};

const initialSnapshot: GameSnapshot = {
  phase: "build",
  wave: 1,
  bestWave: 0,
  trackSeed: 0,
  trackName: "FOUR CORRIDORS",
  trackLength: 370,
  svgMap: false,
  svgRotation: 0,
  weather: "sunny",
  cameraZoom: 1,
  orcSpeed: 1,
  hordeMultiplier: 1,
  baseHp: 20,
  maxHp: 20,
  scrap: 900000,
  crystals: 32,
  kills: 0,
  waveKills: 0,
  escaped: 0,
  spawned: 0,
  total: 800,
  activeEnemies: 0,
  marineCount: 24,
  lanePressure: [0, 0, 0, 0],
  towerCount: 14,
  towersUnderAttack: 0,
  towersLost: 0,
  damagedTowers: 0,
  repairCost: null,
  chainCombo: 0,
  selectedType: "gunner",
  selectedTower: null,
  targeting: null,
  cooldowns: { airstrike: 0, orbital: 0, nuke: 0 },
  missileCooldown: 0,
  upgradeLevels: { ballistics: 0, overclock: 0, blast: 0, arc: 0, walls: 0, supplies: 0 },
  paused: false,
  speed: 1,
  muted: false,
  fps: 60,
  lastReward: 0,
};

function UpgradeNode({
  upgrade,
  level,
  crystals,
  onBuy,
}: {
  upgrade: UpgradeConfig;
  level: number;
  crystals: number;
  onBuy: () => void;
}) {
  const Icon = upgradeIcons[upgrade.id];
  const cost = upgrade.cost * (level + 1);
  const maxed = level >= 3;
  const affordable = crystals >= cost;

  return (
    <button
      type="button"
      className={`upgrade-node upgrade-${upgrade.color} ${maxed ? "is-maxed" : ""} ${!affordable && !maxed ? "is-locked" : ""}`}
      onClick={onBuy}
      disabled={maxed}
    >
      <span className="node-icon"><Icon size={22} strokeWidth={1.7} /></span>
      <span className="node-content">
        <span className="node-topline"><span>{upgrade.name}</span><span>LVL {level}/3</span></span>
        <span className="node-description">{upgrade.description}</span>
        <span className="node-effect">{upgrade.effect}</span>
        <span className="node-levels" aria-label={`Level ${level} dari 3`}>
          {[0, 1, 2].map((index) => <i key={index} className={index < level ? "filled" : ""} />)}
        </span>
      </span>
      <span className="node-price">
        {maxed ? <span className="max-label">MAX</span> : <><Gem size={14} fill="currentColor" />{cost}</>}
      </span>
    </button>
  );
}

export default function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const toastTimer = useRef<number | null>(null);
  const svgInputRef = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<number | null>(null);
  const resumeAfterHelp = useRef(false);
  const [game, setGame] = useState<GameSnapshot>(initialSnapshot);
  const [view, setView] = useState<"field" | "upgrades">("field");
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [flash, setFlash] = useState(false);
  const [webglError, setWebglError] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3100);
  }, []);

  const triggerFlash = useCallback(() => {
    setFlash(false);
    requestAnimationFrame(() => setFlash(true));
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 570);
  }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    try {
      engineRef.current = new GameEngine(stageRef.current, setGame, notify, triggerFlash);
    } catch (error) {
      console.error("WebGL initialization failed:", error);
      setWebglError("WebGL2 tidak tersedia di browser ini. Coba aktifkan akselerasi hardware atau gunakan browser terbaru.");
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, [notify, triggerFlash]);

  useEffect(() => {
    engineRef.current?.setInputEnabled(view === "field" && !helpOpen);
  }, [view, helpOpen]);

  useEffect(() => {
    if (!helpOpen && view !== "upgrades") return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (helpOpen) {
        setHelpOpen(false);
        if (resumeAfterHelp.current) engineRef.current?.togglePause();
        resumeAfterHelp.current = false;
      } else {
        setView("field");
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [helpOpen, view]);

  const showUpgrades = () => {
    if (game.phase === "battle") {
      notify("Upgrade permanen tersedia setelah pertempuran.");
      return;
    }
    setView("upgrades");
  };

  const openHelp = () => {
    resumeAfterHelp.current = game.phase === "battle" && !game.paused;
    if (resumeAfterHelp.current) engineRef.current?.togglePause();
    setHelpOpen(true);
  };

  const closeHelp = () => {
    setHelpOpen(false);
    if (resumeAfterHelp.current) engineRef.current?.togglePause();
    resumeAfterHelp.current = false;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void appRef.current?.requestFullscreen?.();
  };

  const remaining = Math.max(0, game.total - game.waveKills - game.escaped);
  const progress = game.total > 0 ? ((game.waveKills + game.escaped) / game.total) * 100 : 0;
  const isBuild = game.phase === "build";
  const isBattle = game.phase === "battle";
  const isResult = game.phase === "victory" || game.phase === "defeat";

  return (
    <div className="app-shell" ref={appRef}>
      <header className="topbar">
        <div className="brand" aria-label="Sir, We Have an Orc Problem">
          <span className="brand-emblem" aria-hidden="true">
            <svg viewBox="0 0 52 52" fill="none">
              <path d="M7 9h38v19c0 10-7.5 16-19 20C14.5 44 7 38 7 28V9Z" stroke="currentColor" strokeWidth="1.7" />
              <path d="M16 20V15h5v4h10v-4h5v5h3v14l-13 6-13-6V20h3Z" fill="currentColor" />
              <path d="M22 40v-9a4 4 0 0 1 8 0v9" fill="#151d18" />
              <path d="M5 7h42" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
          <span className="brand-words">
            <span>SIR, WE HAVE AN</span>
            <strong>ORC PROBLEM<span className="brand-period">.</span></strong>
          </span>
        </div>

        <nav className="top-nav" aria-label="Navigasi game">
          <button type="button" className={view === "field" ? "active" : ""} onClick={() => setView("field")}>BATTLEFIELD</button>
          <button type="button" className={view === "upgrades" ? "active" : ""} onClick={showUpgrades}>UPGRADE TREE{game.crystals >= 20 && <i className="nav-notification" />}</button>
        </nav>

        <div className="top-actions">
          <div className="resource-counter scrap-counter" title="Coin untuk membeli turret dan memperbaiki marine outpost">
            <span className="resource-icon"><Coins size={17} strokeWidth={1.8} /></span>
            <span className="resource-copy"><small>COINS</small><strong>{number(game.scrap)}</strong></span>
          </div>
          <div className="resource-counter crystal-counter" title="Crystal untuk upgrade permanen">
            <span className="resource-icon"><Gem size={17} strokeWidth={1.9} /></span>
            <span className="resource-copy"><small>CRYSTALS</small><strong>{number(game.crystals)}</strong></span>
          </div>
          <span className="top-divider" />
          <button className="icon-button top-icon" type="button" aria-label={game.muted ? "Nyalakan suara" : "Matikan suara"} title={game.muted ? "Nyalakan suara" : "Matikan suara"} onClick={() => engineRef.current?.toggleMute()}>{game.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <button className="icon-button top-icon" type="button" aria-label="Layar penuh" title="Layar penuh" onClick={toggleFullscreen}><Maximize2 size={17} /></button>
          <button className="icon-button top-icon" type="button" aria-label="Cara bermain" title="Cara bermain" onClick={openHelp}><CircleHelp size={19} /></button>
        </div>
      </header>

      <main className="game-layout">
        <section className="battlefield" aria-label="Medan perang 3D">
          <div className="stage-world" ref={stageRef} />
          <div className="stage-grain" />

          <div className="field-top" aria-hidden="true">
            <span className="sector-label"><span className="sector-cross">+</span> CAMPAIGN <span className="sector-slash">/</span> SECTOR 01</span>
            <span className="map-coordinate">THE GREENWOOD &nbsp; / &nbsp; TENFOLD HORDE</span>
          </div>

          <div className="field-heading">
            <div className="field-kicker"><span className="field-kicker-line" /> {game.trackName} <span className="kicker-index">/ 01</span></div>
            <h1 className={isBuild ? "brand-field-title" : ""}>{isBuild ? <>SIR, WE HAVE AN<br /><em>ORC PROBLEM.</em></> : isBattle ? <>Here they <em>come.</em></> : game.phase === "victory" ? <>Line <em>secured.</em></> : <>The line <em>fell.</em></>}</h1>
            <p>{isBuild ? "Orc berbaris dari barat menuju benteng di timur. Rancang pertahananmu." : isBattle ? "Gelombang orc bergerak dari tepi kiri menuju tepi kanan arena." : "The war is far from over."}</p>
          </div>

          <div className="field-wave" aria-label={`Gelombang ${game.wave}`}><span>{isBuild ? "NEXT WAVE" : isBattle ? "WAVE IN PROGRESS" : "WAVE"}</span><strong>{pad(game.wave)}</strong></div>

          <div className="field-bottom">
            <div className="health-widget"><div className="health-title"><Shield size={15} strokeWidth={1.8} /><span>FORTRESS HEALTH</span></div><div className="health-number"><strong>{pad(game.baseHp)}</strong><span>/ {pad(game.maxHp)}</span></div><div className="health-track"><i style={{ width: `${(game.baseHp / game.maxHp) * 100}%` }} /></div></div>
            <div className="horde-widget"><div className="horde-title"><Skull size={15} strokeWidth={1.8} /><span>THE ORC HORDE</span></div><div className="horde-number"><strong>{number(remaining)}</strong><span>/ {number(game.total)}</span></div><div className="horde-track"><i style={{ width: `${progress}%` }} /></div></div>
          </div>

          <div className="render-status"><i /> WEBGL2 <span className="status-separator">/</span> {game.fps} FPS</div>

          {view === "field" && !isResult && (
            <div className="camera-controls" role="group" aria-label="Kontrol kamera medan perang">
              <button type="button" aria-label="Perbesar peta" title="Perbesar (+)" onClick={() => engineRef.current?.adjustZoom(1)}><ZoomIn size={17} /></button>
              <span className="camera-level" aria-live="off">{Math.round(game.cameraZoom * 100)}%</span>
              <button type="button" aria-label="Perkecil peta" title="Perkecil (-)" onClick={() => engineRef.current?.adjustZoom(-1)}><ZoomOut size={17} /></button>
              <button type="button" aria-label="Pusatkan kamera" title="Pusatkan peta (0)" onClick={() => engineRef.current?.resetCamera()}><LocateFixed size={16} /></button>
            </div>
          )}

          {webglError && <div className="webgl-error"><Castle size={34} /><h2>Medan perang tidak dapat dimuat</h2><p>{webglError}</p></div>}

          {isBattle && game.paused && !helpOpen && view === "field" && (
            <div className="field-overlay pause-overlay"><div className="overlay-eyebrow">BATTLEFIELD / PAUSED</div><h2>Take a breath<span>.</span></h2><p>The orcs aren't going anywhere. Yet.</p><button className="overlay-primary" type="button" onClick={() => engineRef.current?.togglePause()}><Play size={16} fill="currentColor" /> RESUME BATTLE</button></div>
          )}

          {isResult && view === "field" && (
            <div className={`field-overlay result-overlay ${game.phase}`}>
              <div className="overlay-eyebrow">WAVE {pad(game.wave)} / {game.phase === "victory" ? "MISSION COMPLETE" : "DEFENSES OVERRUN"}</div>
              <div className="result-icon">{game.phase === "victory" ? <Shield size={29} strokeWidth={1.4} /> : <Skull size={29} strokeWidth={1.4} />}</div>
              <h2>{game.phase === "victory" ? <>The line <em>held.</em></> : <>They got <em>through.</em></>}</h2>
              <p>{game.phase === "victory" ? "One more wave survived. The next one won't be so kind." : "Every fallen orc still earned crystals. Come back stronger."}</p>
              <div className="result-numbers"><span><strong>{number(game.waveKills)}</strong><small>ORCS STOPPED</small></span><span><strong>{game.phase === "victory" ? `+${game.lastReward}` : number(game.lastReward)}</strong><small>{game.phase === "victory" ? "BONUS CRYSTALS" : "CRYSTALS EARNED"}</small></span></div>
              <div className="result-actions"><button className="overlay-primary" type="button" onClick={() => game.phase === "victory" ? engineRef.current?.nextWave() : engineRef.current?.retry()}>{game.phase === "victory" ? <>NEXT WAVE <ArrowRight size={18} /></> : <><RotateCcw size={17} /> TRY AGAIN</>}</button><button className="overlay-secondary" type="button" onClick={showUpgrades}>UPGRADE TREE <ArrowRight size={16} /></button></div>
            </div>
          )}
          {flash && <div className="nuke-flash" />}
        </section>

        <aside className="control-panel" aria-label="Kontrol permainan">
          <div className="panel-scroll">
            <div className="panel-intro"><div className={`phase-label ${isBattle ? "live" : ""}`}><i /> {isBuild ? "BUILD PHASE" : isBattle ? "LIVE BATTLE" : "AFTER ACTION"}<span> / {pad(game.wave)}</span></div><h2>{isBuild ? <>Set your <em>defenses.</em></> : isBattle ? <>Hold your <em>ground.</em></> : game.phase === "victory" ? <>Well <em>defended.</em></> : <>Fight <em>again.</em></>}</h2><p>{isBuild ? "Pasang Marine Outpost (6) untuk memasok prajurit lapis baja di tiap jalur." : isBattle ? "Marine berpatroli, menembak, menebas gerombolan, dan menendang musuh." : "Gunakan hasil pertempuran untuk menyiapkan pertahanan baru."}</p></div>
            {(isBuild || isBattle) && (
              <div className="director-controls" aria-label="Pengatur serbuan orc">
                <div className="director-title"><SlidersHorizontal size={13} /><span>ATUR SERBUAN</span><small>{isBattle ? "LIVE" : "PERSIAPAN"}</small></div>
                <label className="director-row">
                  <span><Skull size={13} /> Jumlah</span>
                  <input type="range" min="1" max="10" step="0.5" value={game.hordeMultiplier} aria-label="Pengali jumlah orc" onChange={(event) => engineRef.current?.setHordeMultiplier(Number(event.target.value))} />
                  <output>{game.hordeMultiplier.toFixed(1)}x</output>
                </label>
                <label className="director-row">
                  <span><Gauge size={13} /> Kecepatan</span>
                  <input type="range" min="0.75" max="3" step="0.25" value={game.orcSpeed} aria-label="Kecepatan gerak orc" onChange={(event) => engineRef.current?.setOrcSpeed(Number(event.target.value))} />
                  <output>{game.orcSpeed.toFixed(2).replace(/0$/, "")}x</output>
                </label>
                <div className="weather-switcher" role="group" aria-label="Mode cuaca">
                  {([
                    { id: "sunny", label: "CERAH", Icon: Sun },
                    { id: "snow", label: "SALJU", Icon: Snowflake },
                    { id: "rainyNight", label: "HUJAN MALAM", Icon: CloudRain },
                  ] as const).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={game.weather === id ? "weather-option active" : "weather-option"}
                      aria-label={`Mode ${label.toLowerCase()}`}
                      aria-pressed={game.weather === id}
                      onClick={() => engineRef.current?.setWeather(id as WeatherMode)}
                    >
                      <Icon size={13} strokeWidth={1.9} />{label}
                    </button>
                  ))}
                </div>
                <div className="boss-summon-group" role="group" aria-label="Spawn Boss">
                  <button
                    type="button"
                    className="boss-btn hulk-btn"
                    title="Spawn Hulk Boss 3x ukuran normal (H)"
                    onClick={() => {
                      if (isBuild) engineRef.current?.startWave();
                      engineRef.current?.spawnBoss("hulk");
                    }}
                  >
                    <span>🥊 HULK BOSS (3x)</span>
                    <kbd>H</kbd>
                  </button>
                  <button
                    type="button"
                    className="boss-btn super-hulk-btn"
                    title="Spawn Super Hulk Raksasa 10x ukuran normal (J)"
                    onClick={() => {
                      if (isBuild) engineRef.current?.startWave();
                      engineRef.current?.spawnBoss("superHulk");
                    }}
                  >
                    <span>👹 SUPER HULK (10x)</span>
                    <kbd>J</kbd>
                  </button>
                </div>
                {isBuild && (
                  <div className="track-tools">
                    <input
                      ref={svgInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => engineRef.current?.applySvgMap(String(reader.result), game.svgRotation);
                          reader.readAsDataURL(file);
                        }
                        event.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="track-generate svg-upload-btn"
                      onClick={() => svgInputRef.current?.click()}
                      title="Unggah PNG peta: terrain mengikuti gambar, area gelap jadi DINDING yang tidak bisa dilewati orc, jalur orc otomatis mencari jalan"
                    >
                      <span><ScanLine size={13} /> {game.svgMap ? "GANTI PNG PETA" : "PETA DARI PNG"}</span>
                      <small>{game.svgMap ? "aktif" : "png"}<ScanLine size={11} /></small>
                    </button>
                    {game.svgMap && (
                      <button
                        type="button"
                        className="track-generate svg-clear-btn"
                        onClick={() => engineRef.current?.clearSvgMap()}
                        title="Hapus peta gambar, kembali ke peta prosedural"
                      >
                        <span><Trash2 size={13} /> HAPUS PETA</span>
                      </button>
                    )}
                    {game.svgMap && (
                      <button
                        type="button"
                        className="track-generate svg-rotate-btn"
                        onClick={() => engineRef.current?.rotateSvgMap()}
                        title="Putar peta PNG 90° searah jarum jam: jalur orc, collision & terrain ikut dihitung ulang"
                      >
                        <span><RotateCw size={13} /> PUTAR 90°</span>
                      </button>
                    )}
                    <button type="button" className="track-generate" onClick={() => engineRef.current?.generateTrack()} title="Buat empat jalur serangan baru dari barat ke timur (G)">
                      <span><Shuffle size={13} /> GENERATE 4 JALUR</span>
                      <small>{Math.round(game.trackLength)}m<kbd>G</kbd></small>
                    </button>
                  </div>
                )}
              </div>
            )}
            {(isBuild || isBattle) && (
              <div className="front-intel" aria-label="Empat arah serangan">
                {(["BARAT", "UTARA", "TIMUR", "SELATAN"] as const).map((label, index) => (
                  <span key={label} className={isBattle && game.lanePressure[index] > 0 ? "front-hot" : ""}>
                    <small>{label}</small><strong>{isBuild ? "READY" : number(game.lanePressure[index])}</strong>
                  </span>
                ))}
              </div>
            )}
            {isBattle && game.towersUnderAttack > 0 && <div className="tower-attack-alert" role="status"><Shield size={13} /><span>{game.towersUnderAttack} TURRET DISERANG</span></div>}

            {isBuild && (
              <>
                <div className="panel-section-label"><span>YOUR ARSENAL</span><span>{pad(game.towerCount)} TOWERS / {pad(game.marineCount)} MARINES</span></div>
                <div className="tower-list">
                  {arsenalOrder.map((type: TowerType) => {
                    const config = TOWERS[type];
                    const Icon = towerIcons[type];
                    const selected = game.selectedType === type;
                    return (
                      <button type="button" key={type} className={`tower-row ${type === "barracks" ? "marine-row" : ""} ${selected ? "selected" : ""} ${game.scrap < config.cost ? "unaffordable" : ""}`} style={{ "--item-color": config.color } as CSSProperties} onClick={() => engineRef.current?.selectTowerType(type)} aria-pressed={selected}>
                        <span className="tower-icon"><Icon size={22} strokeWidth={1.65} /></span>
                        <span className="tower-copy"><strong>{config.name}</strong><small>{config.role}</small></span>
                        <span className="tower-right"><kbd>{config.hotkey}</kbd><span><i className="coin-mark" />{config.cost}</span></span>
                      </button>
                    );
                  })}
                </div>
                {game.selectedTower && (
                  <div className="tower-inspector"><div className="inspector-heading"><span><Target size={14} /> SELECTED TURRET</span><button type="button" aria-label="Tutup detail turret" onClick={() => engineRef.current?.selectTowerType(game.selectedTower!.type)}><X size={15} /></button></div><div className="inspector-title"><strong>{TOWERS[game.selectedTower.type].name}</strong><span>LV. {game.selectedTower.level}</span></div><div className="tower-health-label"><span>STRUKTUR</span><strong>{game.selectedTower.hp} / {game.selectedTower.maxHp}</strong></div><div className="tower-health-track"><i style={{ width: `${game.selectedTower.hp / game.selectedTower.maxHp * 100}%` }} /></div>{game.selectedTower.type === "barracks" && <div className="marine-supply-note"><Swords size={13} /> {game.selectedTower.level + 1} marine / outpost. Upgrade menambah 1 prajurit.</div>}
{game.selectedTower.type === "rocket" && (
  <div className="rocket-spec-box">
    <div className="rocket-spec-title">
      <Rocket size={13} />
      <span>SALVO GUIDED MISSILE LV.{game.selectedTower.level}</span>
    </div>
    <div className="rocket-spec-desc">
      {game.selectedTower.level === 1 && "Melontarkan 1 roket pelacak berat berpemandu radar dengan hulu ledak berdaya hancur tinggi."}
      {game.selectedTower.level === 2 && "Salvo ganda! 2 roket meluncur bergantian dari pod kiri & kanan dengan recoil hidrolik."}
      {game.selectedTower.level === 3 && "Salvo 3 roket berat beruntun! Daya hancur area masif yang meratakan gerombolan zombie."}
    </div>
    <div className="rocket-pill-row">
      <span className="rocket-pill"><Target size={11} /> Lock-on Otomatis</span>
      <span className="rocket-pill"><Bomb size={11} /> 3.6m AOE Blast</span>
      <span className="rocket-pill"><Sparkles size={11} /> Smart Retargeting</span>
    </div>
  </div>
)}<div className="inspector-actions"><button type="button" className="inspector-upgrade" disabled={game.selectedTower.level >= 3 || game.scrap < game.selectedTower.upgradeCost} onClick={() => engineRef.current?.upgradeSelectedTower()}>{game.selectedTower.level >= 3 ? "MAX" : "UPGRADE"}<span>{game.selectedTower.level >= 3 ? "" : game.selectedTower.upgradeCost}</span></button>{game.selectedTower.hp < game.selectedTower.maxHp && <button type="button" className="inspector-repair" disabled={game.scrap < (game.repairCost ?? 0)} title="Perbaiki turret" onClick={() => engineRef.current?.repairTower()}><Shield size={15} /> {game.repairCost}</button>}<button type="button" className="inspector-sell" title={`Jual seharga ${game.selectedTower.sellValue} coin`} onClick={() => engineRef.current?.sellSelectedTower()}><Trash2 size={16} /></button></div></div>
                )}
                <div className="panel-small-note"><MousePointer2 size={15} /><span>Klik turret untuk upgrade. Klik kanan untuk menjual.</span></div>
              </>
            )}

            {isBattle && (
              <>
                <div className="panel-section-label"><span>FIELD COMMAND</span><span>ACTIVE ABILITIES</span></div>
                <div className="ability-list">
                  {(Object.keys(ABILITIES) as AbilityType[]).map((ability) => {
                    const config = ABILITIES[ability];
                    const Icon = abilityIcons[ability];
                    const cooldown = game.cooldowns[ability];
                    return (
                      <button type="button" key={ability} className={`ability-row ${game.targeting === ability ? "selected" : ""} ${cooldown > 0 ? "on-cooldown" : ""}`} style={{ "--item-color": config.color } as CSSProperties} onClick={() => engineRef.current?.selectAbility(ability)} aria-pressed={game.targeting === ability}>
                        <span className="ability-icon"><Icon size={22} strokeWidth={1.6} /></span><span className="ability-copy"><strong>{config.name}</strong><small>{config.role}</small></span><span className="ability-right"><kbd>{config.hotkey}</kbd><small>{cooldown > 0 ? `${Math.ceil(cooldown)}s` : "READY"}</small></span>{cooldown > 0 && <i className="ability-cooldown-fill" style={{ height: `${(cooldown / config.cooldown) * 100}%` }} />}
                      </button>
                    );
                  })}
                </div>
                <div className="missile-note"><span className="missile-symbol"><Crosshair size={19} /></span><div><strong>Manual Missile</strong><small>{game.missileCooldown > 0 ? `Reloading ${game.missileCooldown.toFixed(1)}s` : "Klik medan untuk menembak"}</small></div><span className="missile-ready">{game.missileCooldown > 0 ? "..." : "READY"}</span></div>
                {game.damagedTowers > 0 && <div className="field-repair-row"><div><strong>{game.selectedTower && game.selectedTower.hp < game.selectedTower.maxHp ? TOWERS[game.selectedTower.type].name : `${game.damagedTowers} TURRET RUSAK`}</strong><small>{game.selectedTower && game.selectedTower.hp < game.selectedTower.maxHp ? `${game.selectedTower.hp}/${game.selectedTower.maxHp} HP` : "Perbaiki yang paling rusak"}</small></div><button type="button" disabled={game.repairCost === null || game.scrap < game.repairCost} onClick={() => engineRef.current?.repairTower()}><Shield size={14} /> REPAIR <span>{game.repairCost}</span><kbd>T</kbd></button></div>}
                {game.marineCount > 0 && <div className="marine-roster"><Swords size={13} /><span>MARINE SUPPORT</span><strong>{game.marineCount} ACTIVE</strong></div>}
                <div className="battle-tally"><div><span>ORCS ELIMINATED</span><strong>{number(game.waveKills)}</strong></div><div><span>TURRET HANCUR</span><strong>{pad(game.towersLost)}</strong></div></div>
                {game.chainCombo >= 3 && <div className="chain-combo" aria-live="off"><Zap size={15} /> CHAIN REACTION <strong>x{game.chainCombo}</strong></div>}
              </>
            )}

            {isResult && (
              <div className="after-action"><div className="panel-section-label"><span>BATTLE REPORT</span><span>SECTOR 01</span></div><div className="report-row"><span>Orcs eliminated</span><strong>{number(game.waveKills)}</strong></div><div className="report-row"><span>Fortress health</span><strong>{pad(game.baseHp)} / {pad(game.maxHp)}</strong></div><div className="report-row"><span>Total kills</span><strong>{number(game.kills)}</strong></div><div className="report-row"><span>Best wave</span><strong>{pad(game.bestWave)}</strong></div><button className="report-upgrade" type="button" onClick={showUpgrades}><Sparkles size={16} /> SPEND YOUR CRYSTALS <ArrowRight size={16} /></button></div>
            )}
          </div>

          <div className="panel-footer">
            {isBuild ? <button className="launch-button" type="button" onClick={() => engineRef.current?.startWave()}><span className="launch-icon"><Play size={18} fill="currentColor" /></span><span>START THE WAVE<small>Let the orcs come.</small></span><kbd>SPACE</kbd></button> : isBattle ? <div className="battle-buttons"><button className="pause-button" type="button" onClick={() => engineRef.current?.togglePause()}>{game.paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}{game.paused ? "RESUME" : "PAUSE"}<kbd>SPACE</kbd></button><button className={`speed-button ${game.speed === 2 ? "active" : ""}`} type="button" title="Ubah kecepatan (F)" onClick={() => engineRef.current?.toggleSpeed()}><FastForward size={16} />{game.speed}x</button></div> : <button className="launch-button" type="button" onClick={() => game.phase === "victory" ? engineRef.current?.nextWave() : engineRef.current?.retry()}><span className="launch-icon">{game.phase === "victory" ? <ArrowRight size={20} /> : <RotateCcw size={18} />}</span><span>{game.phase === "victory" ? "NEXT WAVE" : "TRY AGAIN"}<small>One more round.</small></span><kbd>SPACE</kbd></button>}
            <div className="panel-footer-bottom"><span><i /> {isBattle ? "HOLD THE LINE" : "DEFENSES READY"}</span><span>WEBGL / {game.fps} FPS</span></div>
          </div>
        </aside>

        {view === "upgrades" && (
          <section className="upgrade-screen" aria-label="Pohon upgrade permanen">
            <div className="upgrade-ambient ambient-one" /><div className="upgrade-ambient ambient-two" />
            <div className="upgrade-inner">
              <div className="upgrade-header"><div className="upgrade-head-left"><button type="button" className="back-link" onClick={() => setView("field")}><ChevronLeft size={17} /> BACK TO BATTLEFIELD</button><div className="upgrade-kicker">THE WAR ROOM <span>/</span> PERMANENT UPGRADES</div><h1>Every run makes us <em>stronger.</em></h1><p>Win or lose, every battle brings us closer. Spend crystals to turn the tide.</p></div><div className="upgrade-wallet"><Gem size={24} fill="currentColor" /><span><small>AVAILABLE CRYSTALS</small><strong>{number(game.crystals)}</strong></span></div></div>
              <div className="tree-root"><span className="root-symbol"><Castle size={23} strokeWidth={1.45} /></span><span><small>YOUR DEFENSE</small><strong>THE LAST LINE</strong></span><i /></div>
              <div className="tree-stem"><i /></div>
              <div className="upgrade-branches">{["OFFENSE", "ORDNANCE", "SURVIVAL"].map((category, index) => <div className={`upgrade-branch branch-${index}`} key={category}><div className="branch-heading"><span>0{index + 1} / {category}</span><i /></div><div className="branch-nodes">{UPGRADES.filter((upgrade) => upgrade.category === category).map((upgrade) => <UpgradeNode key={upgrade.id} upgrade={upgrade} level={game.upgradeLevels[upgrade.id]} crystals={game.crystals} onBuy={() => engineRef.current?.buyUpgrade(upgrade.id)} />)}</div></div>)}</div>
              <div className="upgrade-bottom"><span><LockKeyhole size={14} /> UPGRADES ARE SAVED AUTOMATICALLY</span><span>BEST WAVE REACHED <strong>{pad(game.bestWave)}</strong></span></div>
            </div>
          </section>
        )}
      </main>

      {toast && <div className="global-toast" role="status"><span />{toast}</div>}

      {helpOpen && (
        <div className="help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHelp(); }}>
          <div className="help-dialog" role="dialog" aria-modal="true" aria-label="Cara bermain">
            <div className="help-top">
              <div><span>FIELD MANUAL / 01</span><h2>How to hold the line<span>.</span></h2></div>
              <button type="button" aria-label="Tutup petunjuk" onClick={closeHelp}><X size={20} /></button>
            </div>
              <p className="help-lead">Benteng berada di tepi kanan arena. Horde orc berbaris dari tepi kiri menuju benteng lewat empat jalur. Amati jalur yang paling terancam, lalu tempatkan turret di rutenya.</p>
            <div className="help-columns">
              <div className="help-group">
                <span className="help-group-title">01 / BANGUN PERTAHANAN</span>
                <div><kbd>1-7</kbd><span>Pilih turret, termasuk Rocket Battery (7) pencari zombie & Marine (6)</span></div>
                <div><kbd>CLICK</kbd><span>Letakkan atau pilih turret</span></div>
                <div><kbd>G</kbd><span>Buat ulang empat jalur dari barat ke timur</span></div>
                <div><kbd>PNG</kbd><span>Unggah PNG peta: terrain mengikuti gambar, area gelap jadi dinding solid</span></div>
                <div><kbd>DRAG</kbd><span>Geser peta; klik kanan singkat menjual turret</span></div>
                <div><kbd>SPACE</kbd><span>Mulai gelombang</span></div>
              </div>
              <div className="help-group">
                <span className="help-group-title">02 / PERTEMPURAN & BOSS</span>
                <div><kbd>WHEEL</kbd><span>Zoom; cubit dua jari di layar sentuh</span></div>
                <div><kbd>+ - 0</kbd><span>Perbesar, perkecil, pusatkan kamera</span></div>
                <div><kbd>CLICK</kbd><span>Tembakkan misil manual; marine menembak, menebas & menendang</span></div>
                <div><kbd>H / J</kbd><span>Spawn Hulk Boss (3x) atau 10x Super Hulk Raksasa</span></div>
                <div><kbd>Q E R</kbd><span>Airstrike, orbital laser, atau nuke</span></div>
                <div><kbd>T / F</kbd><span>Perbaiki turret; F untuk 2x kecepatan</span></div>
              </div>
            </div>
            <div className="help-foot">
              <span><Gem size={16} /> Awal game tiap jalur dijaga 3 marine di kanan & kiri (total 24 prajurit). Hulk & Super Hulk memiliki nyawa tebal, kebal knockback, dan gebukan mematikan yang mementalkan prajurit hingga meledak!</span>
              <button type="button" onClick={closeHelp}>I'M READY <ArrowRight size={17} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}