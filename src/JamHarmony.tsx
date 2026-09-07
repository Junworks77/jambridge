import CollapsiblePanel from "./CollapsiblePanel";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderOpen,
  Layers3,
  ListMusic,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat2,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { FLATS, NOTES, SCALES, chordName, type Chord } from "./music";
import {
  MAX_CHORDS,
  chordDegree,
  chordIntervals,
  isChord,
  isSavedProgression,
  parseProgression,
  progressionPosition,
  progressionTimeline,
  transposeChord,
  type SavedProgression,
} from "./harmony";
import {
  PROGRESSIONS,
  realizePreset,
  type ProgressionCategory,
  type ProgressionPreset,
} from "./progressions";
import "./harmony.css";
import { meterFromQuarters, meterInfo, type MeterId } from "./rhythm";

type Props = {
  root: number;
  scale: string;
  beats: number;
  timeSignature: MeterId;
  progression: Chord[];
  palette: Chord[];
  playing: boolean;
  onTogglePlay: () => void;
  tick: number;
  editingChord: number | null;
  setEditingChord: (index: number | null) => void;
  onChange: (chords: Chord[]) => void;
  onContext: (scale: string, meter: number, timeSignature?: MeterId) => void;
  preview: (chord: Chord) => void;
  notify: (message: string) => void;
  mixer: ReactNode;
};
type Snapshot = {
  chords: Chord[];
  scale: string;
  meter: number;
  timeSignature: MeterId;
};
const CATEGORIES = [
  ["recommended", "추천"],
  ["jazz", "재즈"],
  ["blues", "블루스"],
  ["cycle", "순환"],
  ["custom", "내 진행"],
] as const;
const INTERVALS: [number, string][] = [
  [0, "1"],
  [2, "2"],
  [3, "♭3"],
  [4, "3"],
  [5, "4"],
  [6, "♭5"],
  [7, "5"],
  [8, "♯5"],
  [9, "6"],
  [10, "♭7"],
  [11, "7"],
  [13, "♭9"],
  [14, "9"],
  [15, "♯9"],
  [17, "11"],
  [18, "♯11"],
  [21, "13"],
];
const GROUPS = [
  {
    label: "기본 · 서스펜디드",
    types: ["", "m", "dim", "aug", "sus2", "sus4"],
  },
  {
    label: "7화음 · 6화음",
    types: ["maj7", "m7", "7", "dim7", "m7b5", "mMaj7", "7sus4", "6", "m6"],
  },
  {
    label: "확장 · 텐션",
    types: [
      "add9",
      "mAdd9",
      "6/9",
      "maj9",
      "m9",
      "9",
      "11",
      "m11",
      "13",
      "maj13",
      "m13",
    ],
  },
  { label: "변화화음", types: ["7b9", "7#9", "7b5", "7#5", "9#11", "maj7#11"] },
];
function readSaved(): SavedProgression[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("jambrigde-progressions") || "[]",
    );
    return Array.isArray(value) ? value.filter(isSavedProgression) : [];
  } catch {
    return [];
  }
}

