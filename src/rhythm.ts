import { RHYTHMS } from "./music";

export const METERS = {
  "2/4": { numerator: 2, denominator: 4, groups: [[1, 1]] },
  "3/4": { numerator: 3, denominator: 4, groups: [[1, 1, 1]] },
  "4/4": { numerator: 4, denominator: 4, groups: [[1, 1, 1, 1]] },
  "5/4": {
    numerator: 5,
    denominator: 4,
    groups: [
      [3, 2],
      [2, 3],
    ],
  },
  "5/8": {
    numerator: 5,
    denominator: 8,
    groups: [
      [3, 2],
      [2, 3],
    ],
  },
  "6/8": { numerator: 6, denominator: 8, groups: [[3, 3]] },
  "7/8": {
    numerator: 7,
    denominator: 8,
    groups: [
      [2, 2, 3],
      [3, 2, 2],
      [2, 3, 2],
    ],
  },
  "9/8": { numerator: 9, denominator: 8, groups: [[3, 3, 3]] },
  "12/8": { numerator: 12, denominator: 8, groups: [[3, 3, 3, 3]] },
} as const;
export type MeterId = keyof typeof METERS;
export const isMeterId = (value: unknown): value is MeterId =>
  typeof value === "string" && Object.hasOwn(METERS, value);
export function meterInfo(id: MeterId) {
  const meter = METERS[id];
  return {
    ...meter,
    id,
    quarters: (meter.numerator * 4) / meter.denominator,
    unitTicks: 16 / meter.denominator,
    steps: (meter.numerator * 16) / meter.denominator,
  };
}
export function meterFromQuarters(quarters: number): MeterId {
  return (
    (Object.keys(METERS) as MeterId[]).find(
      (id) => meterInfo(id).quarters === quarters,
    ) ?? "4/4"
  );
}
export const validGrouping = (value: unknown, id: MeterId): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((n) => Number.isInteger(n) && n > 0) &&
  value.reduce((sum, n) => sum + n, 0) === METERS[id].numerator;
export function groupStarts(
  groups: readonly number[],
  unitTicks: number,
): number[] {
  let next = 0;
  return groups.map((group) => {
    const start = next;
    next += group * unitTicks;
    return start;
  });
}
export function rhythmPosition(
  id: MeterId,
  groups: readonly number[],
  tick: number,
) {
  const meter = meterInfo(id);
  const step = tick < 0 ? -1 : tick % meter.steps;
  const starts = groupStarts(groups, meter.unitTicks);
  return {
    step,
    unit: step < 0 ? -1 : Math.floor(step / meter.unitTicks),
    group: step < 0 ? -1 : starts.filter((start) => step >= start).length - 1,
    groupStart: starts.includes(step),
  };
}
export function fitPattern(value: readonly number[], id: MeterId) {
  return Array.from({ length: meterInfo(id).steps }, (_, i) =>
    value[i] === 1 ? 1 : 0,
  );
}
export const defaultPattern = (id: MeterId) =>
  Array.from({ length: meterInfo(id).steps }, (_, i) => (i % 2 === 0 ? 1 : 0));

export type StrokeDirection = "down" | "up";
export type RhythmPattern = {
  id: string;
  name: string;
  meter: MeterId;
  grouping: number[];
  pattern: number[];
  directions: StrokeDirection[];
  presetId: string | null;
};

export const defaultDirections = (id: MeterId): StrokeDirection[] =>
  Array.from({ length: meterInfo(id).steps }, (_, i) =>
    i % 2 === 0 ? "down" : "up",
  );

export function fitDirections(
  value: readonly unknown[],
  id: MeterId,
): StrokeDirection[] {
  const fallback = defaultDirections(id);
  return fallback.map((direction, i) =>
    value[i] === "down" || value[i] === "up" ? value[i] : direction,
  );
}

export function createRhythmPattern(
  id: string,
  name: string,
  meter: MeterId,
  options: Partial<Omit<RhythmPattern, "id" | "name" | "meter">> = {},
): RhythmPattern {
  const grouping = validGrouping(options.grouping, meter)
    ? [...options.grouping]
    : [...METERS[meter].groups[0]];
  return {
    id,
    name,
    meter,
    grouping,
    pattern: Array.isArray(options.pattern)
      ? fitPattern(options.pattern, meter)
      : defaultPattern(meter),
    directions: Array.isArray(options.directions)
      ? fitDirections(options.directions, meter)
      : defaultDirections(meter),
    presetId: typeof options.presetId === "string" ? options.presetId : null,
  };
}

