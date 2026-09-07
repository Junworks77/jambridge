import { CHORD_TYPES, SCALES, type Chord } from "./music";
import { METERS, isMeterId, meterInfo, type MeterId } from "./rhythm";

export const MAX_CHORDS = 128;
export const mod12 = (n: number) => ((n % 12) + 12) % 12;
export const intervalLabel = (n: number) =>
  [
    "1",
    "♭2",
    "2",
    "♭3",
    "3",
    "4",
    "♭5",
    "5",
    "♯5",
    "6",
    "♭7",
    "7",
    "8",
    "♭9",
    "9",
    "♯9",
    "10",
    "11",
    "♯11",
    "12",
    "♭13",
    "13",
    "♭14",
    "14",
    "15",
  ][n] ?? String(n);
export const chordIntervals = (c: Chord) =>
  c.type === "custom" ? c.intervals! : CHORD_TYPES[c.type];
export const chordDuration = (c: Chord, meter: number) => c.beats ?? meter;
export function isChord(value: unknown): value is Chord {
  if (!value || typeof value !== "object") return false;
  const c = value as Chord;
  const pitch = (n: number) => Number.isInteger(n) && n >= 0 && n < 12;
  return (
    pitch(c.root) &&
    typeof c.degree === "string" &&
    c.degree.length <= 40 &&
    (c.bass === undefined || pitch(c.bass)) &&
    (c.beats === undefined ||
      (Number.isFinite(c.beats) &&
        c.beats >= 0.5 &&
        c.beats <= 16 &&
        Number.isInteger(c.beats * 2))) &&
    (c.label === undefined ||
      (typeof c.label === "string" && c.label.length <= 24)) &&
    (c.flat === undefined || typeof c.flat === "boolean") &&
    (c.type === "custom"
      ? Array.isArray(c.intervals) &&
        c.intervals.length >= 2 &&
        c.intervals.length <= 12 &&
        new Set(c.intervals).size === c.intervals.length &&
        c.intervals.every((n) => Number.isInteger(n) && n >= 0 && n <= 24)
      : Object.hasOwn(CHORD_TYPES, c.type))
  );
}
export const isProgression = (value: unknown): value is Chord[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= MAX_CHORDS &&
  value.every(isChord);
export const transposeChord = (c: Chord, semitones: number): Chord => ({
  ...c,
  root: mod12(c.root + semitones),
  ...(c.bass === undefined ? {} : { bass: mod12(c.bass + semitones) }),
});
export function progressionTimeline(chords: Chord[], meter: number) {
  let tick = 0;
  const events = chords.map((chord, index) => {
    const start = tick;
    const duration = chordDuration(chord, meter) * 4;
    tick += duration;
    return {
      chord,
      index,
      start,
      duration,
      bar: Math.floor(start / (meter * 4)) + 1,
      beat: ((start / 4) % meter) + 1,
    };
  });
  return {
    events,
    totalTicks: tick,
    totalBeats: tick / 4,
    bars: Math.ceil(tick / (meter * 4)),
  };
}
export function progressionPosition(
  chords: Chord[],
  meter: number,
  tick: number,
) {
  const timeline = progressionTimeline(chords, meter);
  const loopTick = Math.max(0, tick) % timeline.totalTicks;
  const event = timeline.events.find((e) => loopTick < e.start + e.duration)!;
  return {
    ...event,
    localTick: loopTick - event.start,
    remainingTicks: event.start + event.duration - loopTick,
    loopTick,
  };
}
export function chordDegree(c: Chord, tonic: number) {
  const numeral = [
    "I",
    "♭II",
    "II",
    "♭III",
    "III",
    "IV",
    "♯IV",
    "V",
    "♭VI",
    "VI",
    "♭VII",
    "VII",
  ][mod12(c.root - tonic)];
  const minor = c.type.startsWith("m") && !c.type.startsWith("maj");
  return (
    (minor ? numeral.toLowerCase() : numeral) +
    (c.type === "custom"
      ? "*"
      : c.type === "m"
        ? ""
        : minor
          ? c.type.slice(1)
          : c.type)
  );
}
export function parseProgression(
  text: string,
  tonic: number,
  meter: number,
): Chord[] {
  const aliases: Record<string, string> = {
    M7: "maj7",
    M9: "maj9",
    Δ7: "maj7",
    Δ: "maj7",
    ø: "m7b5",
    ø7: "m7b5",
    "°": "dim",
    "°7": "dim7",
    "+": "aug",
    min: "m",
    min7: "m7",
    maj: "",
  };
  const pitch: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const groups = text.trim().split("|");
  const output: Chord[] = [];
  for (const group of groups) {
    const tokens = group
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!tokens.length)
      throw new Error("빈 마디가 있어요. 마디마다 코드를 입력해 주세요.");
    for (const token of tokens) {
      const match = token.match(
        /^([A-Ga-g])([#b♯♭]?)(.*?)(?:\/([A-Ga-g])([#b♯♭]?))?(?::(\d+(?:\.5)?))?$/,
      );
      if (!match)
        throw new Error(
          `“${token}”을 읽을 수 없어요. 예: Dm9:2, G7(b9):2, Cmaj7/E`,
        );
      const accidental = (s: string) =>
        s === "#" || s === "♯" ? 1 : s === "b" || s === "♭" ? -1 : 0;
      const rawType = match[3]
        .replace(/[()]/g, "")
        .replaceAll("♯", "#")
        .replaceAll("♭", "b");
      const type = aliases[rawType] ?? rawType;
      const chord: Chord = {
        root: mod12(pitch[match[1].toUpperCase()] + accidental(match[2])),
        type,
        degree: "",
        flat: /[b♭]/.test(match[2]),
        beats: match[6]
          ? Number(match[6])
          : groups.length > 1
            ? meter / tokens.length
            : meter,
      };
      if (match[4])
        chord.bass = mod12(
          pitch[match[4].toUpperCase()] + accidental(match[5]),
        );
      if (!isChord(chord))
        throw new Error(
          `“${token}”: 지원하는 코드 종류와 0.5–16박 길이를 확인해 주세요.`,
        );
      chord.degree = chordDegree(chord, tonic);
      output.push(chord);
    }
  }
  if (!isProgression(output))
    throw new Error(`코드는 1–${MAX_CHORDS}개까지 입력할 수 있어요.`);
  return output;
}

export type SavedProgression = {
  id: string;
  name: string;
  root: number;
  scale: string;
  meter: number;
  timeSignature?: MeterId;
  chords: Chord[];
};
export function isSavedProgression(value: unknown): value is SavedProgression {
  if (!value || typeof value !== "object") return false;
  const p = value as SavedProgression;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    p.name.length <= 60 &&
    Number.isInteger(p.root) &&
    p.root >= 0 &&
    p.root < 12 &&
    Object.hasOwn(SCALES, p.scale) &&
    Object.keys(METERS).some(
      (id) => meterInfo(id as MeterId).quarters === p.meter,
    ) &&
    (p.timeSignature === undefined ||
      (isMeterId(p.timeSignature) &&
        meterInfo(p.timeSignature).quarters === p.meter)) &&
    isProgression(p.chords)
  );
}
