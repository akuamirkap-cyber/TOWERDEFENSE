export type GameSound =
  | "gunner"
  | "flame"
  | "mortar"
  | "tesla"
  | "laser"
  | "marineShot"
  | "marineSlash"
  | "marineKick"
  | "marineStep"
  | "marineFall"
  | "missile"
  | "rocket"
  | "explosion"
  | "nuke"
  | "collision"
  | "towerHit"
  | "towerBreak"
  | "repair"
  | "place"
  | "start"
  | "orbital"
  | "victory"
  | "defeat";

interface SoundProfile {
  waveform: OscillatorType;
  from: number;
  to: number;
  duration: number;
  tone: number;
  noise: number;
  cutoff: number;
  filter: BiquadFilterType;
  gap: number;
}

const profiles: Record<GameSound, SoundProfile> = {
  gunner: { waveform: "triangle", from: 255, to: 57, duration: 0.115, tone: 0.43, noise: 0.85, cutoff: 2150, filter: "highpass", gap: 38 },
  flame: { waveform: "sawtooth", from: 178, to: 70, duration: 0.27, tone: 0.19, noise: 0.69, cutoff: 1050, filter: "bandpass", gap: 130 },
  mortar: { waveform: "triangle", from: 180, to: 52, duration: 0.33, tone: 0.68, noise: 0.62, cutoff: 760, filter: "lowpass", gap: 100 },
  tesla: { waveform: "sawtooth", from: 940, to: 160, duration: 0.18, tone: 0.25, noise: 0.45, cutoff: 2800, filter: "highpass", gap: 115 },
  laser: { waveform: "sawtooth", from: 1420, to: 120, duration: 0.29, tone: 0.41, noise: 0.27, cutoff: 2250, filter: "bandpass", gap: 145 },
  marineShot: { waveform: "triangle", from: 285, to: 62, duration: 0.135, tone: 0.48, noise: 0.87, cutoff: 2200, filter: "highpass", gap: 38 },
  marineSlash: { waveform: "sawtooth", from: 640, to: 155, duration: 0.28, tone: 0.38, noise: 0.46, cutoff: 1640, filter: "bandpass", gap: 85 },
  marineKick: { waveform: "sine", from: 165, to: 48, duration: 0.34, tone: 0.78, noise: 0.64, cutoff: 820, filter: "lowpass", gap: 100 },
  marineStep: { waveform: "sine", from: 102, to: 37, duration: 0.17, tone: 0.46, noise: 0.28, cutoff: 540, filter: "lowpass", gap: 125 },
  marineFall: { waveform: "sawtooth", from: 230, to: 50, duration: 0.48, tone: 0.58, noise: 0.75, cutoff: 690, filter: "lowpass", gap: 240 },
  missile: { waveform: "triangle", from: 380, to: 78, duration: 0.32, tone: 0.42, noise: 0.57, cutoff: 1100, filter: "lowpass", gap: 170 },
  rocket: { waveform: "sawtooth", from: 840, to: 110, duration: 0.46, tone: 0.72, noise: 1.12, cutoff: 2200, filter: "bandpass", gap: 40 },
  explosion: { waveform: "sine", from: 135, to: 34, duration: 0.52, tone: 0.92, noise: 0.88, cutoff: 920, filter: "lowpass", gap: 70 },
  nuke: { waveform: "sine", from: 85, to: 27, duration: 1.05, tone: 1.0, noise: 1.05, cutoff: 530, filter: "lowpass", gap: 280 },
  collision: { waveform: "triangle", from: 135, to: 58, duration: 0.1, tone: 0.26, noise: 0.4, cutoff: 1550, filter: "bandpass", gap: 110 },
  towerHit: { waveform: "square", from: 210, to: 75, duration: 0.13, tone: 0.23, noise: 0.47, cutoff: 1000, filter: "bandpass", gap: 140 },
  towerBreak: { waveform: "sawtooth", from: 180, to: 39, duration: 0.55, tone: 0.65, noise: 0.8, cutoff: 720, filter: "lowpass", gap: 350 },
  repair: { waveform: "triangle", from: 340, to: 680, duration: 0.22, tone: 0.34, noise: 0.08, cutoff: 1900, filter: "bandpass", gap: 100 },
  place: { waveform: "triangle", from: 440, to: 720, duration: 0.13, tone: 0.4, noise: 0.16, cutoff: 1800, filter: "bandpass", gap: 60 },
  start: { waveform: "triangle", from: 220, to: 410, duration: 0.29, tone: 0.54, noise: 0.22, cutoff: 800, filter: "bandpass", gap: 150 },
  orbital: { waveform: "sawtooth", from: 1050, to: 95, duration: 0.64, tone: 0.36, noise: 0.31, cutoff: 1900, filter: "bandpass", gap: 350 },
  victory: { waveform: "triangle", from: 470, to: 850, duration: 0.48, tone: 0.42, noise: 0.08, cutoff: 2200, filter: "bandpass", gap: 300 },
  defeat: { waveform: "triangle", from: 260, to: 65, duration: 0.6, tone: 0.52, noise: 0.21, cutoff: 720, filter: "lowpass", gap: 300 },
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private lastPlayed: Partial<Record<GameSound, number>> = {};
  private muted = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.27, this.context.currentTime, 0.025);
    }
  }

  private initialize() {
    if (this.context) return this.context;
    const context = new AudioContext();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -19;
    compressor.knee.value = 15;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.16;
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : 0.27;
    master.connect(compressor).connect(context.destination);

    // One reusable noise buffer gives each shot a different starting sample without network assets.
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 7291;
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      samples[index] = ((seed >>> 0) / 2147483648 - 1) * 0.9;
    }
    this.context = context;
    this.noiseBuffer = buffer;
    this.master = master;
    return context;
  }

  public play(name: GameSound, x = 0) {
    if (this.muted) return;
    const nowMs = performance.now();
    const profile = profiles[name];
    if (nowMs - (this.lastPlayed[name] ?? -Infinity) < profile.gap) return;
    this.lastPlayed[name] = nowMs;

    try {
      const context = this.initialize();
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      const jitter = 0.88 + Math.random() * 0.24;
      const pan = context.createStereoPanner();
      pan.pan.value = Math.max(-0.7, Math.min(0.7, x / 72));
      pan.connect(this.master!);

      const tone = context.createOscillator();
      const toneGain = context.createGain();
      tone.type = profile.waveform;
      tone.frequency.setValueAtTime(profile.from * jitter, now);
      tone.frequency.exponentialRampToValueAtTime(Math.max(20, profile.to * jitter), now + profile.duration);
      toneGain.gain.setValueAtTime(0.001, now);
      toneGain.gain.exponentialRampToValueAtTime(profile.tone, now + 0.004);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);
      tone.connect(toneGain).connect(pan);
      tone.start(now);
      tone.stop(now + profile.duration + 0.015);

      if (profile.noise > 0 && this.noiseBuffer) {
        const noise = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const noiseGain = context.createGain();
        noise.buffer = this.noiseBuffer;
        noise.loop = true;
        noise.playbackRate.value = jitter;
        filter.type = profile.filter;
        filter.Q.value = name === "tesla" ? 1.6 : 0.72;
        filter.frequency.setValueAtTime(profile.cutoff, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(110, profile.cutoff * 0.34), now + profile.duration);
        noiseGain.gain.setValueAtTime(0.001, now);
        noiseGain.gain.exponentialRampToValueAtTime(profile.noise, now + 0.003);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);
        noise.connect(filter).connect(noiseGain).connect(pan);
        noise.start(now, Math.random() * 1.2);
        noise.stop(now + profile.duration + 0.012);
      }
    } catch {
      // Browsers without Web Audio continue with silent, fully playable combat.
    }
  }

  public dispose() {
    void this.context?.close();
    this.context = null;
    this.noiseBuffer = null;
    this.master = null;
  }
}