import { frequency, type Chord } from "./music";
import { chordIntervals, progressionPosition } from "./harmony";
import {
  clickFrequency,
  drumSteps,
  meterInfo,
  rhythmPatternPosition,
  type MeterId,
  type RhythmPattern,
} from "./rhythm";

export const INSTRUMENTS = [
  { id: "synth", name: "신스", hint: "부드러운 기본 합성음" },
  {
    id: "studio",
    name: "스튜디오",
    hint: "우드 베이스 · 나일론 기타 (불러오는 동안 합성음)",
  },
  {
    id: "live",
    name: "라이브",
    hint: "핑거 베이스 · 재즈 일렉 기타 (불러오는 동안 합성음)",
  },
  {
    id: "street",
    name: "스트리트",
    hint: "우드 베이스 · 스틸 어쿠스틱 기타 (불러오는 동안 합성음)",
  },
  {
    id: "room",
    name: "룸",
    hint: "픽 베이스 · 뮤트 일렉 기타 (불러오는 동안 합성음)",
  },
  {
    id: "piano",
    name: "피아노",
    hint: "우드 베이스 · 그랜드 피아노 (불러오는 동안 합성음)",
  },
] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number]["id"];
type SampledInstrumentId = Exclude<InstrumentId, "synth">;
export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((instrument) => instrument.id === value);
}

// FluidR3_GM (MIT, Frank Wen) 발췌 — public/instruments 참고. 3반음 간격만 담고
// 재생 시 playbackRate 로 사이 음을 보간한다. 파일명 = 각 샘플의 음이름.
type SampleFolder =
  | "upright-bass"
  | "finger-bass"
  | "pick-bass"
  | "nylon-guitar"
  | "jazz-guitar"
  | "steel-guitar"
  | "muted-guitar"
  | "grand-piano";
const BASS_NOTES = ["A1", "C2", "Eb2", "Gb2", "A2", "C3", "Eb3", "Gb3", "A3"];
const GUITAR_NOTES = [
  "C3",
  "Eb3",
  "Gb3",
  "A3",
  "C4",
  "Eb4",
  "Gb4",
  "A4",
  "C5",
  "Eb5",
  "Gb5",
];
const SAMPLE_SET: Record<SampleFolder, { start: number; files: string[] }> = {
  "upright-bass": { start: 33, files: BASS_NOTES },
  "finger-bass": { start: 33, files: BASS_NOTES },
  "pick-bass": { start: 33, files: BASS_NOTES },
  "nylon-guitar": {
    start: 40,
    files: [
      "E2",
      "G2",
      "Bb2",
      "Db3",
      "E3",
      "G3",
      "Bb3",
      "Db4",
      "E4",
      "G4",
      "Bb4",
      "Db5",
      "E5",
      "G5",
      "Bb5",
      "Db6",
      "E6",
    ],
  },
  "jazz-guitar": { start: 48, files: GUITAR_NOTES },
  "steel-guitar": { start: 48, files: GUITAR_NOTES },
  "muted-guitar": { start: 48, files: GUITAR_NOTES },
  "grand-piano": { start: 48, files: GUITAR_NOTES },
};

// 각 음색 엔진이 쓰는 베이스·코드 샘플 폴더. "synth" 는 샘플이 없다.
const ENGINE_FOLDERS: Record<
  SampledInstrumentId,
  { bass: SampleFolder; chord: SampleFolder }
> = {
  studio: { bass: "upright-bass", chord: "nylon-guitar" },
  live: { bass: "finger-bass", chord: "jazz-guitar" },
  street: { bass: "upright-bass", chord: "steel-guitar" },
  room: { bass: "pick-bass", chord: "muted-guitar" },
  piano: { bass: "upright-bass", chord: "grand-piano" },
};

class Sampler {
  private samples: { midi: number; buffer: AudioBuffer }[] = [];
  private loading: Promise<boolean> | null = null;
  ready = false;

