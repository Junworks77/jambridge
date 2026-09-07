import CollapsiblePanel from "./CollapsiblePanel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Dices,
  Disc3,
  Drum,
  Footprints,
  Guitar,
  Headphones,
  Keyboard,
  Layers3,
  Maximize2,
  Menu,
  Minus,
  Music2,
  Palmtree,
  Pause,
  Piano,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Save,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  Waves,
  Wheat,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  CAGED,
  CHORD_TYPES,
  FLATS,
  NOTES,
  SCALES,
  TUNING,
  chordName,
  diatonic,
  formatTime,
  type Chord,
} from "./music";
import {
  INSTRUMENTS,
  JAM_STYLES,
  PracticeAudio,
  isInstrumentId,
  isJamStyleId,
  jamStyle,
  type AudioConfig,
  type InstrumentId,
} from "./audio";
import JamHarmony from "./JamHarmony";
import RhythmPresets from "./RhythmPresets";
import {
  METERS,
  RHYTHM_PRESETS,
  createRhythmPattern,
  defaultPattern,
  defaultDirections,
  fitPattern,
  fitDirections,
  groupStarts,
  isMeterId,
  meterFromQuarters,
  meterInfo,
  normalizeRhythmState,
  rhythmPosition,
  rhythmPatternPosition,
  type MeterId,
  type RhythmPattern,
  type RhythmPreset,
} from "./rhythm";
import {
  chordIntervals,
  isProgression,
  intervalLabel,
  progressionPosition,
  progressionTimeline,
  transposeChord,
} from "./harmony";
import { msUntilNextLocalDay, practiceDateKey } from "./practice";
import TabStudio, { useTabSong } from "./TabStudio";
import type { SongSession } from "./tablature";