export function rhythmPatternTimeline(patterns: readonly RhythmPattern[]) {
  const lines = patterns.length
    ? patterns
    : [createRhythmPattern("fallback", "패턴 1", "4/4")];
  const totalTicks = lines.reduce(
    (total, line) => total + meterInfo(line.meter).steps,
    0,
  );
  return { lines, totalTicks };
}

export function rhythmPatternPosition(
  patterns: readonly RhythmPattern[],
  tick: number,
) {
  const { lines, totalTicks } = rhythmPatternTimeline(patterns);
  if (tick < 0)
    return { index: 0, pattern: lines[0], localTick: -1, totalTicks };
  const loopTick = tick % totalTicks;
  let offset = 0;
  for (let index = 0; index < lines.length; index++) {
    const length = meterInfo(lines[index].meter).steps;
    if (loopTick < offset + length)
      return {
        index,
        pattern: lines[index],
        localTick: loopTick - offset,
        totalTicks,
      };
    offset += length;
  }
  return { index: 0, pattern: lines[0], localTick: 0, totalTicks };
}

export const RHYTHM_GENRES = [
  "전체",
  "팝·록",
  "펑크·R&B",
  "재즈·블루스",
  "포크·왈츠",
  "프로그·월드",
] as const;
export type RhythmGenre = (typeof RHYTHM_GENRES)[number];
export type RhythmPreset = {
  id: string;
  name: string;
  genre: RhythmGenre;
  description: string;
  meter: MeterId;
  grouping: number[];
  bpm: number;
  pattern: number[];
  swing: boolean;
  style: string;
  kick: number[];
  snare: number[];
  hat: number[];
};
function preset(
  id: string,
  name: string,
  genre: RhythmGenre,
  meter: MeterId,
  bpm: number,
  hits: number[],
  description: string,
  options: Partial<
    Pick<
      RhythmPreset,
      "grouping" | "swing" | "style" | "kick" | "snare" | "hat"
    >
  > = {},
): RhythmPreset {
  const info = meterInfo(meter),
    grouping = [...(options.grouping ?? info.groups[0])];
  const starts = groupStarts(grouping, info.unitTicks);
  return {
    id,
    name,
    genre,
    meter,
    bpm,
    description,
    grouping,
    pattern: Array.from({ length: info.steps }, (_, i) =>
      hits.includes(i) ? 1 : 0,
    ),
    swing: false,
    style: "Pop",
    kick: starts.filter((_, i) => i % 2 === 0),
    snare: starts.filter((_, i) => i % 2 === 1),
    hat: Array.from({ length: info.steps / 2 }, (_, i) => i * 2),
    ...options,
  };
}
export const RHYTHM_PRESETS: RhythmPreset[] = [
  preset(
    "basic-eight",
    "기본 8비트",
    "팝·록",
    "4/4",
    90,
    RHYTHMS[0].pattern.flatMap((n, i) => (n ? [i] : [])),
    "한 박씩, 리듬의 중심을 잡아요",
    { style: "Rock" },
  ),
  preset(
    "pop-stroke",
    "팝 스트로크",
    "팝·록",
    "4/4",
    100,
    [0, 4, 6, 10, 12, 14],
    "익숙한 팝 반주에 쓰기 좋은 싱코페이션",
  ),
  preset(
    "rock-drive",
    "록 드라이브",
    "팝·록",
    "4/4",
    120,
    [0, 2, 4, 6, 8, 10, 12, 14],
    "일정한 다운 스트로크로 추진력을 만들어 보세요",
    { style: "Rock", kick: [0, 6, 8], snare: [4, 12] },
  ),
  preset(
    "funk-sixteen",
    "16비트 펑크",
    "펑크·R&B",
    "4/4",
    100,
    [0, 3, 4, 6, 7, 10, 12, 14, 15],
    "고스트 구간에서도 손목의 움직임을 유지하세요",
    {
      style: "Funk",
      kick: [0, 6, 10],
      snare: [4, 12],
      hat: Array.from({ length: 16 }, (_, i) => i),
    },
  ),
  preset(
    "rnb-pocket",
    "R&B 그루브",
    "펑크·R&B",
    "4/4",
    78,
    [0, 3, 6, 8, 11, 14],
    "짧고 긴 16분음표를 스윙으로 느껴보세요",
    { style: "Funk", swing: true, kick: [0, 7, 8], snare: [4, 12] },
  ),
  preset(
    "disco",
    "디스코 커팅",
    "펑크·R&B",
    "4/4",
    116,
    [2, 6, 10, 14],
    "매 박의 킥 위에 엇박 스트로크를 얹어보세요",
    { style: "Funk", kick: [0, 4, 8, 12], snare: [4, 12] },
  ),
  preset(
    "jazz-waltz",
    "재즈 왈츠",
    "재즈·블루스",
    "3/4",
    126,
    [0, 3, 4, 7, 8, 10],
    "세 박의 흐름에 가벼운 엇박을 더하세요",
    { swing: true, kick: [0], snare: [8] },
  ),
  preset(
    "slow-blues",
    "슬로 블루스",
    "재즈·블루스",
    "12/8",
    108,
    [0, 4, 6, 10, 12, 16, 18, 22],
    "3개씩 네 묶음. 점4분음표의 큰 박을 느껴보세요",
    { style: "Ballad" },
  ),
  preset(
    "gospel",
    "가스펠 그루브",
    "재즈·블루스",
    "12/8",
    126,
    [0, 2, 4, 6, 10, 12, 14, 16, 18, 22],
    "네 개의 큰 박 위에서 3분할을 고르게 이어보세요",
  ),
  preset(
    "waltz",
    "포크 왈츠",
    "포크·왈츠",
    "3/4",
    84,
    [0, 4, 6, 8, 10],
    "강–약–약, 첫 박을 중심으로 둥글게 연주하세요",
    { style: "Ballad", kick: [0], snare: [4, 8] },
  ),
  preset(
    "folk-six",
    "6/8 포크 발라드",
    "포크·왈츠",
    "6/8",
    96,
    [0, 4, 6, 8, 10],
    "3+3의 두 묶음으로 부드럽게 흔들리는 반주",
    { style: "Ballad" },
  ),
  preset(
    "rock-ballad",
    "12/8 록 발라드",
    "팝·록",
    "12/8",
    90,
    [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
    "12개의 8분음표를 네 개의 큰 박으로 묶어보세요",
    { style: "Ballad" },
  ),
  preset(
    "five-prog",
    "5/8 프로그레시브",
    "프로그·월드",
    "5/8",
    110,
    [0, 2, 4, 6, 8],
    "3+2, 긴 묶음 다음 짧은 묶음으로 돌아오세요",
    { style: "Rock", grouping: [3, 2] },
  ),
  preset(
    "five-folk",
    "5/8 포크 댄스",
    "프로그·월드",
    "5/8",
    100,
    [0, 2, 4, 6, 8, 9],
    "2+3으로 강세를 옮겨 다른 흐름을 느껴보세요",
    { grouping: [2, 3] },
  ),
  preset(
    "seven-prog",
    "7/8 프로그 록",
    "프로그·월드",
    "7/8",
    112,
    [0, 2, 4, 6, 8, 10, 12],
    "2+2+3, 마지막 세 음을 빠뜨리지 않고 연결하세요",
    { style: "Rock", grouping: [2, 2, 3] },
  ),
  preset(
    "seven-world",
    "7/8 월드 그루브",
    "프로그·월드",
    "7/8",
    120,
    [0, 2, 4, 6, 8, 10, 12, 13],
    "3+2+2, 세 음 묶음으로 시작하는 비대칭 리듬",
    { grouping: [3, 2, 2] },
  ),
  preset(
    "nine-world",
    "9/8 트리플 그루브",
    "프로그·월드",
    "9/8",
    126,
    [0, 4, 6, 10, 12, 16],
    "3+3+3, 세 개의 큰 박 안에서 8분음표를 세어보세요",
  ),
];

export function normalizeRhythmState(source: {
  timeSignature?: unknown;
  beats?: unknown;
  grouping?: unknown;
  pattern?: unknown;
  rhythmPresetId?: unknown;
  rhythmPatterns?: unknown;
  activeRhythmPattern?: unknown;
}) {
  const timeSignature = isMeterId(source.timeSignature)
    ? source.timeSignature
    : meterFromQuarters(typeof source.beats === "number" ? source.beats : 4);
  const info = meterInfo(timeSignature);
  const grouping = validGrouping(source.grouping, timeSignature)
    ? [...source.grouping]
    : [...info.groups[0]];
  const pattern =
    Array.isArray(source.pattern) &&
    source.pattern.length > 0 &&
    source.pattern.every((n) => n === 0 || n === 1)
      ? fitPattern(source.pattern, timeSignature)
      : defaultPattern(timeSignature);
  const selected = RHYTHM_PRESETS.find(
    (p) => p.id === source.rhythmPresetId && p.meter === timeSignature,
  );
  const rhythmPatterns = Array.isArray(source.rhythmPatterns)
    ? source.rhythmPatterns.slice(0, 4).flatMap((value, index) => {
        if (!value || typeof value !== "object") return [];
        const line = value as Partial<RhythmPattern>;
        const lineMeter = isMeterId(line.meter) ? line.meter : timeSignature;
        return [
          createRhythmPattern(
            typeof line.id === "string" ? line.id : `pattern-${index + 1}`,
            typeof line.name === "string" && line.name.trim()
              ? line.name
              : `패턴 ${index + 1}`,
            lineMeter,
            {
              grouping: line.grouping,
              pattern: line.pattern,
              directions: line.directions,
              presetId: line.presetId,
            },
          ),
        ];
      })
    : [];
  if (!rhythmPatterns.length)
    rhythmPatterns.push(
      createRhythmPattern("pattern-1", "패턴 1", timeSignature, {
        grouping,
        pattern,
        presetId: selected?.id ?? null,
      }),
    );
  const activeRhythmPattern =
    typeof source.activeRhythmPattern === "number" &&
    Number.isInteger(source.activeRhythmPattern) &&
    source.activeRhythmPattern >= 0 &&
    source.activeRhythmPattern < rhythmPatterns.length
      ? source.activeRhythmPattern
      : 0;
  const active = rhythmPatterns[activeRhythmPattern];
  return {
    timeSignature: active.meter,
    grouping: active.grouping,
    pattern: active.pattern,
    rhythmPresetId: active.presetId,
    rhythmPatterns,
    activeRhythmPattern,
  };
}

export function clickFrequency(
  id: MeterId,
  groups: readonly number[],
  tick: number,
  subdivision: number,
  accent: boolean,
): number | null {
  const info = meterInfo(id),
    pos = rhythmPosition(id, groups, tick);
  const interval = Math.min(info.unitTicks, 4 / subdivision);
  if (pos.step % interval !== 0) return null;
  return accent && pos.step === 0
    ? 1500
    : accent && pos.groupStart
      ? 1250
      : pos.step % info.unitTicks === 0
        ? 1000
        : 750;
}

// 잼플레이 반주 스타일별 4/4 드럼 패턴(16분음표 격자). 리듬 프리셋이 선택되지
// 않은 잼 반주에서만 쓰이며, 4/4 외 박자는 아래 일반 규칙으로 되돌아간다.
const STYLE_DRUMS: Record<
  string,
  { kick: number[]; snare: number[]; hat: number[] }
> = {
  Bossa: {
    kick: [0, 6, 8, 14],
    snare: [3, 10],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  },
  Reggae: { kick: [8], snare: [8], hat: [2, 6, 10, 14] },
  Shuffle: { kick: [0, 8], snare: [4, 12], hat: [0, 3, 4, 7, 8, 11, 12, 15] },
  Swing: { kick: [0], snare: [4, 12], hat: [0, 3, 4, 7, 8, 11, 12, 15] },
  Country: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  March: {
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  },
  Arpeggio: { kick: [0, 8], snare: [4, 12], hat: [0, 4, 8, 12] },
};

export function drumSteps(
  id: MeterId,
  groups: readonly number[],
  presetId: string | null,
  style: string,
) {
  const selected = RHYTHM_PRESETS.find(
    (p) =>
      p.id === presetId &&
      p.meter === id &&
      p.grouping.join("+") === groups.join("+"),
  );
  if (selected)
    return { kick: selected.kick, snare: selected.snare, hat: selected.hat };
  const info = meterInfo(id),
    starts = groupStarts(groups, info.unitTicks);
  if (info.steps === 16 && STYLE_DRUMS[style]) return STYLE_DRUMS[style];
  return {
    kick: starts.filter((_, i) => i % 2 === 0),
    snare: starts.filter((_, i) => i % 2 === 1),
    hat: Array.from(
      { length: style === "Funk" ? info.steps : info.steps / 2 },
      (_, i) => i * (style === "Funk" ? 1 : 2),
    ),
  };
}