  load(ctx: AudioContext, folder: SampleFolder) {
    if (this.ready) return Promise.resolve(true);
    if (!this.loading) {
      const { start, files } = SAMPLE_SET[folder];
      const base = `/instruments/${folder}`;
      this.loading = Promise.all(
        files.map(async (file, i) => {
          const response = await fetch(`${base}/${file}.mp3`);
          if (!response.ok) throw new Error(`sample ${file}`);
          const buffer = await ctx.decodeAudioData(
            await response.arrayBuffer(),
          );
          return { midi: start + i * 3, buffer };
        }),
      )
        .then((loaded) => {
          this.samples = loaded.sort((a, b) => a.midi - b.midi);
          this.ready = true;
          return true;
        })
        .catch(() => {
          this.loading = null;
          return false;
        });
    }
    return this.loading;
  }

  nearest(midi: number) {
    let best = this.samples[0];
    for (const sample of this.samples)
      if (Math.abs(sample.midi - midi) < Math.abs(best.midi - midi))
        best = sample;
    return best;
  }
}

// --- 반주 스타일 -----------------------------------------------------------
// 베이스·코드를 16분음표 격자 위에 어떻게 배치할지 데이터로 기술한다.
// `on` 은 한 박(16분음표 4칸) 안의 위치 목록을 박 인덱스별로 담고,
// `beats` 는 마디 안 어느 박에서 연주할지 고른다. `seq` 는 베이스 음의
// 근음 대비 반음 오프셋을 히트마다 순환시킨다(7 = 5도, 코드에 맞춰 보정).
type BeatSel =
  "all" | "first" | "notfirst" | "even" | "odd" | readonly number[];