export default function JamHarmony(p: Props) {
  const [category, setCategory] = useState<ProgressionCategory | "custom">(
    "recommended",
  );
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(readSaved);
  const [name, setName] = useState("나의 코드 진행");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Chord>({
    root: p.root,
    type: "maj9",
    degree: "",
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [entry, setEntry] = useState("");
  const [undo, setUndo] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);
  const last = useRef(p.progression);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const libraryList = useRef<HTMLDivElement>(null);
  const timeline = progressionTimeline(p.progression, p.beats);
  const signature = meterInfo(p.timeSignature);
  const position = progressionPosition(p.progression, p.beats, p.tick);
  const filtered = PROGRESSIONS.filter(
    (item) =>
      item.category === category &&
      `${item.name} ${item.description} ${item.chords.map((c) => c.degree).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const draftValid = isChord(draft);

  useEffect(() => {
    if (libraryList.current) libraryList.current.scrollTop = 0;
  }, [category, query]);

  useEffect(() => {
    if (last.current !== p.progression) {
      setUndo([]);
      setRedo([]);
      last.current = p.progression;
    }
  }, [p.progression]);
  useEffect(() => {
    if (p.editingChord !== null && p.progression[p.editingChord]) {
      setDraft({ ...p.progression[p.editingChord] });
      setComposerOpen(true);
      setError("");
      const frame = requestAnimationFrame(() =>
        composer.current?.scrollIntoView({
          block: "nearest",
          behavior: "instant",
        }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [p.editingChord, p.progression]);
  useEffect(() => {
    if (p.editingChord === null) setDraft((d) => ({ ...d, root: p.root }));
  }, [p.root, p.editingChord]);

  function snapshot(): Snapshot {
    return {
      chords: p.progression,
      scale: p.scale,
      meter: p.beats,
      timeSignature: p.timeSignature,
    };
  }
  function commit(
    chords: Chord[],
    context?: { scale: string; meter: number; timeSignature?: MeterId },
  ) {
    if (chords.length > MAX_CHORDS) {
      setError(`한 진행에는 최대 ${MAX_CHORDS}개의 코드를 넣을 수 있어요.`);
      return;
    }
    setUndo((h) => [...h.slice(-29), snapshot()]);
    setRedo([]);
    last.current = chords;
    p.onChange(chords);
    p.setEditingChord(null);
    setError("");
    if (context)
      p.onContext(context.scale, context.meter, context.timeSignature);
  }
  function travel(backwards: boolean) {
    const stack = backwards ? undo : redo;
    const target = stack.at(-1);
    if (!target) return;
    if (backwards) {
      setUndo(stack.slice(0, -1));
      setRedo((h) => [...h, snapshot()]);
    } else {
      setRedo(stack.slice(0, -1));
      setUndo((h) => [...h, snapshot()]);
    }
    last.current = target.chords;
    p.onChange(target.chords);
    p.onContext(target.scale, target.meter, target.timeSignature);
    p.setEditingChord(null);
    setError("");
  }
  function applyPreset(item: ProgressionPreset, append: boolean) {
    const chords = realizePreset(item, p.root);
    if (append && chords.length + p.progression.length > MAX_CHORDS) {
      setError(`최대 ${MAX_CHORDS}개까지 추가할 수 있어요.`);
      return;
    }
    commit(
      append ? [...p.progression, ...chords] : chords,
      append ? undefined : { scale: item.scale, meter: 4 },
    );
    if (!append) setName(item.name);
    p.notify(
      `${item.name} ${append ? "진행을 뒤에 이어 붙였어요." : "진행과 권장 스케일을 적용했어요."}`,
    );
  }
  function saveProgression() {
    if (!name.trim()) return;
    const item: SavedProgression = {
      id: crypto.randomUUID(),
      name: name.trim(),
      root: p.root,
      scale: p.scale,
      meter: p.beats,
      timeSignature: p.timeSignature,
      chords: p.progression,
    };
    if (persist([item, ...saved])) {
      setSaving(false);
      setCategory("custom");
      setQuery("");
    }
  }
  function persist(items: SavedProgression[]) {
    try {
      localStorage.setItem("jambrigde-progressions", JSON.stringify(items));
      setSaved(items);
      p.notify("내 진행에 저장했어요. 다른 키에서도 불러올 수 있어요.");
      return true;
    } catch {
      setError(
        "브라우저 저장 공간이 부족합니다. JSON 내보내기로 보관해 주세요.",
      );
      return false;
    }
  }
  function applySaved(item: SavedProgression, append: boolean) {
    const chords = item.chords.map((c) =>
      transposeChord(c, p.root - item.root),
    );
    commit(
      append ? [...p.progression, ...chords] : chords,
      append
        ? undefined
        : {
            scale: item.scale,
            meter: item.meter,
            timeSignature: item.timeSignature,
          },
    );
    if (!append) setName(item.name);
  }
  function exportFile() {
    const data = {
      version: 1,
      progression: {
        id: crypto.randomUUID(),
        name: name.trim() || "나의 코드 진행",
        root: p.root,
        scale: p.scale,
        meter: p.beats,
        timeSignature: p.timeSignature,
        chords: p.progression,
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "jambridge-progression.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error("1MB 이하의 진행 파일을 선택해 주세요.");
      const value = JSON.parse(await file.text());
      if (
        !value ||
        value.version !== 1 ||
        !isSavedProgression(value.progression)
      )
        throw new Error(
          "올바른 JamBridge 진행 파일이 아닙니다. 현재 진행은 유지됩니다.",
        );
      const item = {
        ...value.progression,
        id: crypto.randomUUID(),
      } as SavedProgression;
      if (persist([item, ...saved])) {
        setCategory("custom");
        setQuery("");
        setError("");
      }
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "JSON 파일을 읽을 수 없어요. 파일 형식을 확인해 주세요."
          : (e as Error).message,
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function submitDraft(append: boolean) {
    if (!draftValid) return;
    const chord = { ...draft, degree: chordDegree(draft, p.root) };
    if (!append && p.editingChord !== null)
      commit(p.progression.map((c, i) => (i === p.editingChord ? chord : c)));
    else commit([...p.progression, chord]);
  }
  function move(index: number, direction: number) {
    const next = [...p.progression];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    commit(next);
  }

  return (
    <div className="harmony-workspace">
      <CollapsiblePanel
        className="panel harmony-library"
        title="코드 진행 라이브러리"
        header={
          <>
            <h2>
              <Layers3 size={17} /> 코드 진행 라이브러리{" "}
              <span className="outline-tag">{PROGRESSIONS.length} PRESETS</span>
            </h2>
            <button
              className="text-button"
              onClick={() => {
                setCategory("custom");
                setQuery("");
              }}
            >
              <FolderOpen size={14} /> 내 진행 {saved.length}
            </button>
          </>
        }
      >
        <div className="harmony-library-toolbar">
          <div className="harmony-categories" aria-label="코드 진행 분류">
            {CATEGORIES.map(([id, label]) => (
              <button
                key={id}
                className={category === id ? "active" : ""}
                aria-pressed={category === id}
                onClick={() => {
                  setCategory(id);
                  setQuery("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="harmony-search">
            <Search size={14} />
            <input
              aria-label="코드 진행 검색"
              placeholder="진행 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="harmony-presets" ref={libraryList}>
          {category !== "custom"
            ? filtered.map((item) => (
                <article className="harmony-preset" key={item.id}>
                  <div className="harmony-preset-meta">
                    <span>
                      {item.scale === "minor"
                        ? "MINOR"
                        : item.scale === "blues"
                          ? "BLUES"
                          : "MAJOR"}{" "}
                      · {progressionTimeline(item.chords, 4).bars}마디
                    </span>
                    <span
                      aria-label={`난이도 ${item.difficulty}`}
                      className="difficulty"
                    >
                      {"●".repeat(item.difficulty)}
                      {"○".repeat(3 - item.difficulty)}
                    </span>
                  </div>
                  <h3>{item.name}</h3>
                  <p className="preset-formula">
                    {item.chords.length > 8
                      ? item.id === "bird-blues"
                        ? "Imaj7 · 반음계 ii–V · 턴어라운드"
                        : item.description
                      : item.chords.map((c) => c.degree).join(" — ")}
                  </p>
                  <p className="preset-description">{item.description}</p>
                  <div className="preset-actions">
                    <button
                      aria-label={`${item.name} 적용`}
                      onClick={() => applyPreset(item, false)}
                    >
                      적용
                      <ArrowRight size={13} />
                    </button>
                    <button
                      aria-label={`${item.name} 이어 붙이기`}
                      onClick={() => applyPreset(item, true)}
                    >
                      <Plus size={13} /> 이어 붙이기
                    </button>
                  </div>
                </article>
              ))
            : saved
                .filter((s) =>
                  s.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((item) => (
                  <article
                    className="harmony-preset saved-preset"
                    key={item.id}
                  >
                    <div className="harmony-preset-meta">
                      <span>
                        {NOTES[item.root]} ·{" "}
                        {item.timeSignature ?? meterFromQuarters(item.meter)} ·{" "}
                        {progressionTimeline(item.chords, item.meter).bars}마디
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`${item.name} 진행 삭제`}
                        onClick={() => {
                          const next = saved.filter((s) => s.id !== item.id);
                          try {
                            localStorage.setItem(
                              "jambrigde-progressions",
                              JSON.stringify(next),
                            );
                            setSaved(next);
                            p.notify(
                              "저장된 진행을 삭제했어요. 현재 편집 중인 진행은 유지됩니다.",
                            );
                          } catch {
                            setError("삭제하지 못했어요.");
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <h3>{item.name}</h3>
                    <p className="preset-formula">
                      {item.chords.slice(0, 6).map(chordName).join(" — ")}
                      {item.chords.length > 6 ? " …" : ""}
                    </p>
                    <p className="preset-description">
                      현재 키 {NOTES[p.root]}에 맞춰 조옮김합니다.
                    </p>
                    <div className="preset-actions">
                      <button
                        aria-label={`${item.name} 불러오기`}
                        onClick={() => applySaved(item, false)}
                      >
                        불러오기
                        <ArrowRight size={13} />
                      </button>
                      <button
                        aria-label={`${item.name} 이어 붙이기`}
                        onClick={() => applySaved(item, true)}
                      >
                        <Plus size={13} /> 이어 붙이기
                      </button>
                    </div>
                  </article>
                ))}
          {(category === "custom"
            ? !saved.some((s) =>
                s.name.toLowerCase().includes(query.toLowerCase()),
              )
            : !filtered.length) && (
            <div className="harmony-empty">
              <Layers3 size={25} />
              <p>
                {query
                  ? "검색 결과가 없어요."
                  : "직접 만든 진행을 저장하거나 JSON 파일을 불러와 보세요."}
              </p>
            </div>
          )}
        </div>
        <div className="library-note">
          <span>프리셋 적용: 현재 키 유지 · 4/4와 권장 스케일 반영</span>
          <span>이어 붙이기: 현재 설정 유지</span>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        className="panel progression-panel"
        title="코드 진행"
        header={
          <>
            <h2>
              <ListMusic size={18} /> 코드 진행{" "}
              <span className="outline-tag">
                {timeline.bars}마디 · {p.progression.length}코드
              </span>
            </h2>
            <div className="inline-actions">
              <button
                className="button primary start-button loop-play"
                aria-label={
                  p.playing ? "잼플레이 반주 멈춤" : "잼플레이 반주 재생"
                }
                onClick={p.onTogglePlay}
              >
                {p.playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
                {p.playing ? "멈춤" : "재생"}
              </button>
              <span className="loop-label">
                <Repeat2 size={14} /> LOOP
              </span>
              <button
                className="icon-button"
                aria-label="코드 편집 실행 취소"
                disabled={!undo.length}
                onClick={() => travel(true)}
              >
                <Undo2 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="코드 편집 다시 실행"
                disabled={!redo.length}
                onClick={() => travel(false)}
              >
                <Redo2 size={16} />
              </button>
            </div>
          </>
        }
      >
        <div className="arrangement-toolbar">
          <span>
            {NOTES[p.root]} {SCALES[p.scale].name} <i /> 총 {p.timeSignature} ·
            ♩ {timeline.totalBeats}박
          </span>
          <div>
            <button
              className="text-button"
              onClick={() => setSaving((s) => !s)}
            >
              <Save size={13} /> 진행 저장
            </button>
            <button className="text-button" onClick={exportFile}>
              <Download size={13} /> JSON
            </button>
            <button
              className="text-button"
              onClick={() => fileInput.current?.click()}
            >
              <FolderOpen size={13} /> 가져오기
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label="코드 진행 JSON 가져오기"
              hidden
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </div>
        </div>
        {saving && (
          <form
            className="progression-save-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveProgression();
            }}
          >
            <input
              aria-label="진행 이름"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="진행 이름"
            />
            <button
              className="button primary"
              disabled={!name.trim()}
              type="submit"
            >
              <Check size={14} /> 내 진행에 저장
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="진행 저장 닫기"
              onClick={() => setSaving(false)}
            >
              <X size={15} />
            </button>
          </form>
        )}
        <div className="chord-progression expanded-progression">
          {timeline.events.map(({ chord, index: i, bar, beat, duration }) => (
            <div
              key={i}
              className={`chord-bar ${p.playing && position.index === i ? "is-playing" : ""} ${p.editingChord === i ? "editing" : ""}`}
            >
              <div className="bar-label">
                <span>
                  {String(bar).padStart(2, "0")} 마디
                  {beat !== 1
                    ? ` · ${((beat - 1) * signature.denominator) / 4 + 1}박`
                    : ""}
                </span>
                <button
                  className="icon-button"
                  aria-label={`${i + 1}마디 삭제`}
                  disabled={p.progression.length === 1}
                  onClick={() =>
                    commit(p.progression.filter((_, j) => i !== j))
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <button
                className="chord-main-button"
                aria-label={`${i + 1}마디 ${chordName(chord)} 코드 변경`}
                onClick={() =>
                  p.setEditingChord(p.editingChord === i ? null : i)
                }
              >
                <span>{chord.degree || chordDegree(chord, p.root)}</span>
                <strong title={chordName(chord)}>{chordName(chord)}</strong>
                <span>
                  {duration / signature.unitTicks}
                  {signature.denominator === 8 ? "♪" : "박"}{" "}
                  <ChevronDown size={12} />
                </span>
              </button>
              <div className="bar-beats">
                {Array.from(
                  { length: Math.ceil(duration / signature.unitTicks) },
                  (_, b) => (
                    <i
                      key={b}
                      className={
                        p.playing &&
                        position.index === i &&
                        Math.floor(position.localTick / signature.unitTicks) ===
                          b
                          ? "active"
                          : ""
                      }
                    />
                  ),
                )}
              </div>
              <div className="chord-event-actions">
                <button
                  className="icon-button"
                  aria-label={`${i + 1}번 코드 앞으로 이동`}
                  disabled={!i}
                  onClick={() => move(i, -1)}
                >
                  <ArrowLeft size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${i + 1}번 코드 복제`}
                  disabled={p.progression.length >= MAX_CHORDS}
                  onClick={() =>
                    commit([
                      ...p.progression.slice(0, i + 1),
                      { ...chord },
                      ...p.progression.slice(i + 1),
                    ])
                  }
                >
                  <Copy size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${i + 1}번 코드 뒤로 이동`}
                  disabled={i === p.progression.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="progression-footer">
          <span>
            {p.editingChord === null
              ? "코드를 선택해 화음·베이스·길이를 편집하세요."
              : `${p.editingChord + 1}번 코드를 편집 중입니다.`}
          </span>
          <div>
            <button
              className="text-button"
              disabled={p.progression.length * 2 > MAX_CHORDS}
              onClick={() =>
                commit([
                  ...p.progression,
                  ...p.progression.map((c) => ({ ...c })),
                ])
              }
            >
              <Repeat2 size={13} /> 전체 반복 추가
            </button>
            <button
              className="text-button"
              disabled={p.progression.length >= MAX_CHORDS}
              onClick={() => commit([...p.progression, p.palette[0]])}
            >
              <Plus size={14} /> 마디 추가
            </button>
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        className="panel palette-panel"
        title="코드 팔레트"
        header={
          <>
            <h2>코드 팔레트</h2>
            <button
              className="text-button"
              onClick={() => setComposerOpen((v) => !v)}
            >
              <SlidersHorizontal size={14} /> 고급 코드 만들기
              <ChevronDown size={13} />
            </button>
          </>
        }
      >
        <div className="chord-palette">
          {p.palette.map((chord, i) => (
            <button
              key={i}
              onClick={() => {
                p.preview(chord);
                if (p.editingChord !== null)
                  commit(
                    p.progression.map((c, j) =>
                      j === p.editingChord ? { ...chord, beats: c.beats } : c,
                    ),
                  );
              }}
            >
              <span>{chord.degree}</span>
              <strong>{chordName(chord)}</strong>
              <i className={i === 4 || i === 6 ? "warm" : ""} />
            </button>
          ))}
        </div>
        <p className="palette-hint">
          <Volume2 size={13} /> 클릭해서 듣기 · 코드 선택 중에는 해당 위치에
          적용
        </p>
        {composerOpen && (
          <div className="chord-composer" ref={composer}>
            <div className="composer-heading">
              <div>
                <span className="eyebrow">HARMONY BUILDER</span>
                <h3>
                  {p.editingChord === null
                    ? "나만의 화음을 더해보세요"
                    : `${p.editingChord + 1}번 코드 편집`}
                </h3>
              </div>
              <button
                className="icon-button"
                aria-label="고급 코드 편집 닫기"
                onClick={() => {
                  setComposerOpen(false);
                  p.setEditingChord(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="composer-fields">
              <label>
                근음
                <select
                  aria-label="코드 근음"
                  value={draft.root}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, root: Number(e.target.value) }))
                  }
                >
                  {NOTES.map((n, i) => (
                    <option key={n} value={i}>
                      {n === FLATS[i] ? n : `${n} / ${FLATS[i]}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                코드 종류
                <select
                  aria-label="고급 코드 종류"
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      type: e.target.value,
                      intervals:
                        e.target.value === "custom"
                          ? [...chordIntervals(d)]
                          : undefined,
                    }))
                  }
                >
                  {GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.types.map((type) => (
                        <option key={type} value={type}>
                          {type || "Major"}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="custom">직접 구성음 선택</option>
                </select>
              </label>
              <label>
                베이스 / 전위
                <select
                  aria-label="슬래시 베이스"
                  value={draft.bass ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      bass:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">근음 (기본)</option>
                  {NOTES.map((n, i) => (
                    <option key={n} value={i}>
                      {n === FLATS[i] ? n : `${n} / ${FLATS[i]}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                길이 (♩ 기준)
                <select
                  aria-label="코드 박 길이"
                  value={draft.beats ?? 0}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      beats: Number(e.target.value) || undefined,
                    }))
                  }
                >
                  <option value={0}>한 마디 ({p.timeSignature})</option>
                  {[0.5, 1, 2, 3, 4, 5, 6, 8, 12, 16].map((n) => (
                    <option key={n} value={n}>
                      ♩ {n}박
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {draft.type === "custom" && (
              <div className="custom-intervals">
                <label>
                  코드 이름 접미사
                  <input
                    aria-label="커스텀 코드 이름"
                    value={draft.label ?? ""}
                    maxLength={24}
                    placeholder="예: sus2(add13)"
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, label: e.target.value }))
                    }
                  />
                </label>
                <div className="interval-buttons">
                  {INTERVALS.map(([n, label]) => (
                    <button
                      key={n}
                      aria-pressed={draft.intervals?.includes(n) ?? false}
                      disabled={
                        !draft.intervals?.includes(n) &&
                        (draft.intervals?.length ?? 0) >= 12
                      }
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          intervals: d.intervals?.includes(n)
                            ? d.intervals.filter((v) => v !== n)
                            : [...(d.intervals ?? []), n].sort((a, b) => a - b),
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p>
                  2–12개의 구성음을 선택하세요. 선택한 모든 음을 실제로
                  재생합니다.
                </p>
              </div>
            )}
            <div className="composer-preview">
              <div>
                <strong>{chordName(draft)}</strong>
                <span>
                  {draftValid
                    ? chordIntervals(draft)
                        .map((n) => NOTES[(draft.root + n) % 12])
                        .join(" · ")
                    : "구성음을 2개 이상 선택하세요"}
                  {draft.bass !== undefined
                    ? ` / 베이스 ${NOTES[draft.bass]}`
                    : ""}
                </span>
              </div>
              <label className="flat-label">
                <input
                  type="checkbox"
                  checked={draft.flat ?? false}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, flat: e.target.checked }))
                  }
                />{" "}
                ♭ 표기
              </label>
              <button
                className="button quiet"
                disabled={!draftValid}
                onClick={() => p.preview(draft)}
              >
                <Volume2 size={14} /> 미리 듣기
              </button>
            </div>
            <div className="composer-actions">
              {p.editingChord !== null && (
                <button
                  className="button primary"
                  disabled={!draftValid}
                  onClick={() => submitDraft(false)}
                >
                  <Check size={14} /> 선택 코드에 적용
                </button>
              )}
              <button
                className="button quiet"
                disabled={!draftValid || p.progression.length >= MAX_CHORDS}
                onClick={() => submitDraft(true)}
              >
                <Plus size={14} /> 진행 끝에 추가
              </button>
            </div>
          </div>
        )}
        <details className="text-progression">
          <summary>코드 기호로 한 번에 입력하기</summary>
          <p>
            예: Dm9:2 G7(b9):2 | Cmaj7/E:4 · |는 마디 구분, :2는 2박입니다. 마디
            안에서 길이를 생략하면 균등하게 나눕니다. 명시한 길이는 ♩(4분음표)
            기준입니다.
          </p>
          <textarea
            aria-label="코드 진행 직접 입력"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="Dm9:2 G7(b9):2 | Cmaj7/E:4"
            rows={3}
          />
          <div>
            <button
              className="button quiet"
              disabled={!entry.trim()}
              onClick={() => {
                try {
                  commit([
                    ...p.progression,
                    ...parseProgression(entry, p.root, p.beats),
                  ]);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Plus size={14} /> 이어 붙이기
            </button>
            <button
              className="button primary"
              disabled={!entry.trim()}
              onClick={() => {
                try {
                  commit(parseProgression(entry, p.root, p.beats));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              입력한 진행 적용
            </button>
          </div>
        </details>
      </CollapsiblePanel>

      {p.mixer}
      {error && (
        <div className="harmony-error" role="alert">
          <span>{error}</span>
          <button
            aria-label="진행 오류 닫기"
            className="icon-button"
            onClick={() => setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