type Page = "fretboard" | "rhythm" | "jam" | "metronome" | "tab";
function Metronome({
  size = 20,
  strokeWidth = 1.7,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h6l5 18H4L9 3Z" />
      <path d="m11 16 6-10M8 17h8M11 7h2M10 10h2" />
      <path d="m15.5 7 3 1" />
    </svg>
  );
}
type Session = {
  tabSong?: SongSession;
  id: number;
  name: string;
  root: number;
  scale: string;
  bpm: number;
  beats: number;
  timeSignature?: MeterId;
  grouping?: number[];
  rhythmPresetId?: string | null;
  click?: boolean;
  rhythmDrums?: boolean;
  rhythmTraining?: boolean;
  jamTraining?: boolean;
  swing?: boolean;
  accent?: boolean;
  subdivision?: number;
  boardTabTone?: boolean;
  rhythmPatterns?: RhythmPattern[];
  activeRhythmPattern?: number;
  progression: Chord[];
  style: string;
  instrument?: InstrumentId;
  pattern: number[];
  volumes: AudioConfig["volumes"];
};
const NAV = [
  {
    id: "fretboard" as Page,
    title: "프렛보드",
    english: "FRETBOARD",
    icon: Guitar,
    description: "손끝으로 익히는 나만의 음악 지도",
  },
  {
    id: "rhythm" as Page,
    title: "리듬훈련",
    english: "RHYTHM TRAINING",
    icon: Activity,
    description: "정확한 박자에서 시작되는 좋은 그루브",
  },
  {
    id: "jam" as Page,
    title: "잼플레이",
    english: "JAM PLAY",
    icon: AudioLines,
    description: "나만의 밴드와 함께, 자유롭게 연주하세요",
  },
  {
    id: "metronome" as Page,
    title: "메트로놈",
    english: "METRONOME",
    icon: Metronome,
    description: "흔들림 없는 박자, 차곡차곡 쌓이는 실력",
  },
  {
    id: "tab" as Page,
    title: "타브생성",
    english: "TAB STUDIO",
    icon: Music2,
    description: "곡을 나누고, 손에 맞는 타브로 연습하세요",
  },
];
function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
const defaultProgression = diatonic(0, false);
const defaultRhythmPattern = createRhythmPattern("pattern-1", "패턴 1", "4/4", {
  grouping: [1, 1, 1, 1],
  pattern: RHYTHM_PRESETS[0].pattern,
  presetId: "basic-eight",
});
const DAILY_GOAL_MINUTES = [10, 20, 30, 45, 60] as const;
type DailyGoalMinutes = (typeof DAILY_GOAL_MINUTES)[number];
const COLOR_TONES = [
  { id: "blue", name: "Blue", hex: "#066fd1" },
  { id: "azure", name: "Azure", hex: "#4299e1" },
  { id: "indigo", name: "Indigo", hex: "#4263eb" },
  { id: "purple", name: "Purple", hex: "#ae3ec9" },
  { id: "pink", name: "Pink", hex: "#d6336c" },
  { id: "red", name: "Red", hex: "#d63939" },
  { id: "orange", name: "Orange", hex: "#f76707" },
  { id: "yellow", name: "Yellow", hex: "#f59f00" },
  { id: "lime", name: "Lime", hex: "#74b816" },
  { id: "green", name: "Green", hex: "#2fb344" },
  { id: "teal", name: "Teal", hex: "#0ca678" },
  { id: "cyan", name: "Cyan", hex: "#17a2b8" },
  { id: "white", name: "White", hex: "#f8f9fa" },
  { id: "black", name: "Black", hex: "#212529" },
  { id: "dark-gray", name: "DarkGray", hex: "#495057" },
] as const;
type ColorToneId = (typeof COLOR_TONES)[number]["id"];
const THEME_MODES = ["dark", "light"] as const;
type ThemeMode = (typeof THEME_MODES)[number];
function isColorToneId(value: unknown): value is ColorToneId {
  return COLOR_TONES.some((tone) => tone.id === value);
}
function isThemeMode(value: unknown): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value as string);
}
function isDailyGoalMinutes(value: unknown): value is DailyGoalMinutes {
  return (
    typeof value === "number" &&
    (DAILY_GOAL_MINUTES as readonly number[]).includes(value)
  );
}
const STYLE_ICONS: Record<string, typeof Zap> = {
  Zap,
  Music2,
  Headphones,
  AudioLines,
  Palmtree,
  Waves,
  Dices,
  Disc3,
  Wind,
  Wheat,
  Footprints,
  TrendingUp,
};
const defaults = {
  root: 0,
  scale: "major",
  bpm: 90,
  beats: 4,
  progression: [
    defaultProgression[5],
    defaultProgression[3],
    defaultProgression[0],
    defaultProgression[4],
  ],
  style: "Rock",
  instrument: "synth" as InstrumentId,
  pattern: defaultRhythmPattern.pattern,
  timeSignature: "4/4" as MeterId,
  grouping: [1, 1, 1, 1],
  rhythmPresetId: "basic-eight" as string | null,
  rhythmPatterns: [defaultRhythmPattern],
  activeRhythmPattern: 0,
  click: true,
  rhythmDrums: false,
  rhythmTraining: false,
  jamTraining: false,
  swing: false,
  accent: true,
  subdivision: 1,
  boardTabTone: true,
  dailyGoalMinutes: 20 as DailyGoalMinutes,
  colorTone: "white" as ColorToneId,
  themeMode: "dark" as ThemeMode,
  volumes: { master: 75, drums: 65, bass: 60, chords: 50, click: 60 },
};
function getInitial() {
  const stored = readStorage("jambrigde-settings", defaults);
  if (
    !stored ||
    !SCALES[stored.scale] ||
    !Number.isFinite(stored.bpm) ||
    stored.bpm < 30 ||
    stored.bpm > 240 ||
    !Number.isInteger(stored.root) ||
    stored.root < 0 ||
    stored.root > 11 ||
    !Object.keys(METERS).some(
      (id) => meterInfo(id as MeterId).quarters === stored.beats,
    ) ||
    !isProgression(stored.progression) ||
    !Array.isArray(stored.pattern) ||
    !stored.volumes
  )
    return defaults;
  return {
    ...defaults,
    ...stored,
    dailyGoalMinutes: isDailyGoalMinutes(stored.dailyGoalMinutes)
      ? stored.dailyGoalMinutes
      : defaults.dailyGoalMinutes,
    boardTabTone:
      typeof stored.boardTabTone === "boolean"
        ? stored.boardTabTone
        : defaults.boardTabTone,
    colorTone: isColorToneId(stored.colorTone)
      ? stored.colorTone
      : defaults.colorTone,
    themeMode: isThemeMode(stored.themeMode)
      ? stored.themeMode
      : defaults.themeMode,
    instrument: isInstrumentId(stored.instrument)
      ? stored.instrument
      : defaults.instrument,
    style: isJamStyleId(stored.style) ? stored.style : defaults.style,
    ...normalizeRhythmState(stored),
  };
}
function Select({
  label,
  value,
  onChange,
  children,
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`select-wrap ${className}`}>
      <span>{label}</span>
      <div>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {children}
        </select>
        <ChevronDown size={14} />
      </div>
    </label>
  );
}
function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      className={`toggle ${value ? "on" : ""}`}
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
function TempoInput({
  value,
  onChange,
  id,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      inputMode="numeric"
      min="30"
      max="240"
      value={draft}
      onFocus={(e) => {
        editing.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next !== "" && Number(next) >= 30 && Number(next) <= 240)
          onChange(Number(next));
      }}
      onBlur={() => {
        editing.current = false;
        const next =
          draft.trim() === ""
            ? value
            : Math.max(30, Math.min(240, Math.round(Number(draft))));
        onChange(next);
        setDraft(String(next));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function App() {
  const [initial] = useState(getInitial);
  const [page, setPage] = useState<Page>("fretboard");
  const [audioPage, setAudioPage] = useState<Page>("fretboard");
  const [root, setRoot] = useState(initial.root);
  const [scale, setScale] = useState(initial.scale);
  const [bpm, setBpm] = useState(initial.bpm);
  const [timeSignature, setTimeSignature] = useState<MeterId>(
    initial.timeSignature,
  );
  const meter = meterInfo(timeSignature);
  const beats = meter.quarters;
  const [grouping, setGrouping] = useState<number[]>(initial.grouping);
  const groupingKey = grouping.join("+");
  const [rhythmPresetId, setRhythmPresetId] = useState<string | null>(
    initial.rhythmPresetId,
  );
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const [progression, setProgression] = useState<Chord[]>(initial.progression);
  const [style, setStyle] = useState(initial.style);
  const [pattern, setPattern] = useState<number[]>(initial.pattern);
  const [rhythmPatterns, setRhythmPatterns] = useState<RhythmPattern[]>(
    initial.rhythmPatterns,
  );
  const [activeRhythmPattern, setActiveRhythmPattern] = useState(
    initial.activeRhythmPattern,
  );
  const [volumes, setVolumes] = useState(initial.volumes);
  const [playing, setPlaying] = useState(false);
  const [songMode, setSongMode] = useState(false);
  const [tick, setTick] = useState(-1);
  const [click, setClick] = useState(initial.click);
  const [rhythmDrums, setRhythmDrums] = useState(initial.rhythmDrums);
  const [rhythmTraining, setRhythmTraining] = useState(initial.rhythmTraining);
  const [jamTraining, setJamTraining] = useState(initial.jamTraining);
  const [instrument, setInstrument] = useState<InstrumentId>(
    initial.instrument,
  );
  const [loadingEngine, setLoadingEngine] = useState<InstrumentId | null>(null);
  const [readyEngines, setReadyEngines] = useState<InstrumentId[]>([]);
  const [swing, setSwing] = useState(initial.swing);
  const [accent, setAccent] = useState(initial.accent);
  const [subdivision, setSubdivision] = useState(initial.subdivision);
  const [boardTabTone, setBoardTabTone] = useState(initial.boardTabTone);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<DailyGoalMinutes>(
    initial.dailyGoalMinutes,
  );
  const [colorTone, setColorTone] = useState<ColorToneId>(initial.colorTone);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initial.themeMode);
  const effectiveSubdivision = Math.max(subdivision, meter.denominator / 4);
  const [mode, setMode] = useState("scale");
  const [chordType, setChordType] = useState("");
  const [shape, setShape] = useState("C");
  const [notation, setNotation] = useState("notes");
  const [flat, setFlat] = useState(false);
  const [frets, setFrets] = useState(12);
  const [rootsOnly, setRootsOnly] = useState(false);
  const [fretHighlights, setFretHighlights] = useState({
    root: true,
    scale: true,
    jam: true,
    key: true,
  });
  const [activeNote, setActiveNote] = useState("");
  const [modal, setModal] = useState<
    "help" | "sessions" | "save" | "colorTone" | null
  >(null);
  const [sessionName, setSessionName] = useState("나의 기타 연습");
  const [sessions, setSessions] = useState<Session[]>(() => {
    const items = readStorage<Session[]>("jambrigde-sessions", []);
    return Array.isArray(items)
      ? items.filter(
          (s) =>
            s &&
            typeof s.name === "string" &&
            SCALES[s.scale] &&
            isProgression(s.progression),
        )
      : [];
  });
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingChord, setEditingChord] = useState<number | null>(null);
  const [tapResult, setTapResult] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [tabFretboardVisible, setTabFretboardVisible] = useState(false);
  const [initialPractice] = useState(() => {
    const day = practiceDateKey();
    return { day, seconds: readStorage(`jambrigde-time-${day}`, 0) };
  });
  const [practiceDay, setPracticeDay] = useState(initialPractice.day);
  const [seconds, setSeconds] = useState(initialPractice.seconds);
  const goalSeconds = dailyGoalMinutes * 60;
  const [audio] = useState(() => new PracticeAudio());
  const song = useTabSong({
    audio,
    playing,
    songMode,
    setPlaying,
    setSongMode,
  });
  const tapTimes = useRef<number[]>([]);
  const lastBeat = useRef(0);
  const rhythmScroller = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const config = useRef<AudioConfig>(null!);
  config.current = {
    bpm,
    beats,
    timeSignature,
    grouping,
    rhythmPresetId,
    click,
    rhythmDrums,
    rhythmTraining,
    jamTraining,
    instrument,
    swing,
    accent,
    subdivision: effectiveSubdivision,
    pattern,
    rhythmPatterns,
    progression,
    style,
    volumes,
  };
  const selectedNav = NAV.find((n) => n.id === page)!;
  const activeColorTone = COLOR_TONES.find((tone) => tone.id === colorTone)!;
  const themeAccent =
    themeMode === "light" && colorTone === "white"
      ? "#64748b"
      : themeMode === "dark" && colorTone === "black"
        ? "#a8b0ba"
        : activeColorTone.hex;
  const names = flat ? FLATS : NOTES;
  const selectedScale = SCALES[scale];
  const minor = ["minor", "pentatonic", "dorian", "blues"].includes(scale);
  const palette = diatonic(root, scale === "dorian" ? "dorian" : minor);
  const rhythmPlayback = rhythmPatternPosition(rhythmPatterns, tick);
  // A co-play tool is "playing" only while the transport runs AND its
  // playback-controls toggle is on. Those toggles double as each screen's
  // play/stop state so the two always stay in sync.
  const jamActive = playing && !songMode && jamTraining;
  const rhythmActive = playing && !songMode && rhythmTraining;
  const clickActive = playing && !songMode && click;
  const activeTools = (
    [
      ["jam", jamActive],
      ["rhythm", rhythmActive],
      ["metronome", clickActive],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([id]) => id);
  const rhythmTimelineActive = rhythmTraining;
  const currentRhythmPatternIndex =
    rhythmTimelineActive && tick >= 0
      ? rhythmPlayback.index
      : activeRhythmPattern;
  const currentRhythmPattern =
    rhythmPatterns[currentRhythmPatternIndex] ?? rhythmPlayback.pattern;
  const currentRhythmMeter = meterInfo(currentRhythmPattern.meter);
  const transportMeter =
    rhythmTimelineActive && tick >= 0 ? currentRhythmMeter : meter;
  const transportGrouping =
    rhythmTimelineActive && tick >= 0
      ? currentRhythmPattern.grouping
      : grouping;
  const transportSignature =
    rhythmTimelineActive && tick >= 0
      ? currentRhythmPattern.meter
      : timeSignature;
  const rhythmState = rhythmPosition(
    currentRhythmPattern.meter,
    currentRhythmPattern.grouping,
    rhythmTimelineActive ? rhythmPlayback.localTick : tick,
  );
  const currentBeat = rhythmState.unit;
  const selectedRhythm = RHYTHM_PRESETS.find((p) => p.id === rhythmPresetId);
  const rhythmModified =
    selectedRhythm &&
    (pattern.some((n, i) => n !== selectedRhythm.pattern[i]) ||
      groupingKey !== selectedRhythm.grouping.join("+") ||
      rhythmPatterns[activeRhythmPattern]?.directions.some(
        (direction, i) => direction !== defaultDirections(timeSignature)[i],
      ));
  const rhythmStarts = groupStarts(grouping, meter.unitTicks);
  // Freeze the Jam Play position whenever jam is not the active layer so the
  // fretboard chord tones stay on the last played chord (even if the rhythm
  // or metronome layer keeps the transport running).
  const jamFreezeTick = useRef(-1);
  useEffect(() => {
    if (jamActive && tick >= 0) jamFreezeTick.current = tick;
  }, [jamActive, tick]);
  const jamTick = jamActive ? tick : jamFreezeTick.current;
  const currentBar = progressionPosition(progression, beats, jamTick).index;
  const progressionBars = progressionTimeline(progression, beats).bars;
  const currentStep = rhythmState.step;
  const activeJamChord = progression[currentBar] ?? progression[0];
  const activeJamIntervals = chordIntervals(activeJamChord);
  const activeJamTones = new Set(
    activeJamIntervals.map(
      (interval) => (activeJamChord.root + interval + 120) % 12,
    ),
  );
  const activeJamToneNames = activeJamIntervals.map(
    (interval) => names[(activeJamChord.root + interval) % 12],
  );
  const keyChordType = minor ? "m" : "";
  const keyChordIntervals = CHORD_TYPES[keyChordType];
  const keyChordTones = new Set(
    keyChordIntervals.map((interval) => (root + interval) % 12),
  );
  const keyChordName = `${names[root]}${keyChordType}`;

  useEffect(() => {
    if (!playing || page !== "rhythm" || currentRhythmMeter.steps <= 16) return;
    const scroller = rhythmScroller.current;
    const active = scroller?.querySelector<HTMLElement>(".rhythm-step.current");
    if (!scroller || !active) return;
    const bounds = scroller.getBoundingClientRect(),
      note = active.getBoundingClientRect();
    if (note.right > bounds.right - 14)
      scroller.scrollLeft += note.right - bounds.right + 14;
    else if (note.left < bounds.left + 14)
      scroller.scrollLeft += note.left - bounds.left - 14;
  }, [
    currentRhythmPatternIndex,
    currentStep,
    playing,
    page,
    currentRhythmMeter.steps,
  ]);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3300);
  }, []);
  const navigate = useCallback(
    (next: Page) => {
      setPage(next);
      if (next === "tab") {
        if (!songMode) setPlaying(false);
        setSongMode(true);
      } else if (next !== "fretboard") {
        setAudioPage(next);
        setSongMode(false);
        if (songMode) setPlaying(false);
      }
      setSidebarOpen(false);
      setEditingChord(null);
    },
    [songMode],
  );
  // Each co-play tool ("rhythm" | "jam" | "metronome") is toggled from both the
  // transport-bar checkbox and the matching screen's play/stop button.
  const coPlay = {
    rhythm: [rhythmTraining, setRhythmTraining],
    jam: [jamTraining, setJamTraining],
    metronome: [click, setClick],
  } as const;
  type CoPlayTool = keyof typeof coPlay;
  const pageTool = (target: Page): CoPlayTool | null =>
    target === "rhythm" || target === "jam" || target === "metronome"
      ? target
      : null;
  const toggleTool = (tool: CoPlayTool) => {
    if (songMode) {
      setSongMode(false);
      coPlay[tool][1](true);
      setPlaying(true);
      return;
    }
    const [on, setOn] = coPlay[tool];
    if (on) {
      setOn(false);
      const stillPlaying = (Object.keys(coPlay) as CoPlayTool[]).some(
        (other) => other !== tool && coPlay[other][0],
      );
      if (!stillPlaying) setPlaying(false);
    } else {
      setOn(true);
      setPlaying(true);
    }
  };
  const startTransport = () => {
    if (songMode || page === "tab") {
      song.play();
      return;
    }
    const tool = pageTool(page) ?? pageTool(audioPage);
    if (tool) coPlay[tool][1](true);
    setPlaying(true);
  };
  const toggleTransport = () => {
    if (playing) setPlaying(false);
    else startTransport();
  };
  const toggleTransportRef = useRef(toggleTransport);
  toggleTransportRef.current = toggleTransport;
  const changeRoot = (next: number) => {
    const difference = next - root;
    setRoot(next);
    setProgression((p) => p.map((c) => transposeChord(c, difference)));
  };
  const changeScale = (next: string) => {
    setScale(next);
    const nextPalette = diatonic(
      root,
      next === "dorian"
        ? "dorian"
        : ["minor", "pentatonic", "blues"].includes(next),
    );
    setProgression((p) =>
      p.map((c) => {
        const index = palette.findIndex(
          (pc) => pc.root === c.root && pc.type === c.type,
        );
        return index >= 0
          ? {
              ...transposeChord(c, nextPalette[index].root - c.root),
              ...nextPalette[index],
            }
          : c;
      }),
    );
  };
  const updateBpm = useCallback(
    (value: number) => setBpm(Math.max(30, Math.min(240, Math.round(value)))),
    [],
  );
  const tapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimes.current;
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      const value = 60000 / ((now - taps[0]) / (taps.length - 1));
      updateBpm(value);
      setTapResult(`${taps.length}회 탭 · 템포 반영됨`);
    } else setTapResult("한 번 더 탭해 주세요");
  }, [updateBpm]);

  useEffect(() => {
    audio.setMasterVolume(volumes.master / 100);
  }, [audio, volumes.master]);
  const loadEngineSamples = useCallback(
    (id: InstrumentId) => {
      if (id === "synth" || readyEngines.includes(id)) return;
      setLoadingEngine(id);
      audio.loadEngine(id).then((ok) => {
        setLoadingEngine((current) => (current === id ? null : current));
        if (ok)
          setReadyEngines((list) => (list.includes(id) ? list : [...list, id]));
        else notify("음색 샘플을 불러오지 못해 합성음으로 재생해요.");
      });
    },
    [audio, notify, readyEngines],
  );
  useEffect(() => {
    // Fallback preload once real playback starts (the first gesture guarantees
    // the AudioContext can run); the picker button covers the common case.
    if (
      playing &&
      instrument !== "synth" &&
      !readyEngines.includes(instrument) &&
      loadingEngine !== instrument
    )
      loadEngineSamples(instrument);
  }, [playing, instrument, readyEngines, loadingEngine, loadEngineSamples]);
  useEffect(() => {
    if (playing && !songMode) {
      setTick(-1);
      audio
        .start(
          () => config.current,
          (next) => {
            setTick(next);
            const rhythmLine = rhythmPatternPosition(
              config.current.rhythmPatterns,
              next,
            );
            if (
              config.current.rhythmTraining &&
              rhythmLine.localTick %
                meterInfo(rhythmLine.pattern.meter).unitTicks ===
                0
            )
              lastBeat.current = performance.now();
          },
        )
        .catch(() => {
          setPlaying(false);
          notify("소리를 시작하지 못했어요. 재생 버튼을 다시 눌러주세요.");
        });
    } else {
      audio.stop();
    }
    return () => audio.stop();
  }, [
    playing,
    songMode,
    audio,
    notify,
    timeSignature,
    groupingKey,
    playbackRevision,
  ]);
  useEffect(() => {
    if (!playing || (songMode && song.buffering)) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [playing, songMode, song.buffering]);
  useEffect(() => {
    const resetIfNewDay = () => {
      const nextDay = practiceDateKey();
      if (nextDay === practiceDay) return;
      setPracticeDay(nextDay);
      setSeconds(0);
    };
    const midnightTimer = window.setTimeout(
      resetIfNewDay,
      msUntilNextLocalDay(),
    );
    const dayCheck = window.setInterval(resetIfNewDay, 60_000);
    return () => {
      window.clearTimeout(midnightTimer);
      window.clearInterval(dayCheck);
    };
  }, [practiceDay]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "jambrigde-settings",
        JSON.stringify({
          root,
          scale,
          bpm,
          beats,
          timeSignature,
          grouping,
          rhythmPresetId,
          rhythmPatterns,
          activeRhythmPattern,
          click,
          rhythmDrums,
          rhythmTraining,
          jamTraining,
          swing,
          accent,
          subdivision,
          boardTabTone,
          dailyGoalMinutes,
          colorTone,
          themeMode,
          progression,
          style,
          instrument,
          pattern,
          volumes,
        }),
      );
    } catch {
      /* Practice is available without browser storage. */
    }
  }, [
    root,
    scale,
    bpm,
    beats,
    progression,
    style,
    instrument,
    pattern,
    volumes,
    timeSignature,
    groupingKey,
    rhythmPresetId,
    rhythmPatterns,
    activeRhythmPattern,
    click,
    rhythmDrums,
    rhythmTraining,
    jamTraining,
    swing,
    accent,
    subdivision,
    boardTabTone,
    dailyGoalMinutes,
    colorTone,
    themeMode,
  ]);
  useEffect(() => {
    try {
      localStorage.setItem(
        `jambrigde-time-${practiceDay}`,
        JSON.stringify(seconds),
      );
    } catch {
      /* Optional history. */
    }
  }, [practiceDay, seconds]);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(noteTimer.current);
    },
    [],
  );
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setEditingChord(null);
        setSidebarOpen(false);
        setExpanded(false);
      }
      if (
        (event.target as HTMLElement).closest(
          'input, select, textarea, button, [role="button"]',
        ) ||
        modal
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        toggleTransportRef.current();
      }
      if (event.code === "KeyT") tapTempo();
      if (["1", "2", "3", "4", "5"].includes(event.key))
        navigate(NAV[Number(event.key) - 1].id);
      if (event.key === "ArrowUp") {
        event.preventDefault();
        updateBpm(config.current.bpm + 1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        updateBpm(config.current.bpm - 1);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [modal, navigate, tapTempo, updateBpm]);

  const playNote = (midi: number, id: string) => {
    audio
      .note(midi, instrument)
      .catch(() => notify("오디오를 사용할 수 없는 브라우저입니다."));
    setActiveNote(id);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setActiveNote(""), 700);
  };
  // "지판 타브 음 출력": while a song plays, sound each tab note as it lights up
  // on the fretboard (tab studio and the fretboard screen share this playback).
  const soundedTabNotes = useRef<Set<string>>(new Set());
  useEffect(() => {
    const notes = song.visibleNotes;
    if (!songMode || !playing || !boardTabTone) {
      soundedTabNotes.current.clear();
      return;
    }
    const position = song.position;
    const active = notes.filter(
      (n) =>
        n.string !== null &&
        n.fret !== null &&
        n.start <= position &&
        n.end > position,
    );
    const activeIds = new Set(active.map((n) => n.id));
    for (const id of soundedTabNotes.current)
      if (!activeIds.has(id)) soundedTabNotes.current.delete(id);
    for (const note of active) {
      if (soundedTabNotes.current.has(note.id)) continue;
      soundedTabNotes.current.add(note.id);
      audio.note(note.midi, instrument).catch(() => {});
    }
  }, [
    songMode,
    playing,
    boardTabTone,
    song.visibleNotes,
    song.position,
    audio,
    instrument,
  ]);
  const saveSession = () => {
    if (!sessionName.trim()) return;
    const session: Session = {
      id: Date.now(),
      name: sessionName.trim(),
      tabSong: song.session,
      root,
      scale,
      bpm,
      beats,
      timeSignature,
      grouping,
      rhythmPresetId,
      rhythmPatterns,
      activeRhythmPattern,
      click,
      rhythmDrums,
      rhythmTraining,
      jamTraining,
      swing,
      accent,
      subdivision,
      boardTabTone,
      progression,
      style,
      instrument,
      pattern,
      volumes,
    };
    const next = [session, ...sessions].slice(0, 20);
    try {
      localStorage.setItem("jambrigde-sessions", JSON.stringify(next));
      setSessions(next);
      setModal(null);
      notify("연습 세션을 저장했어요. 내 보관함에서 이어갈 수 있어요.");
    } catch {
      notify("브라우저 저장 공간이 부족해 저장하지 못했어요.");
    }
  };
  const loadSession = (session: Session) => {
    setPlaying(false);
    setSongMode(false);
    if (session.tabSong) void song.open(session.tabSong.id, session.tabSong);
    setAudioPage(page);
    setRoot(session.root);
    setScale(session.scale);
    setBpm(session.bpm);
    const restored = normalizeRhythmState(session);
    setTimeSignature(restored.timeSignature);
    setGrouping(restored.grouping);
    setRhythmPresetId(restored.rhythmPresetId);
    setRhythmPatterns(restored.rhythmPatterns);
    setActiveRhythmPattern(restored.activeRhythmPattern);
    setClick(session.click ?? true);
    setRhythmDrums(session.rhythmDrums ?? false);
    setRhythmTraining(session.rhythmTraining ?? false);
    setJamTraining(session.jamTraining ?? false);
    setInstrument(
      isInstrumentId(session.instrument) ? session.instrument : "synth",
    );
    setSwing(session.swing ?? false);
    setAccent(session.accent ?? true);
    setSubdivision(session.subdivision ?? 1);
    setBoardTabTone(session.boardTabTone ?? true);
    setProgression(session.progression);
    setStyle(isJamStyleId(session.style) ? session.style : "Rock");
    setPattern(restored.pattern);
    setVolumes(session.volumes);
    setModal(null);
    notify(`“${session.name}” 세션을 불러왔어요.`);
  };
  function updateRhythmPattern(index: number, changes: Partial<RhythmPattern>) {
    const current = rhythmPatterns[index];
    if (!current) return;
    const next = { ...current, ...changes };
    setRhythmPatterns((lines) =>
      lines.map((line, lineIndex) => (lineIndex === index ? next : line)),
    );
    if (index !== activeRhythmPattern) return;
    setTimeSignature(next.meter);
    setGrouping([...next.grouping]);
    setPattern([...next.pattern]);
    setRhythmPresetId(next.presetId);
  }
  function selectRhythmPattern(index: number) {
    const next = rhythmPatterns[index];
    if (!next) return;
    setActiveRhythmPattern(index);
    setTimeSignature(next.meter);
    setGrouping([...next.grouping]);
    setPattern([...next.pattern]);
    setRhythmPresetId(next.presetId);
    setPlaybackRevision((value) => value + 1);
  }
  function togglePatternHit(index: number, step: number) {
    const line = rhythmPatterns[index];
    if (!line) return;
    updateRhythmPattern(index, {
      pattern: line.pattern.map((value, lineStep) =>
        lineStep === step ? 1 - value : value,
      ),
    });
  }
  function toggleStrokeDirection(index: number, step: number) {
    const line = rhythmPatterns[index];
    if (!line) return;
    updateRhythmPattern(index, {
      directions: line.directions.map((direction, lineStep) =>
        lineStep === step ? (direction === "down" ? "up" : "down") : direction,
      ),
    });
  }
  function addRhythmPattern() {
    const line = createRhythmPattern(
      `pattern-${Date.now()}`,
      `패턴 ${rhythmPatterns.length + 1}`,
      timeSignature,
      { grouping: [...grouping] },
    );
    setRhythmPatterns((lines) => [...lines, line]);
    setActiveRhythmPattern(rhythmPatterns.length);
    setTimeSignature(line.meter);
    setGrouping([...line.grouping]);
    setPattern([...line.pattern]);
    setRhythmPresetId(line.presetId);
    setPlaybackRevision((value) => value + 1);
  }
  function removeRhythmPattern(index: number) {
    if (rhythmPatterns.length === 1) return;
    const next = rhythmPatterns.filter((_, lineIndex) => lineIndex !== index);
    const nextIndex = Math.min(
      index === activeRhythmPattern ? index : activeRhythmPattern,
      next.length - 1,
    );
    setRhythmPatterns(next);
    setActiveRhythmPattern(nextIndex);
    const active = next[nextIndex];
    setTimeSignature(active.meter);
    setGrouping([...active.grouping]);
    setPattern([...active.pattern]);
    setRhythmPresetId(active.presetId);
  }
  function changeMeter(id: MeterId) {
    const line = rhythmPatterns[activeRhythmPattern];
    if (!line) return;
    updateRhythmPattern(activeRhythmPattern, {
      meter: id,
      grouping: [...METERS[id].groups[0]],
      pattern: fitPattern(line.pattern, id),
      directions: fitDirections(line.directions, id),
      presetId: null,
    });
    setTapResult("");
  }
  function applyRhythmPreset(preset: RhythmPreset) {
    updateRhythmPattern(activeRhythmPattern, {
      meter: preset.meter,
      grouping: [...preset.grouping],
      pattern: [...preset.pattern],
      directions: defaultDirections(preset.meter),
      presetId: preset.id,
    });
    setBpm(preset.bpm);
    setSwing(preset.swing);
    setRhythmDrums(true);
    setClick(true);
    setStyle(preset.style);
    setSubdivision(METERS[preset.meter].denominator / 4);
    setPlaybackRevision((v) => v + 1);
    setTapResult("");
    notify(
      `${preset.name} · ${preset.meter} · ♩ ${preset.bpm} BPM을 적용했어요.`,
    );
  }

  const renderFretboard = (compact = false) => {
    const baseIntervals =
      mode === "scale"
        ? selectedScale.intervals
        : mode === "chord"
          ? CHORD_TYPES[chordType].map((n) => n % 12)
          : CHORD_TYPES[""];
    const showJamTones = mode !== "caged";
    const intervals = Array.from(
      new Set([
        ...baseIntervals,
        ...(showJamTones
          ? [
              ...Array.from(activeJamTones, (tone) => (tone - root + 12) % 12),
              ...Array.from(keyChordTones, (tone) => (tone - root + 12) % 12),
            ]
          : []),
      ]),
    );
    const shapeData = CAGED[shape];
    const shift = (root - shapeData.root + 12) % 12;
    const width = 1120;
    const nut = 76;
    const cell = (width - nut - 18) / frets;
    return (
      <div className={`fretboard-scroll ${compact ? "compact" : ""}`}>
        <svg
          className="fretboard"
          viewBox={`0 0 ${width} 252`}
          aria-label={`${NOTES[root]} ${mode === "scale" ? selectedScale.name : mode === "chord" ? chordType + " 코드" : shape + " CAGED 폼"} 프렛보드 · 잼 코드 ${chordName(activeJamChord)} 코드톤 강조`}
        >
          <defs>
            <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#302d27" />
              <stop offset="0.48" stopColor="#282620" />
              <stop offset="1" stopColor="#322e27" />
            </linearGradient>
          </defs>
          <rect
            x={nut}
            y="12"
            width={width - nut - 18}
            height="206"
            fill="url(#wood)"
            rx="4"
          />
          {Array.from({ length: 19 }, (_, i) => (
            <path
              key={`grain${i}`}
              d={`M ${nut} ${20 + i * 10} Q 500 ${16 + i * 10} ${width - 18} ${20 + i * 10}`}
              fill="none"
              stroke="#bfa989"
              strokeWidth="0.5"
              opacity="0.035"
            />
          ))}
          {Array.from({ length: frets }, (_, f) => {
            const fret = f + 1;
            const x = nut + (f + 0.5) * cell;
            return (
              <g key={f}>
                <line
                  x1={nut + (f + 1) * cell}
                  y1="12"
                  x2={nut + (f + 1) * cell}
                  y2="218"
                  stroke="#686157"
                  strokeWidth="1.7"
                />
                {[3, 5, 7, 9, 15, 17, 19, 21].includes(fret) && (
                  <circle cx={x} cy="115" r="6" fill="#767165" opacity="0.35" />
                )}
                {fret === 12 && (
                  <>
                    <circle
                      cx={x}
                      cy="82"
                      r="6"
                      fill="#767165"
                      opacity="0.45"
                    />
                    <circle
                      cx={x}
                      cy="148"
                      r="6"
                      fill="#767165"
                      opacity="0.45"
                    />
                  </>
                )}
                <text
                  className={`fret-number ${fret === 12 ? "octave" : ""}`}
                  x={x}
                  y="244"
                  textAnchor="middle"
                >
                  {fret}
                </text>
              </g>
            );
          })}
          <rect
            x={nut - 3}
            y="12"
            width="6"
            height="206"
            rx="1"
            fill="#b5af99"
          />
          {(songMode && song.project
            ? song.project.settings.tuning
            : TUNING
          ).map((midi, string) => {
            const y = 32 + string * 33;
            return (
              <g key={string}>
                <text x="11" y={y + 4} className="string-label">
                  {NOTES[midi % 12]}
                </text>
                <line
                  x1="39"
                  y1={y}
                  x2={width - 18}
                  y2={y}
                  stroke="#aaa18d"
                  strokeWidth={0.6 + string * 0.22}
                  opacity={0.45 + string * 0.07}
                />
                {Array.from({ length: frets + 1 }, (_, fret) => {
                  const note = (midi + fret) % 12;
                  const isSongNote =
                    songMode &&
                    song.visibleNotes.some(
                      (n) =>
                        n.string === string &&
                        n.fret === fret &&
                        n.start <= song.position &&
                        n.end > song.position,
                    );
                  const interval = (note - root + 12) % 12;
                  const isRoot = interval === 0;
                  const isScaleTone = baseIntervals.includes(interval);
                  const isJamTone = showJamTones && activeJamTones.has(note);
                  const isJamRoot = isJamTone && note === activeJamChord.root;
                  const isKeyTone = showJamTones && keyChordTones.has(note);
                  const isKeyRoot = isKeyTone && note === root;
                  const highlightedCodeTone =
                    (fretHighlights.jam && isJamTone) ||
                    (fretHighlights.key && isKeyTone);
                  if (
                    !isSongNote &&
                    (!intervals.includes(interval) ||
                      (rootsOnly && !isRoot && !isJamTone))
                  )
                    return null;
                  if (
                    mode === "caged" &&
                    (shapeData.frets[string] === null ||
                      fret !== shapeData.frets[string]! + shift)
                  )
                    return null;
                  const id = `${string}-${fret}`;
                  const x = fret === 0 ? 49 : nut + (fret - 0.5) * cell;
                  const jamToneInterval = activeJamIntervals.find(
                    (tone) => (activeJamChord.root + tone) % 12 === note,
                  );
                  const degree = isSongNote
                    ? intervalLabel(interval)
                    : isJamTone
                      ? intervalLabel(jamToneInterval ?? interval)
                      : mode === "scale"
                        ? selectedScale.degrees[intervals.indexOf(interval)]
                        : intervalLabel(
                            (mode === "chord"
                              ? CHORD_TYPES[chordType]
                              : CHORD_TYPES[""]
                            ).find((n) => n % 12 === interval) ?? interval,
                          );
                  return (
                    <g
                      key={fret}
                      role="button"
                      tabIndex={0}
                      data-song-note={isSongNote || undefined}
                      aria-label={`${string + 1}번 줄 ${fret}프렛 ${names[note]}`}
                      className={`fret-note ${isSongNote ? "song-note" : ""} ${isRoot ? "root-note" : ""} ${isScaleTone && fretHighlights.scale ? "scale-highlight" : ""} ${isRoot && fretHighlights.root ? "root-highlight" : ""} ${isJamTone ? "jam-chord-tone" : ""} ${isJamTone && fretHighlights.jam ? "jam-highlight" : ""} ${isKeyTone ? "key-chord-tone" : ""} ${isKeyTone && fretHighlights.key ? "key-highlight" : ""} ${isJamRoot ? "jam-chord-root" : ""} ${isKeyRoot ? "key-chord-root" : ""} ${showJamTones && (fretHighlights.jam || fretHighlights.key) && !highlightedCodeTone ? "non-jam-tone" : ""} ${activeNote === id ? "sounding" : ""}`}
                      onClick={() => playNote(midi + fret, id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          playNote(midi + fret, id);
                        }
                      }}
                    >
                      <circle cx={x} cy={y} r={frets > 17 ? 12 : 14} />
                      <text
                        x={x}
                        y={y - 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {notation === "notes" ? names[note] : degree}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const rhythmGrid = (line: RhythmPattern, lineIndex: number) => {
    const lineMeter = meterInfo(line.meter);
    const lineStarts = groupStarts(line.grouping, lineMeter.unitTicks);
    return (
      <div
        className="rhythm-grid editable"
        style={{
          gridTemplateColumns: `repeat(${lineMeter.steps}, minmax(0,1fr))`,
          minWidth: lineMeter.steps > 16 ? lineMeter.steps * 28 : undefined,
        }}
      >
        {line.pattern.map((hit, i) => {
          const direction = line.directions[i];
          return (
            <div
              key={i}
              className={`rhythm-step ${hit ? "hit" : ""} ${rhythmActive && page === "rhythm" && lineIndex === currentRhythmPatternIndex && currentStep === i ? "current" : ""} ${i % lineMeter.unitTicks === 0 ? "on-beat" : ""} ${lineStarts.includes(i) ? "group-start" : ""}`}
              aria-pressed={!!hit}
            >
              <button
                className="rhythm-hit"
                aria-label={`패턴 ${lineIndex + 1}, ${Math.floor(i / lineMeter.unitTicks) + 1}박 ${(i % lineMeter.unitTicks) + 1}번째: ${hit ? "스트로크" : "쉼"}, 클릭해서 변경`}
                aria-pressed={!!hit}
                onClick={() => togglePatternHit(lineIndex, i)}
              >
                <span className="rhythm-count">
                  {i % lineMeter.unitTicks === 0
                    ? Math.floor(i / lineMeter.unitTicks) + 1
                    : lineMeter.denominator === 8
                      ? "&"
                      : ["e", "&", "a"][(i % 4) - 1]}
                </span>
                <span className="note-stem">{hit ? "♪" : "·"}</span>
                <span className="hit-dot" />
              </button>
              <span className="stroke">
                <button
                  aria-label={`패턴 ${lineIndex + 1}, ${i + 1}번째 스트로크 방향: ${direction === "down" ? "다운" : "업"}`}
                  aria-pressed={direction === "down"}
                  onClick={() => toggleStrokeDirection(lineIndex, i)}
                >
                  {direction === "down" ? (
                    <ArrowDown size={18} />
                  ) : (
                    <ArrowUp size={18} />
                  )}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFretboardPanel = (inline = false) => (
    <section
      className={`panel fretboard-panel ${inline ? "tab-inline-board" : expanded ? "expanded-board" : ""}`}
      aria-label={inline ? "프렛보드 확대" : undefined}
    >
      <div className="panel-heading">
        <div className="tab-group">
          {[
            ["scale", "스케일"],
            ["chord", "코드"],
            ["caged", "CAGED"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={mode === id ? "selected" : ""}
              onClick={() => setMode(id)}
            >
              {title}
            </button>
          ))}
        </div>
        <div className="board-tools">
          <div className="notation-tabs">
            <button
              className={notation === "notes" ? "active" : ""}
              onClick={() => setNotation("notes")}
            >
              음이름
            </button>
            <button
              className={notation === "degrees" ? "active" : ""}
              onClick={() => setNotation("degrees")}
            >
              도수
            </button>
          </div>
          <button
            className={`icon-button ${flat ? "selected" : ""}`}
            aria-label="임시표 전환"
            onClick={() => setFlat((f) => !f)}
          >
            {flat ? "♭" : "♯"}
          </button>
          <span className="tool-divider" />
          <button
            className="icon-button"
            aria-label={
              inline
                ? "타브 프렛보드 닫기"
                : expanded
                  ? "프렛보드 축소"
                  : "프렛보드 확대"
            }
            onClick={() =>
              inline ? setTabFretboardVisible(false) : setExpanded((e) => !e)
            }
          >
            {inline || expanded ? <X size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      <div className="board-title-row">
        <div>
          <h2>
            {names[root]}{" "}
            <span>
              {mode === "scale"
                ? selectedScale.name
                : mode === "chord"
                  ? `${chordType || "Major"} Chord`
                  : `${shape} Shape`}
            </span>
            <span className="outline-tag">
              {mode === "scale"
                ? `${selectedScale.intervals.length} NOTES`
                : mode === "caged"
                  ? "CAGED SYSTEM"
                  : `${CHORD_TYPES[chordType].length} NOTES`}
            </span>
          </h2>
          <div className="board-hint-row">
            <p>
              {mode === "scale"
                ? "지판 위의 음을 클릭하고, 소리로 기억해 보세요."
                : mode === "caged"
                  ? "같은 메이저 코드를 다섯 가지 폼으로 연결해 보세요."
                  : "코드 구성음을 찾아 나만의 보이싱을 만들어 보세요."}
            </p>
            <label className="board-tab-tone">
              <input
                type="checkbox"
                checked={boardTabTone}
                onChange={(e) => setBoardTabTone(e.target.checked)}
              />
              <span>지판 타브 음 출력</span>
            </label>
          </div>
        </div>
        {jamActive ? (
          <button className="backing-status" onClick={() => navigate("jam")}>
            <AudioLines size={15} />
            <span>JAM PLAYING</span>
            <strong>{chordName(progression[currentBar])}</strong>
            <ChevronRight size={13} />
          </button>
        ) : (
          <button
            className="jam-tone-context"
            aria-label={`잼플레이 ${chordName(activeJamChord)} 코드톤 보기`}
            onClick={() => navigate("jam")}
          >
            <Music2 size={14} />
            <span>JAM 코드톤</span>
            <strong>{chordName(activeJamChord)}</strong>
            <em>{activeJamToneNames.join(" · ")}</em>
          </button>
        )}
      </div>
      {mode === "chord" && (
        <div className="mode-options">
          {Object.keys(CHORD_TYPES).map((t) => (
            <button
              className={`chip ${chordType === t ? "active" : ""}`}
              onClick={() => setChordType(t)}
              key={t}
            >
              {t || "Major"}
            </button>
          ))}
        </div>
      )}
      {mode === "caged" && (
        <div className="mode-options">
          {Object.keys(CAGED).map((s) => (
            <button
              className={`chip ${shape === s ? "active" : ""}`}
              onClick={() => {
                setShape(s);
                setFrets(15);
              }}
              key={s}
            >
              {s} 폼
            </button>
          ))}
        </div>
      )}
      {renderFretboard()}
      <div className="board-footer">
        <div className="legend">
          <button
            className={`legend-toggle ${fretHighlights.root ? "active" : ""}`}
            aria-label="근음 (Root) 강조 표시"
            aria-pressed={fretHighlights.root}
            onClick={() =>
              setFretHighlights((highlights) => ({
                ...highlights,
                root: !highlights.root,
              }))
            }
          >
            <i className="root-color" /> 근음 (Root)
          </button>
          <button
            className={`legend-toggle ${fretHighlights.scale ? "active" : ""}`}
            aria-label={`${mode === "scale" ? "스케일 구성음" : "코드 구성음"} 강조 표시`}
            aria-pressed={fretHighlights.scale}
            onClick={() =>
              setFretHighlights((highlights) => ({
                ...highlights,
                scale: !highlights.scale,
              }))
            }
          >
            <i className="scale-color" />{" "}
            {mode === "scale" ? "스케일 구성음" : "코드 구성음"}
          </button>
          <button
            className={`legend-toggle ${fretHighlights.jam ? "active" : ""}`}
            aria-label="잼 코드톤 강조 표시"
            aria-pressed={fretHighlights.jam}
            onClick={() =>
              setFretHighlights((highlights) => ({
                ...highlights,
                jam: !highlights.jam,
              }))
            }
          >
            <i className="jam-tone-color" /> 잼 코드톤 ·{" "}
            {chordName(activeJamChord)}
          </button>
          <button
            className={`legend-toggle ${fretHighlights.key ? "active" : ""}`}
            aria-label="KEY 코드톤 강조 표시"
            aria-pressed={fretHighlights.key}
            onClick={() =>
              setFretHighlights((highlights) => ({
                ...highlights,
                key: !highlights.key,
              }))
            }
          >
            <i className="key-tone-color" /> KEY 코드톤 · {keyChordName}
          </button>
          <span className="legend-hint">
            <Volume2 size={13} /> 클릭해서 듣기
          </span>
        </div>
        <div className="zoom-control">
          <span>프렛 범위</span>
          <input
            aria-label="프렛 범위"
            type="range"
            min="12"
            max="24"
            value={frets}
            onChange={(e) => setFrets(Number(e.target.value))}
          />
          <span>{frets}F</span>
        </div>
      </div>
      <div className="scale-summary">
        <div className="scale-note-list">
          <span className="muted-label">
            {mode === "scale" ? "구성음" : "코드톤"}
          </span>
          {(mode === "scale"
            ? selectedScale.intervals
            : mode === "chord"
              ? CHORD_TYPES[chordType]
              : CHORD_TYPES[""]
          ).map((interval, i) => (
            <button
              key={interval}
              className={i === 0 ? "root-text" : ""}
              onClick={() =>
                playNote(60 + root + interval, `summary-${interval}`)
              }
            >
              {names[(root + interval) % 12]}
              <small>
                {mode === "scale"
                  ? selectedScale.degrees[i]
                  : intervalLabel(interval)}
              </small>
            </button>
          ))}
        </div>
        <div className="switch-label">
          <span>근음만 보기</span>
          <Toggle
            label="근음만 보기"
            value={rootsOnly}
            onChange={() => setRootsOnly((r) => !r)}
          />
        </div>
      </div>
    </section>
  );

  return (
    <div
      className={`app-shell ${themeMode}-theme`}
      style={{ "--accent": themeAccent } as CSSProperties}
    >
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
        <a
          className="brand brand-spaced"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("fretboard");
          }}
        >
          <span className="brand-mark">
            <AudioLines size={24} strokeWidth={2.8} />
          </span>
          <span>
            JamBridge<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="연습 도구">
          {NAV.map((item, i) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.title}</span>
              <kbd>{i + 1}</kbd>
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button
          className="nav-item collection"
          onClick={() => setModal("sessions")}
        >
          <Layers3 size={19} strokeWidth={1.7} />
          <span>내 보관함</span>
          {sessions.length > 0 && (
            <span className="count-badge">{sessions.length}</span>
          )}
        </button>
        <div className="sidebar-bottom">
          <div className="daily-goal">
            <div className="goal-heading">
              <span>
                <span className="tiny-lime-dot" /> 오늘
              </span>
              <label className="goal-target">
                <Target size={14} />
                <select
                  aria-label="오늘의 목표 연습 시간"
                  value={dailyGoalMinutes}
                  onChange={(event) =>
                    setDailyGoalMinutes(
                      Number(event.target.value) as DailyGoalMinutes,
                    )
                  }
                >
                  {DAILY_GOAL_MINUTES.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      목표 {minutes}분
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="goal-time">
              {Math.floor(seconds / 60)}
              <span> / {dailyGoalMinutes}분</span>
            </div>
            <div className="progress-track">
              <span
                style={{
                  width: `${Math.min(100, (seconds / goalSeconds) * 100)}%`,
                }}
              />
            </div>
            <p>
              {seconds >= goalSeconds
                ? "오늘의 목표 달성! 멋진 연주였어요."
                : "매일 조금씩, 어제보다 더 나아지게."}
            </p>
          </div>
          <button className="help-button" onClick={() => setModal("help")}>
            <CircleHelp size={17} />
            <span>사용 가이드 & 단축키</span>
            <ArrowUp size={13} className="diagonal-arrow" />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>연습실</span>
            <ChevronRight size={13} />
            <strong>{selectedNav.title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="connection-status">
              <span /> 모든 도구가 연결되어 있어요
            </span>
            <button
              className="button quiet small color-tone-button"
              aria-label="컬러 톤 설정"
              onClick={() => setModal("colorTone")}
            >
              <Settings2 size={15} />
              <span>컬러 톤</span>
            </button>
            <button
              className="button quiet small"
              aria-label="세션 저장"
              onClick={() => setModal("save")}
            >
              <Save size={14} /> <span>세션 저장</span>
            </button>
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> {selectedNav.english}
              </div>
              <h1>
                {selectedNav.title}
                <span className="heading-dot">.</span>
              </h1>
              <p>{selectedNav.description}</p>
            </div>
            <button
              className="button quiet guide-button"
              onClick={() => setModal("help")}
            >
              <BookOpen size={15} /> 연습 가이드
              <ArrowUp size={13} className="diagonal-arrow" />
            </button>
          </section>
          <section className="session-strip" aria-label="공통 연습 설정">
            <div className="session-label">
              <span className="session-icon">
                <SlidersHorizontal size={17} />
              </span>
              <div>
                <strong>연습 설정</strong>
                <span>모든 도구에 함께 적용</span>
              </div>
            </div>
            <Select
              label="KEY"
              value={root}
              onChange={(v) => changeRoot(Number(v))}
            >
              {NOTES.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </Select>
            <Select label="SCALE" value={scale} onChange={changeScale}>
              {Object.entries(SCALES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="tempo-inline">
              <label htmlFor="shared-bpm">TEMPO</label>
              <div>
                <button
                  className="icon-button"
                  aria-label="BPM 낮추기"
                  onClick={() => updateBpm(bpm - 1)}
                >
                  <Minus size={13} />
                </button>
                <TempoInput id="shared-bpm" value={bpm} onChange={updateBpm} />
                <span title="4분음표 기준">BPM ♩</span>
                <button
                  className="icon-button"
                  aria-label="BPM 높이기"
                  onClick={() => updateBpm(bpm + 1)}
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
            <Select
              label="박자"
              value={timeSignature}
              onChange={(v) => {
                if (isMeterId(v)) changeMeter(v);
              }}
            >
              {Object.keys(METERS).map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </Select>
          </section>

          {page === "tab" && (
            <TabStudio
              song={song}
              playing={playing && songMode}
              onApply={(a) => {
                if (a.bpm) updateBpm(a.bpm);
                if (a.key) {
                  changeRoot(a.key.root);
                  setScale(a.key.mode === "minor" ? "minor" : "major");
                }
                if (a.meter && isMeterId(a.meter)) {
                  changeMeter(a.meter);
                }
                notify("곡 분석값을 공통 연습 설정에 적용했어요.");
              }}
              fretboard={
                tabFretboardVisible ? renderFretboardPanel(true) : null
              }
              onFretboard={() => {
                if (!tabFretboardVisible) {
                  setSongMode(true);
                  setMode("scale");
                  setFrets(24);
                }
                setTabFretboardVisible((visible) => !visible);
              }}
            />
          )}
          {page === "fretboard" && (
            <>
              {renderFretboardPanel()}
              <div className="section-title">
                <h2>이제, 연주로 연결해 볼까요?</h2>
                <span>하나의 설정, 이어지는 연습</span>
              </div>
              <div className="connection-cards">
                <section className="connect-card rhythm-connect tip-card">
                  <div className="connect-card-top">
                    <span className="feature-icon mint">
                      <Activity size={19} />
                    </span>
                    <span className="subtle-tag">FEEL THE GROOVE</span>
                    <ArrowUp size={17} className="diagonal-arrow" />
                  </div>
                  <h3>박자 위에 스케일 얹기</h3>
                  <p>{bpm} BPM에 맞춰 한 음씩, 리듬을 느껴보세요.</p>
                  <div className="mini-rhythm">
                    {[1, 0, 1, 0, 1, 1, 0, 1].map((hit, i) => (
                      <div key={i} className={hit ? "hit" : ""}>
                        <span>{i % 2 === 0 ? i / 2 + 1 : "&"}</span>
                        <i />
                        <span>{i % 2 === 0 ? "↓" : "↑"}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="card-link"
                    onClick={() => navigate("rhythm")}
                  >
                    리듬훈련으로 이어가기
                    <ArrowRight size={16} />
                  </button>
                </section>
                <section className="connect-card jam-connect tip-card">
                  <div className="connect-card-top">
                    <span className="feature-icon peach">
                      <AudioLines size={19} />
                    </span>
                    <span className="subtle-tag">MAKE IT MUSICAL</span>
                    <ArrowUp size={17} className="diagonal-arrow" />
                  </div>
                  <h3>반주와 함께 자유롭게</h3>
                  <p>
                    {names[root]} {minor ? "Minor" : "Major"} 코드 진행 위에
                    나만의 멜로디를.
                  </p>
                  <div className="mini-chords">
                    {progression.slice(0, 4).map((c, i) => (
                      <div key={i}>
                        <span>{c.degree}</span>
                        <strong>{chordName(c)}</strong>
                      </div>
                    ))}
                  </div>
                  <button className="card-link" onClick={() => navigate("jam")}>
                    잼플레이로 이어가기
                    <ArrowRight size={16} />
                  </button>
                </section>
                <section className="connect-card tip-card">
                  <div className="connect-card-top">
                    <span className="feature-icon lavender">
                      <Sparkles size={18} />
                    </span>
                    <span className="subtle-tag">PRACTICE NOTE 01</span>
                  </div>
                  <h3>빠르게보다, 정확하게.</h3>
                  <p>
                    처음에는 60–80 BPM으로 시작해 보세요. 각 음을 선명하게
                    연주할 수 있다면 조금씩 속도를 높여도 좋아요.
                  </p>
                  <div className="tip-bottom">
                    <span className="tip-line" />
                    <span>작은 반복이, 큰 차이를 만듭니다.</span>
                  </div>
                </section>
              </div>
              <div className="bottom-note">
                <Headphones size={14} />
                <span>
                  이어폰을 연결하면 더 선명한 소리로 연습할 수 있어요.
                </span>
                <span className="keyboard-tip">
                  <kbd>space</kbd> 재생 / 일시정지
                </span>
              </div>
            </>
          )}

          {page === "rhythm" && (
            <>
              <RhythmPresets
                selectedId={rhythmPresetId}
                onApply={applyRhythmPreset}
              />
              <div className="rhythm-layout">
                <CollapsiblePanel
                  className="panel rhythm-main"
                  title="스트로크"
                  header={
                    <>
                      <h2>
                        <Activity size={18} /> 스트로크
                      </h2>
                      <div className="rhythm-pattern-actions">
                        <span className="outline-tag">
                          {rhythmPatterns.length} PATTERNS · LOOP
                        </span>
                        <button
                          className="text-button add-pattern"
                          aria-label="패턴 줄 추가"
                          disabled={rhythmPatterns.length >= 4}
                          onClick={addRhythmPattern}
                        >
                          <Plus size={18} /> <span>패턴 줄 추가</span>
                        </button>
                      </div>
                    </>
                  }
                >
                  <div className="rhythm-title">
                    <div>
                      <div className="eyebrow">
                        {selectedRhythm?.genre ?? "CUSTOM RHYTHM"}
                      </div>
                      <h2>
                        {selectedRhythm?.name ?? `${timeSignature} 커스텀 리듬`}
                        {rhythmModified && (
                          <span className="rhythm-edit-badge">수정됨</span>
                        )}
                      </h2>
                      <p>
                        {selectedRhythm?.description ??
                          "각 칸을 눌러 나만의 스트로크 패턴을 만들어 보세요."}
                      </p>
                    </div>
                    <button
                      className="button primary start-button"
                      aria-label={rhythmActive ? "리듬 멈춤" : "리듬 재생"}
                      onClick={() => toggleTool("rhythm")}
                    >
                      {rhythmActive ? (
                        <Pause size={18} fill="currentColor" />
                      ) : (
                        <Play size={18} fill="currentColor" />
                      )}
                      {rhythmActive ? "멈춤" : "재생"}
                    </button>
                  </div>
                  <div className="rhythm-pattern-list">
                    {rhythmPatterns.map((line, lineIndex) => {
                      const lineMeter = meterInfo(line.meter);
                      const lineGroupingKey = line.grouping.join("+");
                      return (
                        <section
                          className={`rhythm-pattern-row ${lineIndex === activeRhythmPattern ? "active" : ""} ${rhythmActive && page === "rhythm" && lineIndex === currentRhythmPatternIndex ? "playing-row" : ""}`}
                          key={line.id}
                        >
                          <div className="rhythm-pattern-row-head">
                            <button
                              className="rhythm-pattern-select"
                              aria-label={`패턴 ${lineIndex + 1} 선택`}
                              aria-pressed={lineIndex === activeRhythmPattern}
                              onClick={() => selectRhythmPattern(lineIndex)}
                            >
                              <strong>{line.name}</strong>
                              <span>
                                {lineIndex === activeRhythmPattern
                                  ? "선택됨"
                                  : "편집 가능"}
                                {rhythmActive &&
                                  page === "rhythm" &&
                                  lineIndex === currentRhythmPatternIndex &&
                                  " · 재생 중"}
                              </span>
                            </button>
                            <label className="line-meter-select">
                              <span>박자표</span>
                              <select
                                aria-label={
                                  lineIndex === activeRhythmPattern
                                    ? "리듬 박자표"
                                    : `패턴 ${lineIndex + 1} 박자표`
                                }
                                value={line.meter}
                                onChange={(event) => {
                                  if (!isMeterId(event.target.value)) return;
                                  const nextMeter = event.target.value;
                                  updateRhythmPattern(lineIndex, {
                                    meter: nextMeter,
                                    grouping: [...METERS[nextMeter].groups[0]],
                                    pattern: fitPattern(
                                      line.pattern,
                                      nextMeter,
                                    ),
                                    directions: fitDirections(
                                      line.directions,
                                      nextMeter,
                                    ),
                                    presetId: null,
                                  });
                                  setTapResult("");
                                }}
                              >
                                {Object.keys(METERS).map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {rhythmPatterns.length > 1 && (
                              <button
                                className="icon-button remove-pattern"
                                aria-label={`패턴 ${lineIndex + 1} 삭제`}
                                onClick={() => removeRhythmPattern(lineIndex)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <div className="grouping-controls line-grouping-controls">
                            <span>강세 묶음</span>
                            {lineMeter.groups.map((groups) => (
                              <button
                                key={groups.join("+")}
                                className={
                                  lineGroupingKey === groups.join("+")
                                    ? "active"
                                    : ""
                                }
                                aria-pressed={
                                  lineGroupingKey === groups.join("+")
                                }
                                onClick={() => {
                                  updateRhythmPattern(lineIndex, {
                                    grouping: [...groups],
                                  });
                                  setTapResult("");
                                }}
                              >
                                {groups.join(" + ")}
                              </button>
                            ))}
                          </div>
                          <div
                            ref={
                              lineIndex === currentRhythmPatternIndex
                                ? rhythmScroller
                                : undefined
                            }
                            className="rhythm-grid-scroll"
                          >
                            <div
                              className="rhythm-groups"
                              style={{
                                gridTemplateColumns: line.grouping
                                  .map((n) => `${n}fr`)
                                  .join(" "),
                                minWidth:
                                  lineMeter.steps > 16
                                    ? lineMeter.steps * 28
                                    : undefined,
                              }}
                              aria-label={`패턴 ${lineIndex + 1} 강세 묶음 ${lineGroupingKey}`}
                            >
                              {line.grouping.map((n, groupIndex) => (
                                <span key={groupIndex}>
                                  {groupIndex + 1}묶음 · {n}
                                  {lineMeter.denominator === 8 ? "♪" : "♩"}
                                </span>
                              ))}
                            </div>
                            {rhythmGrid(line, lineIndex)}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <p className="rhythm-meter-note">
                    BPM은 ♩(4분음표) 기준입니다.{" "}
                    {meter.denominator === 8
                      ? `숫자 하나는 ♪(8분음표), ${groupingKey} 묶음의 시작에 강세가 있어요.`
                      : "숫자 하나는 ♩(4분음표), 각 칸은 16분음표입니다."}
                  </p>
                  <div className="rhythm-grid-footer">
                    <span>
                      <i className="scale-color" /> 스트로크{" "}
                      <i className="rest-color" /> 쉼표
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        updateRhythmPattern(activeRhythmPattern, {
                          pattern: selectedRhythm
                            ? [...selectedRhythm.pattern]
                            : defaultPattern(timeSignature),
                          directions: defaultDirections(timeSignature),
                          presetId: selectedRhythm?.id ?? null,
                        })
                      }
                    >
                      <RotateCcw size={13} /> 패턴 초기화
                    </button>
                  </div>
                  <div className="hint-box">
                    <Music2 size={16} />
                    <p>
                      각 칸은 16분음표입니다. 점을 눌러 연주와 쉼을 바꾸세요.
                      화살표는 오른손의 다운·업 방향입니다.
                    </p>
                  </div>
                  <div className="rhythm-options">
                    <div>
                      <Metronome size={18} />
                      <span>메트로놈</span>
                      <Toggle
                        label="리듬 메트로놈"
                        value={click}
                        onChange={() => setClick((c) => !c)}
                      />
                    </div>
                    <div>
                      <Drum size={18} />
                      <span>드럼 반주</span>
                      <Toggle
                        label="드럼 반주"
                        value={rhythmDrums}
                        onChange={() => setRhythmDrums((d) => !d)}
                      />
                    </div>
                    <div>
                      <Shuffle size={18} />
                      <span>스윙 리듬</span>
                      <Toggle
                        label="스윙 리듬"
                        value={swing}
                        onChange={() => setSwing((s) => !s)}
                      />
                    </div>
                  </div>
                </CollapsiblePanel>
              </div>
              <CollapsiblePanel
                className="panel tap-training tip-card"
                title="손끝으로 박자 맞추기"
                header={<h3>손끝으로 박자 맞추기</h3>}
              >
                <div>
                  <span className="eyebrow">FIND YOUR TIMING</span>

                  <p>
                    재생 중 숫자로 표시된{" "}
                    {meter.denominator === 8 ? "8분음표" : "4분음표"} 박에 맞춰
                    버튼을 눌러보세요. 화면 타이밍 기준의 간단한 연습입니다.
                  </p>
                </div>
                <div className="tap-feedback">
                  <span aria-live="polite">
                    {tapResult || "준비되면 리듬을 재생하세요"}
                  </span>
                  <button
                    className="button primary"
                    onClick={() => {
                      if (!rhythmActive) {
                        if (!rhythmTraining) toggleTool("rhythm");
                        else setPlaying(true);
                        setTapResult("다음 박자부터 눌러보세요");
                        return;
                      }
                      const delta =
                        (performance.now() - lastBeat.current) %
                        (((60000 / bpm) * 4) / meter.denominator);
                      const unitDuration =
                        ((60000 / bpm) * 4) / meter.denominator;
                      const distance = Math.min(delta, unitDuration - delta);
                      setTapResult(
                        distance < 65
                          ? `좋아요! · ${Math.round(distance)}ms`
                          : `${delta < unitDuration / 2 ? "조금 늦었어요" : "조금 빨랐어요"} · ${Math.round(distance)}ms`,
                      );
                    }}
                  >
                    TAP
                    <Music2 size={17} />
                  </button>
                </div>
              </CollapsiblePanel>
            </>
          )}

          {page === "jam" && (
            <>
              <div className="jam-layout">
                <div className="jam-main">
                  <CollapsiblePanel
                    className="panel style-panel"
                    title="반주 스타일"
                    header={
                      <>
                        <h2>
                          <SlidersHorizontal size={17} /> 반주 스타일
                        </h2>
                        <span className="muted-label">
                          당신의 연주에 어울리는 사운드
                        </span>
                      </>
                    }
                  >
                    <div className="style-options">
                      {JAM_STYLES.map((option) => {
                        const Icon = STYLE_ICONS[option.icon] ?? Music2;
                        return (
                          <button
                            key={option.id}
                            className={style === option.id ? "active" : ""}
                            aria-pressed={style === option.id}
                            aria-label={`${option.name} 스타일`}
                            onClick={() => setStyle(option.id)}
                          >
                            <Icon size={18} />
                            {option.name}
                            {style === option.id && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="style-detail">
                      <span>
                        <Drum size={14} />
                        {jamStyle(style).detail[0]}
                      </span>
                      <span>
                        <Guitar size={14} />
                        {jamStyle(style).detail[1]}
                      </span>
                      <span>
                        <Music2 size={14} />
                        {jamStyle(style).detail[2]}
                      </span>
                    </div>
                    <div
                      className="instrument-options"
                      role="group"
                      aria-label="반주 음색"
                    >
                      <span className="instrument-label">음색</span>
                      {INSTRUMENTS.map((option) => (
                        <button
                          key={option.id}
                          className={instrument === option.id ? "active" : ""}
                          aria-pressed={instrument === option.id}
                          aria-label={`${option.name} 음색`}
                          title={option.hint}
                          onClick={() => {
                            setInstrument(option.id);
                            loadEngineSamples(option.id);
                          }}
                        >
                          {option.id === "synth" ? (
                            <AudioLines size={16} />
                          ) : option.id === "piano" ? (
                            <Piano size={16} />
                          ) : (
                            <Guitar size={16} />
                          )}
                          {option.name}
                          {instrument === option.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    {instrument !== "synth" && (
                      <p className="instrument-hint">
                        {loadingEngine === instrument
                          ? "실제 악기 샘플을 불러오는 중… 그동안 합성음으로 재생돼요."
                          : readyEngines.includes(instrument)
                            ? `${INSTRUMENTS.find((i) => i.id === instrument)?.hint.split(" (")[0]} 녹음 샘플로 반주합니다.`
                            : "샘플을 불러오지 못해 합성음으로 재생 중입니다."}
                      </p>
                    )}
                  </CollapsiblePanel>
                  <JamHarmony
                    root={root}
                    scale={scale}
                    beats={beats}
                    timeSignature={timeSignature}
                    progression={progression}
                    palette={palette}
                    playing={jamActive}
                    onTogglePlay={() => toggleTool("jam")}
                    tick={jamTick}
                    editingChord={editingChord}
                    setEditingChord={setEditingChord}
                    onChange={setProgression}
                    onContext={(nextScale, quarterBeats, signature) => {
                      setScale(nextScale);
                      const nextMeter =
                        signature ?? meterFromQuarters(quarterBeats);
                      if (nextMeter !== timeSignature) changeMeter(nextMeter);
                    }}
                    preview={(chord) => {
                      audio
                        .previewChord(chord, instrument)
                        .catch(() => notify("오디오를 사용할 수 없어요."));
                    }}
                    notify={notify}
                    mixer={
                      <CollapsiblePanel
                        className="panel mixer"
                        title="믹서"
                        header={
                          <>
                            <h2>
                              <SlidersHorizontal size={17} /> 믹서
                            </h2>
                            <Volume2 size={16} />
                          </>
                        }
                      >
                        <div className="mixer-primary-row">
                          {(["master"] as const).map((channel) => (
                            <div className="mixer-channel master" key={channel}>
                              <div>
                                <span>마스터</span>
                                <span>
                                  {volumes[channel]}
                                  <small>%</small>
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={volumes[channel]}
                                aria-label="마스터 볼륨"
                                onChange={(e) =>
                                  setVolumes((v) => ({
                                    ...v,
                                    [channel]: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>
                          ))}
                          <div className="switch-label mixer-click">
                            <span>메트로놈 켜기</span>
                            <Toggle
                              label="잼 메트로놈"
                              value={click}
                              onChange={() => setClick((c) => !c)}
                            />
                          </div>
                        </div>
                        <div className="mixer-volume-row">
                          {(["drums", "bass", "chords", "click"] as const).map(
                            (channel, i) => (
                              <div className="mixer-channel" key={channel}>
                                <div>
                                  <span>
                                    {["드럼", "베이스", "코드", "클릭"][i]}
                                  </span>
                                  <span>
                                    {volumes[channel]}
                                    <small>%</small>
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={volumes[channel]}
                                  aria-label={`${["드럼", "베이스", "코드", "클릭"][i]} 볼륨`}
                                  onChange={(e) =>
                                    setVolumes((v) => ({
                                      ...v,
                                      [channel]: Number(e.target.value),
                                    }))
                                  }
                                />
                              </div>
                            ),
                          )}
                        </div>
                        <div className="mixer-note">
                          <Headphones size={16} />
                          <p>
                            반주가 너무 크다면 마스터 볼륨을 낮춰 기타 소리와
                            균형을 맞춰보세요.
                          </p>
                        </div>
                      </CollapsiblePanel>
                    }
                  />
                </div>
              </div>
            </>
          )}

          {page === "metronome" && (
            <>
              <div className="metronome-layout">
                <section className="panel metronome-main">
                  <div className="panel-heading">
                    <h2>
                      <Metronome size={18} /> 나만의 페이스 찾기
                    </h2>
                    <span
                      className={`live-label ${clickActive ? "running" : ""}`}
                    >
                      <span />
                      {clickActive ? "PLAYING" : "READY TO PLAY"}
                    </span>
                  </div>
                  <div className="metronome-dial">
                    <span className="dial-label">KEEP YOUR OWN TEMPO</span>
                    <div className="big-tempo">
                      <button
                        className="circle-button"
                        aria-label="템포 5 낮추기"
                        onClick={() => updateBpm(bpm - 5)}
                      >
                        <Minus size={20} />
                      </button>
                      <div>
                        <TempoInput
                          label="메트로놈 BPM"
                          value={bpm}
                          onChange={updateBpm}
                        />
                        <span>BPM · ♩</span>
                      </div>
                      <button
                        className="circle-button"
                        aria-label="템포 5 높이기"
                        onClick={() => updateBpm(bpm + 5)}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    <span className="tempo-name">
                      {bpm < 60
                        ? "Largo · 느리고 여유롭게"
                        : bpm < 80
                          ? "Andante · 걸음걸이처럼"
                          : bpm < 110
                            ? "Moderato · 편안한 속도로"
                            : bpm < 150
                              ? "Allegro · 경쾌하고 빠르게"
                              : "Presto · 빠르고 힘차게"}
                    </span>
                    <input
                      className="large-tempo-range"
                      aria-label="메트로놈 속도 조절"
                      type="range"
                      min="30"
                      max="240"
                      value={bpm}
                      onChange={(e) => updateBpm(Number(e.target.value))}
                    />
                    <div className="range-labels">
                      <span>30 BPM</span>
                      <span>240 BPM</span>
                    </div>
                    <div
                      className={`big-beats ${meter.numerator > 5 ? "many-beats" : ""}`}
                    >
                      {Array.from({ length: meter.numerator }, (_, i) => (
                        <div
                          className={`${i === 0 ? "first" : ""} ${clickActive && currentBeat === i ? "active" : ""} ${rhythmStarts.includes(i * meter.unitTicks) ? "group-accent" : ""}`}
                          key={i}
                        >
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    <div className="metronome-buttons">
                      <button
                        className="button quiet tap-button"
                        onClick={tapTempo}
                      >
                        TAP TEMPO <kbd>T</kbd>
                      </button>
                      <button
                        className="button primary start-button"
                        onClick={() => toggleTool("metronome")}
                      >
                        {clickActive ? (
                          <Pause size={18} fill="currentColor" />
                        ) : (
                          <Play size={18} fill="currentColor" />
                        )}
                        {clickActive ? "일시정지" : "연습 시작"}
                      </button>
                    </div>
                    <p className="tap-result" aria-live="polite">
                      {tapResult ||
                        "T 키를 일정하게 누르면 원하는 템포를 찾을 수 있어요."}
                    </p>
                  </div>
                </section>
                <aside className="metronome-side">
                  <section className="panel metronome-settings">
                    <div className="panel-heading">
                      <h2>
                        <Settings2 size={17} /> 박자 설정
                      </h2>
                    </div>
                    <span className="field-label">박자표</span>
                    <div className="segmented meter-options">
                      {(Object.keys(METERS) as MeterId[]).map((n) => (
                        <button
                          key={n}
                          className={timeSignature === n ? "active" : ""}
                          onClick={() => changeMeter(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="field-label">박자 나누기</span>
                    <div className="segmented subdivisions">
                      {(meter.denominator === 8 ? [2, 4] : [1, 2, 4]).map(
                        (n) => (
                          <button
                            key={n}
                            className={
                              effectiveSubdivision === n ? "active" : ""
                            }
                            onClick={() => setSubdivision(n)}
                          >
                            <strong>
                              {n === 1 ? "♩" : n === 2 ? "♫" : "♬"}
                            </strong>
                            <span>
                              {n === 1
                                ? "4분음표"
                                : n === 2
                                  ? "8분음표"
                                  : "16분음표"}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                    <div className="settings-switch">
                      <div>
                        <strong>첫 박자 강조</strong>
                        <p>마디와 강세 묶음의 시작을 선명하게</p>
                      </div>
                      <Toggle
                        label="첫 박자 강조"
                        value={accent}
                        onChange={() => setAccent((a) => !a)}
                      />
                    </div>
                    <div className="settings-switch">
                      <div>
                        <strong>스윙</strong>
                        <p>세분박에 길고 짧은 흐름 더하기</p>
                      </div>
                      <Toggle
                        label="메트로놈 스윙"
                        value={swing}
                        onChange={() => setSwing((s) => !s)}
                      />
                    </div>
                  </section>
                  <section className="connect-card tempo-tip">
                    <span className="feature-icon peach">
                      <Target size={19} />
                    </span>
                    <h3>편안한 속도부터 시작하세요</h3>
                    <p>
                      같은 구간을 3번 연속 정확하게 연주했다면, BPM을 5만큼
                      올려보세요.
                    </p>
                    <button
                      className="card-link"
                      onClick={() => updateBpm(bpm + 5)}
                    >
                      5 BPM 올려 도전하기
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
        </main>
        <footer className={`transport ${songMode ? "song-mode" : ""}`}>
          <div className="transport-title">
            <span className={`transport-icon ${playing ? "is-playing" : ""}`}>
              <AudioLines size={21} />
            </span>
            <div>
              <strong>
                {songMode && song.project
                  ? `${song.project.name} · ${song.buffering ? "준비 중" : playing ? "곡 재생 중" : "일시정지"}`
                  : playing
                    ? page !== "fretboard"
                      ? `${selectedNav.title} 연습 중`
                      : activeTools.length
                        ? `${NAV.find((n) => n.id === activeTools[0])!.title} 반주와 연습 중`
                        : "연습 중"
                    : "오늘도, 한 걸음 더."}
              </strong>
              <span>
                {songMode && song.project
                  ? `${formatTime(Math.floor(song.position))} / ${formatTime(Math.floor(song.project.duration))}`
                  : page === "jam" || jamActive
                    ? `${jamStyle(style).name} · ${progressionBars}마디 반복`
                    : `${NOTES[root]} ${selectedScale.name}`}
                <span className="transport-separator">·</span>
                {songMode ? (song.project?.analysis?.bpm ?? "?") : bpm} BPM
              </span>
            </div>
          </div>
          <div className="playback-controls">
            <button
              className={`icon-button ${rhythmTraining && !songMode ? "enabled" : ""}`}
              aria-label="리듬훈련 동시 재생 전환"
              aria-pressed={rhythmTraining && !songMode}
              onClick={() => toggleTool("rhythm")}
            >
              <Activity size={18} />
            </button>
            <button
              className={`icon-button ${jamTraining && !songMode ? "enabled" : ""}`}
              aria-label="잼플레이 동시 재생 전환"
              aria-pressed={jamTraining && !songMode}
              onClick={() => toggleTool("jam")}
            >
              <AudioLines size={18} />
            </button>
            <button
              className={`icon-button ${click && !songMode ? "enabled" : ""}`}
              aria-label="메트로놈 동시 재생 전환"
              aria-pressed={click && !songMode}
              onClick={() => toggleTool("metronome")}
            >
              <Metronome size={18} />
            </button>
            <button
              className="transport-play"
              aria-label={
                playing ? "일시정지" : songMode ? "곡 재생" : "연습 재생"
              }
              onClick={toggleTransport}
            >
              {playing ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>
            <span className="loop-indicator" title="계속 반복 재생">
              <Repeat2 size={18} />
            </span>
            <div
              className={`transport-beats ${transportMeter.denominator === 8 ? "grouped" : ""}`}
              aria-label={
                transportMeter.denominator === 8
                  ? `${transportGrouping.join("+")} 강세 묶음`
                  : transportSignature
              }
            >
              {Array.from(
                {
                  length:
                    transportMeter.denominator === 8
                      ? transportGrouping.length
                      : transportMeter.numerator,
                },
                (_, i) => (
                  <span
                    className={`${playing && (transportMeter.denominator === 8 ? rhythmState.group : currentBeat) === i ? "active" : ""} ${i === 0 ? "first" : ""}`}
                    key={i}
                  />
                ),
              )}
            </div>
            <span className="transport-meter">{transportSignature}</span>
            {songMode && <span>{formatTime(Math.floor(song.position))}</span>}
          </div>
          <div className="transport-right">
            <Clock3 size={14} />
            <span className="elapsed">{formatTime(seconds)}</span>
            <button
              className="icon-button reset-practice-time"
              aria-label="오늘의 연습 시간 초기화"
              title="오늘의 연습 시간 초기화"
              onClick={() => {
                setSeconds(0);
                notify("오늘의 연습 시간을 0초로 초기화했어요.");
              }}
            >
              <RotateCcw size={16} />
            </button>
            <span className="tool-divider" />
            <button
              className="icon-button"
              aria-label={volumes.master ? "음소거" : "음소거 해제"}
              onClick={() =>
                setVolumes((v) => ({ ...v, master: v.master ? 0 : 75 }))
              }
            >
              {volumes.master ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <input
              aria-label="전체 볼륨"
              type="range"
              min="0"
              max="100"
              value={volumes.master}
              onChange={(e) =>
                setVolumes((v) => ({ ...v, master: Number(e.target.value) }))
              }
            />
            <button
              className="icon-button keyboard-button"
              aria-label="단축키 안내"
              onClick={() => setModal("help")}
            >
              <Keyboard size={17} />
            </button>
          </div>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "help"
              ? "더 즐거운 연습을 위한 가이드"
              : modal === "save"
                ? "지금의 연습을 저장하세요"
                : modal === "colorTone"
                  ? "기본 컬러 톤"
                  : "내 보관함"
          }
          onClose={() => setModal(null)}
        >
          {modal === "help" && (
            <>
              <p className="modal-intro">
                키와 스케일, 박자, BPM은 모든 연습 도구에서 함께 사용해요. 재생
                중에도 탭을 바꾸며 자연스럽게 연습을 이어가세요.
              </p>
              <div className="guide-steps">
                {NAV.map((n, i) => (
                  <div key={n.id}>
                    <span>0{i + 1}</span>
                    <n.icon size={21} />
                    <div>
                      <strong>{n.title}</strong>
                      <p>
                        {
                          [
                            "음표를 눌러 소리를 듣고 스케일·코드·CAGED 폼을 탐색해요.",
                            "장르별 프리셋과 박자·강세 묶음을 고르고, 16분음표 칸을 직접 편집해요.",
                            "코드 진행과 스타일을 고르고 드럼·베이스·코드 반주에 연주해요.",
                            "템포를 정하고 분할 박자와 강세로 정확한 리듬을 익혀요.",
                          ][i]
                        }
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="shortcut-list">
                <span>
                  재생 / 일시정지 <kbd>Space</kbd>
                </span>
                <span>
                  도구 이동 <kbd>1 — 4</kbd>
                </span>
                <span>
                  탭 템포 <kbd>T</kbd>
                </span>
                <span>
                  BPM 조절 <kbd>↑ ↓</kbd>
                </span>
              </div>
              <p className="storage-note">
                설정과 저장한 세션은 이 브라우저에 보관됩니다. 소리는
                브라우저에서 합성되며 마이크 녹음은 사용하지 않습니다.
              </p>
            </>
          )}
          {modal === "save" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSession();
              }}
            >
              <p className="modal-intro">
                키, 스케일, 템포, 코드 진행, 리듬 패턴과 믹서 설정을 이
                브라우저에 저장합니다.
              </p>
              <label className="save-label" htmlFor="session-name">
                세션 이름
              </label>
              <input
                className="text-input"
                id="session-name"
                autoFocus
                maxLength={50}
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="예: C 메이저 스케일 연습"
              />
              <div className="save-summary">
                <span>
                  {NOTES[root]} {selectedScale.name}
                </span>
                <span>{bpm} BPM</span>
                <span>
                  {timeSignature} · {groupingKey}
                </span>
              </div>
              <button
                className="button primary full"
                type="submit"
                disabled={!sessionName.trim()}
              >
                <Save size={16} /> 세션 저장하기
              </button>
            </form>
          )}
          {modal === "colorTone" && (
            <div className="color-tone-modal">
              <p className="modal-intro">
                현재 <strong>{activeColorTone.name}</strong> ·{" "}
                {themeMode === "dark" ? "다크" : "라이트"} 테마 전체에
                적용됩니다.
              </p>
              <div
                className="theme-mode-list"
                role="group"
                aria-label="화면 테마"
              >
                <button
                  className={themeMode === "dark" ? "selected" : ""}
                  aria-label="다크 테마"
                  aria-pressed={themeMode === "dark"}
                  onClick={() => setThemeMode("dark")}
                >
                  다크
                </button>
                <button
                  className={themeMode === "light" ? "selected" : ""}
                  aria-label="라이트 테마"
                  aria-pressed={themeMode === "light"}
                  onClick={() => setThemeMode("light")}
                >
                  라이트
                </button>
              </div>
              <div className="color-tone-list">
                {COLOR_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    className={tone.id === colorTone ? "selected" : ""}
                    aria-label={`${tone.name} 컬러 톤`}
                    aria-pressed={tone.id === colorTone}
                    onClick={() => {
                      setColorTone(tone.id);
                      setModal(null);
                    }}
                  >
                    <i style={{ backgroundColor: tone.hex }} />
                    <span>{tone.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {modal === "sessions" && (
            <>
              {sessions.length === 0 ? (
                <div className="empty-state">
                  <Layers3 size={38} />
                  <h3>첫 번째 연습을 담아보세요</h3>
                  <p>
                    마음에 드는 설정을 저장하면
                    <br />
                    다음 연습을 바로 이어갈 수 있어요.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setModal("save")}
                  >
                    <Plus size={16} /> 현재 세션 저장
                  </button>
                </div>
              ) : (
                <div className="session-list">
                  {sessions.map((session) => (
                    <div key={session.id}>
                      <button onClick={() => loadSession(session)}>
                        <span className="feature-icon mint">
                          <Music2 size={18} />
                        </span>
                        <span>
                          <strong>{session.name}</strong>
                          <small>
                            {NOTES[session.root]} {SCALES[session.scale]?.name}{" "}
                            · {session.bpm} BPM
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`${session.name} 삭제`}
                        onClick={() => {
                          const next = sessions.filter(
                            (s) => s.id !== session.id,
                          );
                          try {
                            localStorage.setItem(
                              "jambrigde-sessions",
                              JSON.stringify(next),
                            );
                            setSessions(next);
                            notify("저장된 세션을 삭제했어요.");
                          } catch {
                            notify("세션을 삭제하지 못했어요.");
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => {
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const elements = ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, select, [tabindex="0"]',
          );
          if (!elements?.length) return;
          const first = elements[0],
            last = elements[elements.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default App;