export type JamStyle = {
  id: string;
  name: string;
  icon: string;
  detail: readonly [string, string, string];
  bass: {
    on: readonly (readonly number[])[];
    beats: BeatSel;
    seq: readonly number[];
    hold: number;
  };
  chord: {
    on: readonly (readonly number[])[];
    beats: BeatSel;
    hold: number;
    strum: number;
    arp: boolean;
  };
};
export const JAM_STYLES: readonly JamStyle[] = [
  {
    id: "Rock",
    name: "록",
    icon: "Zap",
    detail: ["8비트 드럼", "루트 베이스", "블록 코드"],
    bass: { on: [[0]], beats: "all", seq: [0], hold: 0.85 },
    chord: { on: [[0]], beats: "even", hold: 1.8, strum: 0.012, arp: false },
  },
  {
    id: "Pop",
    name: "팝",
    icon: "Music2",
    detail: ["8비트 드럼", "루트 베이스", "블록 코드"],
    bass: { on: [[0]], beats: "all", seq: [0], hold: 0.85 },
    chord: { on: [[0]], beats: "all", hold: 1.6, strum: 0.012, arp: false },
  },
  {
    id: "Ballad",
    name: "발라드",
    icon: "Headphones",
    detail: ["8비트 드럼", "하프타임 베이스", "서스테인 코드"],
    bass: { on: [[0]], beats: "even", seq: [0], hold: 1.7 },
    chord: { on: [[0]], beats: "first", hold: 3.6, strum: 0.03, arp: false },
  },
  {
    id: "Funk",
    name: "펑크",
    icon: "AudioLines",
    detail: ["16비트 드럼", "루트–5 베이스", "스타카토 코드"],
    bass: { on: [[0]], beats: "all", seq: [0, 7], hold: 0.4 },
    chord: { on: [[0, 2]], beats: "all", hold: 0.3, strum: 0.008, arp: false },
  },
  {
    id: "Bossa",
    name: "보사노바",
    icon: "Palmtree",
    detail: ["보사노바 드럼", "루트–5 베이스", "싱코페이션 코드"],
    bass: { on: [[0]], beats: "all", seq: [0, 7], hold: 0.7 },
    chord: {
      on: [[0, 3], [2], [3], [2]],
      beats: "all",
      hold: 1.4,
      strum: 0.02,
      arp: false,
    },
  },
  {
    id: "Reggae",
    name: "레게",
    icon: "Waves",
    detail: ["원드롭 드럼", "1·3박 베이스", "오프비트 스캥크"],
    bass: { on: [[0]], beats: "even", seq: [0], hold: 0.5 },
    chord: { on: [[2]], beats: "all", hold: 0.16, strum: 0.006, arp: false },
  },
  {
    id: "Shuffle",
    name: "셔플",
    icon: "Dices",
    detail: ["셔플 드럼", "부기 베이스", "2·4박 코드"],
    bass: { on: [[0, 2]], beats: "all", seq: [0, 7, 9, 7], hold: 0.28 },
    chord: { on: [[0]], beats: "odd", hold: 0.5, strum: 0.01, arp: false },
  },
  {
    id: "Swing",
    name: "스윙",
    icon: "Disc3",
    detail: ["스윙 드럼", "워킹 베이스", "2·4박 컴핑"],
    bass: { on: [[0]], beats: "all", seq: [0, 7, 12, 7], hold: 0.9 },
    chord: { on: [[0]], beats: "odd", hold: 0.4, strum: 0.016, arp: false },
  },
  {
    id: "Waltz",
    name: "왈츠",
    icon: "Wind",
    detail: ["3박 드럼", "1박 베이스", "2·3박 코드"],
    bass: { on: [[0]], beats: "first", seq: [0], hold: 0.9 },
    chord: {
      on: [[0]],
      beats: "notfirst",
      hold: 0.8,
      strum: 0.014,
      arp: false,
    },
  },
  {
    id: "Country",
    name: "컨트리",
    icon: "Wheat",
    detail: ["트레인 비트", "붐–칙 베이스", "2·4박 코드"],
    bass: { on: [[0]], beats: "even", seq: [0, 7], hold: 0.6 },
    chord: { on: [[0]], beats: "odd", hold: 0.3, strum: 0.006, arp: false },
  },
  {
    id: "March",
    name: "행진곡",
    icon: "Footprints",
    detail: ["행진 드럼", "오음–파 베이스", "2·4박 코드"],
    bass: { on: [[0]], beats: "all", seq: [0, 7], hold: 0.3 },
    chord: { on: [[0]], beats: "odd", hold: 0.28, strum: 0, arp: false },
  },
  {
    id: "Arpeggio",
    name: "아르페지오",
    icon: "TrendingUp",
    detail: ["8비트 드럼", "하프타임 베이스", "상행 아르페지오"],
    bass: { on: [[0]], beats: "even", seq: [0], hold: 1.2 },
    chord: { on: [[0, 2]], beats: "all", hold: 2.6, strum: 0, arp: true },
  },
] as const;
const STYLE_BY_ID = new Map(JAM_STYLES.map((style) => [style.id, style]));
export function jamStyle(id: string): JamStyle {
  return STYLE_BY_ID.get(id) ?? JAM_STYLES[0];
}
export function isJamStyleId(value: unknown): value is string {
  return typeof value === "string" && STYLE_BY_ID.has(value);
}
function beatMatch(sel: BeatSel, beat: number, barBeats: number): boolean {
  if (sel === "all") return true;
  if (sel === "first") return beat % barBeats === 0;
  if (sel === "notfirst") return beat % barBeats !== 0;
  if (sel === "even") return beat % 2 === 0;
  if (sel === "odd") return beat % 2 === 1;
  return sel.includes(beat % barBeats);
}
/** How many bass/chord hits this style places from the bar start up to `step`. */
function hitIndex(
  on: readonly (readonly number[])[],
  beats: BeatSel,
  barBeats: number,
  step: number,
): number {
  let count = 0;
  for (let s = 0; s < step; s++) {
    const b = Math.floor(s / 4);
    if (
      (on[b % on.length] ?? []).includes(s % 4) &&
      beatMatch(beats, b, barBeats)
    )
      count++;
  }
  return count;
}

export type AudioConfig = {
  bpm: number;
  beats: number;
  timeSignature: MeterId;
  grouping: number[];
  rhythmPresetId: string | null;
  subdivision: number;
  swing: boolean;
  accent: boolean;
  click: boolean;
  rhythmDrums: boolean;
  rhythmTraining: boolean;
  jamTraining: boolean;
  instrument: InstrumentId;
  pattern: number[];
  rhythmPatterns: RhythmPattern[];
  progression: Chord[];
  style: string;
  volumes: {
    master: number;
    drums: number;
    bass: number;
    chords: number;
    click: number;
  };
};

