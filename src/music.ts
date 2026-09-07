export const NOTES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const FLATS = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
export const SCALES: Record<
  string,
  { name: string; short: string; intervals: number[]; degrees: string[] }
> = {
  major: {
    name: "Major (Ionian)",
    short: "메이저",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ["1", "2", "3", "4", "5", "6", "7"],
  },
  minor: {
    name: "Natural Minor",
    short: "내추럴 마이너",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ["1", "2", "♭3", "4", "5", "♭6", "♭7"],
  },
  pentatonic: {
    name: "Minor Pentatonic",
    short: "마이너 펜타토닉",
    intervals: [0, 3, 5, 7, 10],
    degrees: ["1", "♭3", "4", "5", "♭7"],
  },
  majorPentatonic: {
    name: "Major Pentatonic",
    short: "메이저 펜타토닉",
    intervals: [0, 2, 4, 7, 9],
    degrees: ["1", "2", "3", "5", "6"],
  },
  dorian: {
    name: "Dorian",
    short: "도리안",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ["1", "2", "♭3", "4", "5", "6", "♭7"],
  },
  blues: {
    name: "Blues",
    short: "블루스",
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ["1", "♭3", "4", "♭5", "5", "♭7"],
  },
};
export const CHORD_TYPES: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "6/9": [0, 4, 7, 9, 14],
  add9: [0, 4, 7, 14],
  mAdd9: [0, 3, 7, 14],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  "11": [0, 4, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 21],
  maj13: [0, 4, 7, 11, 14, 21],
  m13: [0, 3, 7, 10, 14, 21],
  "7b9": [0, 4, 7, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
  "7b5": [0, 4, 6, 10],
  "7#5": [0, 4, 8, 10],
  "9#11": [0, 4, 7, 10, 14, 18],
  "maj7#11": [0, 4, 7, 11, 18],
  mMaj7: [0, 3, 7, 11],
};
export type Chord = {
  root: number;
  type: string;
  degree: string;
  /** Omitted in legacy sessions: one bar at the current meter. */
  beats?: number;
  bass?: number;
  intervals?: number[];
  label?: string;
  flat?: boolean;
};
export const TUNING = [64, 59, 55, 50, 45, 40];
export const CAGED: Record<string, { root: number; frets: (number | null)[] }> =
  {
    C: { root: 0, frets: [0, 1, 0, 2, 3, null] },
    A: { root: 9, frets: [0, 2, 2, 2, 0, null] },
    G: { root: 7, frets: [3, 0, 0, 0, 2, 3] },
    E: { root: 4, frets: [0, 0, 1, 2, 2, 0] },
    D: { root: 2, frets: [2, 3, 2, 0, null, null] },
  };
export const RHYTHMS = [
  {
    name: "기본 8비트",
    subtitle: "한 박씩, 리듬의 중심을 잡아요",
    tag: "BASIC",
    pattern: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  {
    name: "팝 스트로크",
    subtitle: "익숙한 노래에 바로 적용하는 패턴",
    tag: "POP",
    pattern: [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0],
  },
  {
    name: "16비트 그루브",
    subtitle: "다운과 업을 균일하게 이어보세요",
    tag: "GROOVE",
    pattern: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
  },
  {
    name: "싱코페이션",
    subtitle: "엇박에 포인트를 더해보세요",
    tag: "SYNC",
    pattern: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  },
  {
    name: "펑크 커팅",
    subtitle: "짧고 선명하게, 손목은 가볍게",
    tag: "FUNK",
    pattern: [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
  },
];
export function diatonic(root: number, minor: boolean | "dorian"): Chord[] {
  const intervals =
    minor === "dorian"
      ? SCALES.dorian.intervals
      : minor
        ? [0, 2, 3, 5, 7, 8, 10]
        : [0, 2, 4, 5, 7, 9, 11];
  const types =
    minor === "dorian"
      ? ["m", "m", "", "", "m", "dim", ""]
      : minor
        ? ["m", "dim", "", "m", "m", "", ""]
        : ["", "m", "m", "", "", "m", "dim"];
  const degrees =
    minor === "dorian"
      ? ["i", "ii", "III", "IV", "v", "vi°", "VII"]
      : minor
        ? ["i", "ii°", "III", "iv", "v", "VI", "VII"]
        : ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  return intervals.map((n, i) => ({
    root: (root + n) % 12,
    type: types[i],
    degree: degrees[i],
  }));
}
export const chordName = (chord: Chord) => {
  const names = chord.flat ? FLATS : NOTES;
  return (
    names[chord.root] +
    (chord.type === "custom" ? chord.label || "(custom)" : chord.type) +
    (chord.bass !== undefined ? "/" + names[chord.bass] : "")
  );
};
export const frequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