export class PracticeAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private masterVolume = 0.75;
  private timer: ReturnType<typeof setInterval> | null = null;
  private visuals: ReturnType<typeof setTimeout>[] = [];
  private nodes = new Set<AudioScheduledSourceNode>();
  private noise: AudioBuffer | null = null;
  private nextTime = 0;
  private tick = 0;
  private generation = 0;
  private samplers = new Map<SampleFolder, Sampler>();

  private sampler(folder: SampleFolder) {
    let sampler = this.samplers.get(folder);
    if (!sampler) {
      sampler = new Sampler();
      this.samplers.set(folder, sampler);
    }
    return sampler;
  }

  /**
   * Load one sampled instrument engine's two sample sets (bass + chord). Safe to
   * call repeatedly; resolves true once both are decoded, false if a download
   * failed (the engine then keeps using the Karplus–Strong fallback).
   */
  async loadEngine(instrument: InstrumentId) {
    if (instrument === "synth") return true;
    const ctx = await this.ready();
    const folders = ENGINE_FOLDERS[instrument];
    const unique = [...new Set([folders.bass, folders.chord])];
    const loaded = await Promise.all(
      unique.map((folder) => this.sampler(folder).load(ctx, folder)),
    );
    return loaded.every(Boolean);
  }

  async ready() {
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = this.masterVolume;
      // Brick-wall-ish limiter on the master bus: at synth levels it barely
      // engages, but it keeps the louder "studio" samples from clipping when
      // a dense chord and the bass land on the same tick.
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.12;
      this.output.connect(this.limiter).connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  async songOutput() {
    const context = await this.ready();
    return { context, output: this.output! };
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.context && this.output)
      this.output.gain.setTargetAtTime(
        this.masterVolume,
        this.context.currentTime,
        0.015,
      );
  }

  private track(node: AudioScheduledSourceNode) {
    this.nodes.add(node);
    node.onended = () => {
      this.nodes.delete(node);
      node.disconnect();
    };
  }

  private tone(
    freq: number,
    at: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    endFreq?: number,
  ) {
    if (volume <= 0) return;
    const ctx = this.context!;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, at);
    if (endFreq)
      oscillator.frequency.exponentialRampToValueAtTime(
        endFreq,
        at + duration * 0.65,
      );
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(this.output!);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
    this.track(oscillator);
    oscillator.onended = () => {
      this.nodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  /**
   * Karplus–Strong plucked-string voice, rendered offline into a short buffer.
   * Gives the "studio" instrument a more acoustic bass / guitar character while
   * staying asset-free and offline.
   */
  private pluck(
    freq: number,
    at: number,
    duration: number,
    volume: number,
    brightness = 0.5,
  ) {
    if (volume <= 0 || freq <= 0 || !Number.isFinite(freq)) return;
    const ctx = this.context!;
    const sr = ctx.sampleRate;
    const length = Math.max(2, Math.floor((duration + 0.06) * sr));
    const n = Math.min(length - 1, Math.max(2, Math.round(sr / freq)));
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    // Excitation: a noise burst, low-passed by "brightness".
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = brightness * white + (1 - brightness) * last;
      data[i] = last;
    }
    // String loop with a gentle per-sample loss for a natural ~2.4s decay.
    const loss = Math.exp(Math.log(0.05) / (2.4 * sr));
    for (let i = n; i < length; i++)
      data[i] = loss * 0.5 * (data[i - n] + data[i - n + 1]);
    // Attack / release shaping removes clicks at both ends.
    const attack = Math.min(0.004 * sr, length / 2);
    const release = Math.min(0.035 * sr, length / 2);
    for (let i = 0; i < length; i++) {
      if (i < attack) data[i] *= i / attack;
      else if (i > length - release) data[i] *= (length - i) / release;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume * 2.6;
    source.connect(gain).connect(this.output!);
    source.start(at);
    source.stop(at + length / sr + 0.01);
    this.track(source);
    source.onended = () => {
      this.nodes.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }

  /** Play a recorded sample, pitch-shifted from the nearest note in the set. */
  private sample(
    sampler: Sampler,
    freq: number,
    at: number,
    duration: number,
    volume: number,
  ) {
    if (volume <= 0 || freq <= 0 || !Number.isFinite(freq)) return;
    const ctx = this.context!;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const nearest = sampler.nearest(midi);
    if (!nearest) return;
    const source = ctx.createBufferSource();
    source.buffer = nearest.buffer;
    source.playbackRate.value = Math.pow(2, (midi - nearest.midi) / 12);
    const gain = ctx.createGain();
    const hold = Math.min(
      Math.max(0.05, duration),
      nearest.buffer.duration / source.playbackRate.value - 0.05,
    );
    // Recorded notes read quieter than a sustained oscillator at the same peak
    // (they decay), so lift them to match the "synth" engine's loudness.
    gain.gain.setValueAtTime(volume * 2.7, at);
    gain.gain.setValueAtTime(volume * 2.7, at + Math.max(0, hold - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + hold + 0.08);
    source.connect(gain).connect(this.output!);
    source.start(at);
    source.stop(at + hold + 0.12);
    this.track(source);
    source.onended = () => {
      this.nodes.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }

  /** Pitched backing voice: the instrument engine decides the timbre. */
  private voice(
    freq: number,
    at: number,
    duration: number,
    volume: number,
    kind: "bass" | "chord",
    instrument: InstrumentId,
  ) {
    if (instrument !== "synth") {
      const folder = ENGINE_FOLDERS[instrument][kind];
      const sampler = this.samplers.get(folder);
      if (sampler?.ready) this.sample(sampler, freq, at, duration, volume);
      else
        this.pluck(freq, at, duration, volume, kind === "bass" ? 0.32 : 0.55);
      return;
    }
    this.tone(freq, at, duration, volume, "triangle");
  }

  private percussion(at: number, volume: number, snare = false) {
    if (volume <= 0) return;
    const ctx = this.context!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = snare ? 1500 : 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (snare ? 0.15 : 0.04));
    noise.connect(filter).connect(gain).connect(this.output!);
    noise.start(at);
    noise.stop(at + 0.2);
    this.track(noise);
    noise.onended = () => {
      this.nodes.delete(noise);
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  async note(midi: number, instrument: InstrumentId = "synth") {
    const ctx = await this.ready();
    if (instrument !== "synth") {
      const sampler = this.samplers.get(ENGINE_FOLDERS[instrument].chord);
      if (sampler?.ready)
        this.sample(sampler, frequency(midi), ctx.currentTime, 1.6, 0.34);
      else this.pluck(frequency(midi), ctx.currentTime, 1.6, 0.28, 0.5);
      return;
    }
    this.tone(frequency(midi), ctx.currentTime, 1.2, 0.17, "triangle");
    this.tone(frequency(midi) * 2, ctx.currentTime, 0.35, 0.045);
  }

  async previewChord(chord: Chord, instrument: InstrumentId = "synth") {
    const ctx = await this.ready();
    const intervals = chordIntervals(chord);
    if (chord.bass !== undefined)
      this.voice(
        frequency(36 + chord.bass),
        ctx.currentTime,
        1.4,
        0.15,
        "bass",
        instrument,
      );
    intervals.forEach((n, i) =>
      this.voice(
        frequency(48 + chord.root + n),
        ctx.currentTime + i * 0.035,
        1.4,
        0.24 / Math.sqrt(intervals.length),
        "chord",
        instrument,
      ),
    );
  }

  async start(getConfig: () => AudioConfig, onTick: (tick: number) => void) {
    this.stop();
    const generation = this.generation;
    const ctx = await this.ready();
    if (generation !== this.generation) return;
    this.tick = 0;
    this.nextTime = ctx.currentTime + 0.06;
    const schedule = () => {
      if (this.nextTime < ctx.currentTime - 0.1)
        this.nextTime = ctx.currentTime + 0.02;
      while (this.nextTime < ctx.currentTime + 0.1) {
        const c = getConfig();
        const rhythmSequence = c.rhythmTraining
          ? rhythmPatternPosition(c.rhythmPatterns, this.tick)
          : null;
        const rhythmLine = rhythmSequence?.pattern;
        const meter = meterInfo(rhythmLine?.meter ?? c.timeSignature);
        const grouping = rhythmLine?.grouping ?? c.grouping;
        const rhythmPresetId = rhythmLine?.presetId ?? c.rhythmPresetId;
        const rhythmTick = rhythmSequence?.localTick ?? this.tick;
        const step = rhythmTick % meter.steps;
        const beat = Math.floor(step / 4);
        const at = this.nextTime;
        const volume = 1;
        const quarter = 60 / c.bpm;
        const clickPitch = clickFrequency(
          meter.id,
          grouping,
          rhythmTick,
          Math.max(c.subdivision, meter.denominator / 4),
          c.accent,
        );
        if (c.click && clickPitch !== null) {
          this.tone(
            clickPitch,
            at,
            0.035,
            ((volume * c.volumes.click) / 100) * 0.3,
          );
        }
        if (c.jamTraining || (c.rhythmTraining && c.rhythmDrums)) {
          const drum = (volume * c.volumes.drums) / 100;
          const drums = drumSteps(meter.id, grouping, rhythmPresetId, c.style);
          if (drums.hat.includes(step))
            this.percussion(
              at,
              drum * (step % meter.unitTicks === 0 ? 0.16 : 0.08),
            );
          if (drums.kick.includes(step))
            this.tone(140, at, 0.18, drum * 0.55, "sine", 45);
          if (drums.snare.includes(step))
            this.percussion(at, drum * 0.35, true);
        }
        if (c.jamTraining) {
          const position = progressionPosition(
            c.progression,
            c.beats,
            this.tick,
          );
          const chord = position.chord;
          const remaining = (position.remainingTicks / 4) * quarter;
          if (chord) {
            const spec = jamStyle(c.style);
            const barBeats = Math.max(1, c.beats);
            const phase = step % 4;
            const isChordStart = position.localTick === 0;

            const bassPhases = spec.bass.on[beat % spec.bass.on.length] ?? [];
            if (
              isChordStart ||
              (bassPhases.includes(phase) &&
                beatMatch(spec.bass.beats, beat, barBeats))
            ) {
              let motion = 0;
              if (chord.bass === undefined && spec.bass.seq.length > 1) {
                const raw =
                  spec.bass.seq[
                    hitIndex(spec.bass.on, spec.bass.beats, barBeats, step) %
                      spec.bass.seq.length
                  ];
                motion =
                  raw === 7
                    ? (chordIntervals(chord).find((n) =>
                        [6, 7, 8].includes(n),
                      ) ?? 7)
                    : raw;
              }
              this.voice(
                frequency(36 + (chord.bass ?? chord.root) + motion),
                at,
                Math.max(
                  0.05,
                  Math.min(quarter * spec.bass.hold, remaining - 0.02),
                ),
                ((volume * c.volumes.bass) / 100) * 0.35,
                "bass",
                c.instrument,
              );
            }

            const chordPhases =
              spec.chord.on[beat % spec.chord.on.length] ?? [];
            if (
              isChordStart ||
              (chordPhases.includes(phase) &&
                beatMatch(spec.chord.beats, beat, barBeats))
            ) {
              const intervals = chordIntervals(chord);
              if (spec.chord.arp) {
                const idx = hitIndex(
                  spec.chord.on,
                  spec.chord.beats,
                  barBeats,
                  step,
                );
                this.voice(
                  frequency(
                    48 + chord.root + intervals[idx % intervals.length],
                  ),
                  at,
                  Math.max(
                    0.05,
                    Math.min(quarter * spec.chord.hold, remaining - 0.02),
                  ),
                  ((volume * c.volumes.chords) / 100) * 0.4,
                  "chord",
                  c.instrument,
                );
              } else {
                intervals.forEach((n, i) =>
                  this.voice(
                    frequency(48 + chord.root + n),
                    at + i * spec.chord.strum,
                    Math.max(
                      0.05,
                      Math.min(
                        quarter * spec.chord.hold,
                        remaining - i * spec.chord.strum - 0.02,
                      ),
                    ),
                    (((volume * c.volumes.chords) / 100) * 0.3) /
                      Math.sqrt(intervals.length),
                    "chord",
                    c.instrument,
                  ),
                );
              }
            }
          }
        }
        if (c.rhythmTraining && (rhythmLine?.pattern ?? c.pattern)[step]) {
          this.percussion(at, volume * 0.3, true);
          this.tone(180, at, 0.06, volume * 0.15, "triangle");
        }
        const tick = this.tick;
        const timeout = setTimeout(
          () => {
            onTick(tick);
            this.visuals = this.visuals.filter((t) => t !== timeout);
          },
          Math.max(0, (at - ctx.currentTime) * 1000),
        );
        this.visuals.push(timeout);
        this.nextTime +=
          (quarter / 4) * (c.swing ? (this.tick % 2 === 0 ? 1.32 : 0.68) : 1);
        this.tick++;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 25);
  }

  stop() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.visuals.forEach(clearTimeout);
    this.visuals = [];
    this.nodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        /* The source may already have ended. */
      }
    });
    this.nodes.clear();
  }
}
