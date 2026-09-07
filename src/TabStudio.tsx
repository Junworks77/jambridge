import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileMusic, LogOut, Pause, Play, Save, Trash2 } from "lucide-react";
import type { PracticeAudio } from "./audio";
import { NOTES } from "./music";
import { SongAudio } from "./songAudio";
import {
  api,
  arrangeAll,
  AuthError,
  bars,
  connectionValid,
  isStem,
  normalizeSongSession,
  readAuth,
  storeAuth,
  STEMS,
  STEM_NAMES,
  TECHNIQUES,
  type Account,
  type Analysis,
  type GuitarSettings,
  type SongSession,
  type Stem,
  type TabProject,
} from "./tablature";
import "./tab.css";

const FIXED_GUITAR_SETTINGS: GuitarSettings = {
  tuning: [64, 59, 55, 50, 45, 40],
  capo: 0,
  minFret: 0,
  maxFret: 24,
};

type Status = { state: string; stage: string; progress: number };
type Summary = { id: string; name: string; duration: number };
type SongOptions = {
  audio: PracticeAudio;
  playing: boolean;
  songMode: boolean;
  setPlaying: (value: boolean) => void;
  setSongMode: (value: boolean) => void;
};
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
function stored(): SongSession | null {
  try {
    return normalizeSongSession(
      JSON.parse(localStorage.getItem("jambrigde-tab-current") || "null"),
    );
  } catch {
    return null;
  }
}
/** Which stem parts are shown in the tab. Default keeps the guitar-only view. */
function storedParts(): Stem[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem("jambrigde-tab-parts") || "null",
    );
    if (Array.isArray(raw)) return [...STEMS].filter((s) => raw.includes(s));
  } catch {
    /* Filter is optional and per-device. */
  }
  return ["guitar"];
}

export function useTabSong(options: SongOptions) {
  const [project, setProject] = useState<TabProject | null>(null);
  const [follow, setFollow] = useState(true);
  const [library, setLibrary] = useState<Summary[]>([]);
  const [status, setStatus] = useState<Status>({
    state: "idle",
    stage: "MP3를 업로드하거나 저장한 곡을 선택해 주세요.",
    progress: 0,
  });
  const [message, setMessage] = useState("");
  const [server, setServer] = useState(false);
  const [account, setAccount] = useState<Account | null>(() => {
    const saved = readAuth();
    return saved ? { username: saved.username } : null;
  });
  const [registered, setRegistered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(0);
  const [original, setOriginal] = useState(true);
  const [loop, setLoop] = useState<[number, number] | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [revision, setRevision] = useState(0);
  const [parts, setParts] = useState<Stem[]>(storedParts);
  const [undo, setUndo] = useState<TabProject[]>([]);
  const [redo, setRedo] = useState<TabProject[]>([]);
  const engine = useRef(new SongAudio());
  const current = useRef(project);
  current.current = project;
  const cursor = useRef(position);
  cursor.current = position;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const visibleNotes = useMemo(
    () => project?.notes.filter((n) => parts.includes(n.part)) ?? [],
    [project, parts],
  );
  const error = useCallback((e: unknown) => {
    if (e instanceof AuthError) {
      storeAuth(null);
      setAccount(null);
    }
    setMessage(e instanceof Error ? e.message : String(e));
  }, []);
  const refresh = useCallback(async () => {
    try {
      const health = await api<{ ffmpeg: boolean }>("/health");
      setServer(true);
      setLibrary(await api<Summary[]>("/projects"));
      if (!health.ffmpeg) setMessage("서버에 FFmpeg를 설치해 주세요.");
    } catch (e) {
      if (e instanceof AuthError) {
        storeAuth(null);
        setAccount(null);
      } else {
        setServer(false);
      }
    }
  }, []);
  const checkAuth = useCallback(async () => {
    try {
      const state = await api<{ registered: boolean; authed: boolean }>(
        "/auth",
      );
      setServer(true);
      setRegistered(state.registered);
      if (!state.authed) {
        storeAuth(null);
        setAccount(null);
      }
      return state.authed;
    } catch {
      setServer(false);
      return false;
    }
  }, []);
  const authenticate = useCallback(
    async (mode: "login" | "register", username: string, password: string) => {
      const result = await api<{ token: string; username: string }>(
        `/auth/${mode}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      );
      storeAuth(result);
      setAccount({ username: result.username });
      setRegistered(true);
      setMessage("");
      await refresh();
    },
    [refresh],
  );
  const logout = useCallback(async () => {
    const o = optionsRef.current;
    o.setPlaying(false);
    o.setSongMode(false);
    engine.current.clear();
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* The local token is cleared regardless of the server reply. */
    }
    storeAuth(null);
    setAccount(null);
    setRegistered(true);
    setProject(null);
    setLibrary([]);
    setStatus({
      state: "idle",
      stage: "MP3를 업로드하거나 저장한 곡을 선택해 주세요.",
      progress: 0,
    });
    setMessage("");
    try {
      localStorage.removeItem("jambrigde-tab-current");
    } catch {
      /* Optional resume state. */
    }
  }, []);
  const open = useCallback(
    async (id: string, restore?: SongSession) => {
      const o = optionsRef.current;
      o.setPlaying(false);
      engine.current.clear();
      setBusy(true);
      try {
        const p = await api<TabProject>(`/projects/${id}`);
        if (
          p.version !== 1 ||
          !Number.isFinite(p.duration) ||
          !Array.isArray(p.notes) ||
          p.settings?.tuning?.length !== 6
        )
          throw new Error("지원하지 않거나 손상된 타브 프로젝트입니다.");
        restore = normalizeSongSession(restore) || undefined;
        const s = await api<Status>(`/projects/${id}/status`);
        p.notes = p.notes.map((n) => ({
          ...n,
          part: isStem(n.part) ? n.part : "guitar",
        }));
        const settingsChanged =
          p.settings.tuning.some(
            (midi, i) => midi !== FIXED_GUITAR_SETTINGS.tuning[i],
          ) ||
          p.settings.capo !== FIXED_GUITAR_SETTINGS.capo ||
          p.settings.minFret !== FIXED_GUITAR_SETTINGS.minFret ||
          p.settings.maxFret !== FIXED_GUITAR_SETTINGS.maxFret;
        p.settings = {
          ...FIXED_GUITAR_SETTINGS,
          tuning: [...FIXED_GUITAR_SETTINGS.tuning],
        };
        if (
          p.notes.length &&
          (settingsChanged ||
            p.notes.every((n) => n.string === null && !n.locked))
        )
          p.notes = arrangeAll(p.notes, p.settings);
        if (restore?.mix) p.mix = restore.mix;
        setProject(p);
        setStatus(s);
        setPosition(Math.min(restore?.position ?? p.position ?? 0, p.duration));
        setOriginal(s.state !== "done");
        setLoop(null);
        setUndo([]);
        setRedo([]);
        setMessage("");
      } catch (e) {
        error(e);
      } finally {
        setBusy(false);
      }
    },
    [error],
  );
  useEffect(() => {
    void (async () => {
      if (!(await checkAuth())) return;
      await refresh();
      const last = stored();
      if (last?.id) void open(last.id, last);
    })();
  }, [checkAuth, open, refresh]);
  useEffect(() => {
    if (!project || status.state !== "running") return;
    let cancelled = false;
    const timer = setInterval(() => {
      api<Status>(`/projects/${project.id}/status`)
        .then(async (s) => {
          if (cancelled) return;
          setStatus(s);
          if (s.state === "done") {
            await open(project.id);
            await refresh();
          }
        })
        .catch(error);
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project?.id, status.state, open, refresh, error]);
  useEffect(() => {
    if (!project) return;
    try {
      localStorage.setItem(
        "jambrigde-tab-current",
        JSON.stringify({ id: project.id, position, mix: project.mix }),
      );
    } catch {
      /* Optional resume. */
    }
  }, [project?.id, project?.mix, Math.floor(position)]);
  useEffect(() => {
    engine.current.setMix(project?.mix || {});
  }, [project?.mix]);
  useEffect(() => {
    const p = current.current;
    if (!options.songMode || !options.playing || !p) {
      engine.current.stop();
      setBuffering(false);
      return;
    }
    let cancelled = false;
    void options.audio
      .songOutput()
      .then(({ context, output }) => {
        if (cancelled) return;
        return engine.current.start({
          id: p.id,
          duration: p.duration,
          position: cursor.current,
          original,
          loop,
          context,
          output,
          onTime: setPosition,
          onBuffer: setBuffering,
          onEnd: () => optionsRef.current.setPlaying(false),
          onError: (e) => {
            error(e);
            optionsRef.current.setPlaying(false);
          },
        });
      })
      .catch((e) => {
        if (!cancelled) {
          error(e);
          optionsRef.current.setPlaying(false);
        }
      });
    return () => {
      cancelled = true;
      engine.current.stop();
    };
  }, [
    options.songMode,
    options.playing,
    options.audio,
    project?.id,
    original,
    loop,
    revision,
    error,
  ]);
  useEffect(() => () => engine.current.clear(), []);
  const save = async () => {
    const p = current.current;
    if (!p || status.state === "running") return;
    try {
      await api(`/projects/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, position: cursor.current }),
      });
      setMessage("곡과 수정 타브를 저장했습니다.");
    } catch (e) {
      error(e);
    }
  };
  const edit = (next: TabProject) => {
    if (!project) return;
    setUndo((u) => [...u.slice(-29), project]);
    setRedo([]);
    setProject(next);
  };
  const seek = (t: number) => {
    engine.current.stop();
    const next = Math.max(0, Math.min(project?.duration || 0, t));
    cursor.current = next;
    setPosition(next);
    setRevision((r) => r + 1);
  };
  return {
    project,
    follow,
    setFollow,
    library,
    status,
    message,
    server,
    account,
    registered,
    authenticate,
    logout,
    checkAuth,
    busy,
    position,
    original,
    loop,
    buffering,
    undo,
    redo,
    parts,
    visibleNotes,
    setPart: (stem: Stem, on: boolean) => {
      setParts((prev) => {
        const next = on
          ? [...STEMS].filter((s) => s === stem || prev.includes(s))
          : prev.filter((s) => s !== stem);
        try {
          localStorage.setItem("jambrigde-tab-parts", JSON.stringify(next));
        } catch {
          /* Filter is per-device. */
        }
        return next;
      });
    },
    error,
    refresh,
    open,
    save,
    edit,
    seek,
    session: project
      ? ({ id: project.id, position, mix: project.mix } as SongSession)
      : undefined,
    setOriginal: (value: boolean) => {
      cursor.current = engine.current.stop();
      setPosition(cursor.current);
      setOriginal(value);
    },
    setLoop: (value: [number, number] | null) => {
      cursor.current = engine.current.stop();
      setPosition(cursor.current);
      setLoop(value);
      if (value) seek(value[0]);
    },
    undoEdit: () => {
      const last = undo.at(-1);
      if (last && project) {
        setRedo((r) => [...r, project]);
        setProject(last);
        setUndo((u) => u.slice(0, -1));
      }
    },
    redoEdit: () => {
      const last = redo.at(-1);
      if (last && project) {
        setUndo((u) => [...u, project]);
        setProject(last);
        setRedo((r) => r.slice(0, -1));
      }
    },
    upload: async (file: File) => {
      if (
        file.size > 100 * 1024 * 1024 ||
        !file.name.toLowerCase().endsWith(".mp3")
      ) {
        setMessage("100MB 이하 MP3를 선택해 주세요.");
        return;
      }
      options.setPlaying(false);
      setBusy(true);
      setMessage("업로드와 MP3 검사 중…");
      try {
        const body = new FormData();
        body.append("file", file);
        const p = await api<TabProject>("/projects", { method: "POST", body });
        await open(p.id);
        await refresh();
      } catch (e) {
        error(e);
      } finally {
        setBusy(false);
      }
    },
    analyze: async () => {
      if (!project) return;
      try {
        await api(`/projects/${project.id}/analyze`, { method: "POST" });
        setStatus(await api<Status>(`/projects/${project.id}/status`));
      } catch (e) {
        error(e);
      }
    },
    cancel: async () => {
      if (!project) return;
      try {
        await api(`/projects/${project.id}/cancel`, { method: "POST" });
        setStatus(await api<Status>(`/projects/${project.id}/status`));
      } catch (e) {
        error(e);
      }
    },
    remove: async () => {
      if (
        !project ||
        !window.confirm(
          `“${project.name}”의 음원·stem·타브를 삭제할까요? 복구할 수 없습니다.`,
        )
      )
        return;
      options.setPlaying(false);
      engine.current.clear();
      try {
        await api(`/projects/${project.id}`, { method: "DELETE" });
        setProject(null);
        localStorage.removeItem("jambrigde-tab-current");
        await refresh();
      } catch (e) {
        error(e);
      }
    },
    play: () => {
      if (!project) {
        setMessage("먼저 곡을 업로드해 주세요.");
        return;
      }
      options.setSongMode(true);
      options.setPlaying(!options.songMode || !options.playing);
    },
  };
}

export type TabSong = ReturnType<typeof useTabSong>;
export default function TabStudio({
  song,
  playing,
  onApply,
  onFretboard,
  fretboard,
}: {
  song: TabSong;
  playing: boolean;
  onApply: (a: Analysis) => void;
  onFretboard: () => void;
  fretboard: ReactNode;
}) {
  const p = song.project;
  const { follow, setFollow } = song;
  const [sectionIndex, setSectionIndex] = useState(0);
  const tabRef = useRef<HTMLDivElement>(null);
  const boundaries = useMemo(
    () => (p ? bars(p) : []),
    [p?.analysis, p?.duration],
  );
  const measureNotes = useMemo(
    () =>
      boundaries
        .slice(0, -1)
        .map((start, i) =>
          song.visibleNotes.filter(
            (n) => n.start >= start && n.start < boundaries[i + 1],
          ),
        ),
    [boundaries, song.visibleNotes],
  );
  const foundBar = boundaries.findIndex(
    (t, i) =>
      i < boundaries.length - 1 &&
      song.position >= t &&
      song.position < boundaries[i + 1],
  );
  const activeBar =
    foundBar < 0 ? Math.max(0, boundaries.length - 2) : foundBar;
  const soundingId = song.visibleNotes.find(
    (n) => n.start <= song.position && n.end > song.position,
  )?.id;
  useEffect(() => {
    const viewport = tabRef.current;
    if (!follow || !playing || !viewport) return;
    const bar = viewport.querySelector<HTMLElement>(
      `[data-bar="${activeBar}"]`,
    );
    if (!bar) return;
    // Move only the score's viewport, keeping the page and inline fretboard still.
    const top =
      viewport.scrollTop +
      bar.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top -
      viewport.clientTop -
      parseFloat(getComputedStyle(viewport).paddingTop);
    viewport.scrollTo({ top, behavior: "smooth" });
  }, [activeBar, follow, playing]);
  useEffect(() => {
    if (!follow || !playing || !soundingId) return;
    const bar = tabRef.current?.querySelector(`[data-bar="${activeBar}"]`);
    const staff = bar?.querySelector<HTMLElement>(".tab-staff");
    const sounding = bar?.querySelector<HTMLElement>(
      `[data-note-id="${CSS.escape(soundingId)}"]`,
    );
    if (!staff || !sounding) return;
    const staffBounds = staff.getBoundingClientRect();
    const noteBounds = sounding.getBoundingClientRect();
    const leftEdge = staffBounds.left + staff.clientLeft;
    const rightEdge = leftEdge + staff.clientWidth;
    if (noteBounds.left < leftEdge || noteBounds.right > rightEdge) {
      const delta =
        noteBounds.left < leftEdge
          ? noteBounds.left - leftEdge
          : noteBounds.right - rightEdge;
      staff.scrollTo({ left: staff.scrollLeft + delta, behavior: "smooth" });
    }
  }, [activeBar, soundingId, follow, playing]);
  useEffect(() => {
    setSectionIndex(0);
  }, [p?.id]);
  const analysis = (changes: Partial<Analysis>) => {
    if (p?.analysis)
      song.edit({ ...p, analysis: { ...p.analysis, ...changes } });
  };
  const currentSection = p?.analysis?.sections[sectionIndex];
  if (!song.account) return <TabLogin song={song} />;
  return (
    <div className="tab-studio">
      <section className="panel tab-upload">
        <div className="tab-row">
          <FileMusic />
          <h2>MP3에서 나의 연습 타브로</h2>
          <span className="tab-account">{song.account.username}</span>
          <button
            className="icon-button"
            aria-label="타브 생성 로그아웃"
            title="로그아웃"
            onClick={() => void song.logout()}
          >
            <LogOut />
          </button>
        </div>
        <p>최대 100MB · 10분. 분석은 이 PC의 로컬 서버에서 처리합니다.</p>
        {!song.server && (
          <div className="tab-notice" role="status">
            로컬 분석 서버에 연결되지 않았습니다. README의 서버 실행 안내를
            확인해 주세요.{" "}
            <button
              className="button quiet"
              onClick={() => void song.refresh()}
            >
              연결 다시 확인
            </button>
          </div>
        )}
        <div className="tab-row">
          <label className="button quiet">
            MP3 업로드
            <input
              aria-label="MP3 업로드"
              type="file"
              accept=".mp3,audio/mpeg"
              disabled={song.busy || !song.server}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void song.upload(f);
                e.target.value = "";
              }}
            />
          </label>
          <select
            aria-label="저장한 타브 프로젝트"
            value={p?.id || ""}
            disabled={song.busy}
            onChange={(e) => {
              if (e.target.value) void song.open(e.target.value);
            }}
          >
            <option value="">저장한 곡 선택</option>
            {song.library.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {song.message && (
          <p role="status" className="tab-notice">
            {song.message}
          </p>
        )}
        {song.busy && <p role="status">파일을 준비하고 있습니다…</p>}
      </section>
      {p && (
        <>
          <section className="panel tab-analysis">
            <div className="tab-row">
              <h2>{p.name}</h2>
              <span>{time(p.duration)}</span>
              <button
                className="button quiet"
                disabled={song.status.state === "running"}
                onClick={() => void song.save()}
              >
                <Save />
                저장
              </button>
              <button
                className="icon-button"
                aria-label="타브 프로젝트 삭제"
                onClick={() => void song.remove()}
              >
                <Trash2 />
              </button>
            </div>
            <div className="tab-row">
              <button
                className="button"
                disabled={
                  song.status.state === "running" ||
                  song.busy ||
                  song.status.state === "done"
                }
                onClick={() => void song.analyze()}
              >
                stem 분리 · 타브생성
              </button>
              {song.status.state === "running" && (
                <button
                  className="button quiet"
                  onClick={() => void song.cancel()}
                >
                  분석 취소
                </button>
              )}
              <span role="status">{song.status.stage}</span>
            </div>
            <progress
              aria-label="곡 분석 진행"
              value={song.status.progress}
              max={100}
            />
            {p.analysis && (
              <>
                <p>
                  자동 추정 결과입니다. 박자·첫 마디와 채보를 확인해 주세요.
                  기타·피아노 분리에는 다른 악기의 소리가 섞일 수 있습니다.
                </p>
                <div className="tab-fields">
                  <label>
                    BPM (♩)
                    <input
                      aria-label="곡 BPM"
                      type="number"
                      min={20}
                      max={400}
                      value={p.analysis.bpm ?? ""}
                      placeholder="추정 실패"
                      onChange={(e) =>
                        analysis({
                          bpm: Math.max(
                            20,
                            Math.min(400, Number(e.target.value)),
                          ),
                          timingEdited: true,
                        })
                      }
                    />
                  </label>
                  <label>
                    Key
                    <select
                      aria-label="곡 Key"
                      value={p.analysis.key?.root ?? ""}
                      onChange={(e) =>
                        analysis({
                          key: {
                            root: Number(e.target.value),
                            mode: p.analysis!.key?.mode || "major",
                          },
                        })
                      }
                    >
                      <option value="" disabled>
                        확인 필요
                      </option>
                      {NOTES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    조성
                    <select
                      aria-label="곡 조성"
                      value={p.analysis.key?.mode || "major"}
                      onChange={(e) =>
                        analysis({
                          key: {
                            root: p.analysis!.key?.root || 0,
                            mode: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="major">메이저</option>
                      <option value="minor">마이너</option>
                    </select>
                  </label>
                  <label>
                    박자
                    <select
                      aria-label="곡 박자"
                      value={p.analysis.meter ?? ""}
                      onChange={(e) => analysis({ meter: e.target.value })}
                    >
                      <option value="" disabled>
                        확인 필요
                      </option>
                      {["3/4", "4/4", "5/8", "7/8", "12/8"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    첫 마디 (초)
                    <input
                      aria-label="곡 첫 마디 위치"
                      type="number"
                      min={0}
                      max={p.duration}
                      step={0.01}
                      value={p.analysis.firstDownbeat}
                      onChange={(e) =>
                        analysis({
                          firstDownbeat: Math.max(
                            0,
                            Math.min(p.duration, Number(e.target.value)),
                          ),
                          timingEdited: true,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="tab-row">
                  <button
                    className="button quiet"
                    onClick={() => onApply(p.analysis!)}
                  >
                    공통 연습 설정에 적용
                  </button>
                  <span>
                    Key 후보:{" "}
                    {p.analysis.keyCandidates
                      .map((k) => `${NOTES[k.root]} ${k.mode}`)
                      .join(" · ") || "확인 필요"}
                  </span>
                </div>
                <div className="tab-sections" aria-label="곡 구간 타임라인">
                  {p.analysis.sections.map((s, i) => (
                    <button
                      key={s.id}
                      aria-pressed={sectionIndex === i}
                      onClick={() => {
                        setSectionIndex(i);
                        song.seek(s.start);
                      }}
                    >
                      {s.name}
                      <span>
                        {time(s.start)}–{time(s.end)}
                      </span>
                    </button>
                  ))}
                </div>
                {currentSection && (
                  <div className="tab-fields">
                    <label>
                      구간 이름
                      <input
                        aria-label="구간 이름"
                        value={currentSection.name}
                        maxLength={80}
                        onChange={(e) =>
                          analysis({
                            sections: p.analysis!.sections.map((s, i) =>
                              i === sectionIndex
                                ? { ...s, name: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      시작 (초)
                      <input
                        aria-label="구간 시작"
                        type="number"
                        step={0.1}
                        min={0}
                        max={currentSection.end - 0.1}
                        value={currentSection.start}
                        onChange={(e) =>
                          analysis({
                            sections: p.analysis!.sections.map((s, i) =>
                              i === sectionIndex
                                ? {
                                    ...s,
                                    start: Math.max(
                                      0,
                                      Math.min(
                                        s.end - 0.1,
                                        Number(e.target.value),
                                      ),
                                    ),
                                  }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      끝 (초)
                      <input
                        aria-label="구간 끝"
                        type="number"
                        step={0.1}
                        min={currentSection.start + 0.1}
                        max={p.duration}
                        value={currentSection.end}
                        onChange={(e) =>
                          analysis({
                            sections: p.analysis!.sections.map((s, i) =>
                              i === sectionIndex
                                ? {
                                    ...s,
                                    end: Math.max(
                                      s.start + 0.1,
                                      Math.min(
                                        p.duration,
                                        Number(e.target.value),
                                      ),
                                    ),
                                  }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </>
            )}
          </section>
          <section className="panel tab-mixer">
            <div className="tab-row">
              <h2>Stem 믹서</h2>
              <button
                className="button quiet"
                onClick={song.play}
                aria-label={playing ? "곡 일시정지" : "곡 재생"}
              >
                {playing ? <Pause /> : <Play />}
                {playing ? "일시정지" : "곡 재생"}
              </button>
              <select
                aria-label="원곡과 stem 전환"
                value={song.original ? "original" : "stems"}
                onChange={(e) =>
                  song.setOriginal(e.target.value === "original")
                }
              >
                <option value="original">원곡 듣기</option>
                <option value="stems" disabled={song.status.state !== "done"}>
                  stem 믹스
                </option>
              </select>
              <button
                className="button quiet"
                disabled={!currentSection}
                aria-pressed={!!song.loop}
                onClick={() =>
                  song.setLoop(
                    song.loop
                      ? null
                      : currentSection
                        ? [currentSection.start, currentSection.end]
                        : null,
                  )
                }
              >
                선택 구간 반복 {song.loop ? "켜짐" : "꺼짐"}
              </button>
            </div>
            <div className="tab-row">
              <span>
                {time(song.position)} / {time(p.duration)}
              </span>
              <input
                className="tab-seek"
                type="range"
                min={0}
                max={p.duration}
                step={0.05}
                value={song.position}
                aria-label="곡 재생 위치"
                onChange={(e) => song.seek(Number(e.target.value))}
              />
              <span role="status">
                {song.buffering ? "모든 stem 준비 중…" : ""}
              </span>
            </div>
            <div className="tab-stems">
              {STEMS.map((stem) => {
                const mix = p.mix[stem] || {
                  volume: 100,
                  mute: false,
                  solo: false,
                };
                const change = (v: Partial<typeof mix>) =>
                  song.edit({
                    ...p,
                    mix: { ...p.mix, [stem]: { ...mix, ...v } },
                  });
                return (
                  <fieldset
                    key={stem}
                    disabled={song.original || song.status.state !== "done"}
                  >
                    <legend>{STEM_NAMES[stem]}</legend>
                    <input
                      aria-label={`${STEM_NAMES[stem]} 볼륨`}
                      type="range"
                      min={0}
                      max={100}
                      value={mix.volume}
                      onChange={(e) =>
                        change({ volume: Number(e.target.value) })
                      }
                    />
                    <output>{mix.volume}%</output>
                    <div className="tab-row">
                      <button
                        aria-label={`${STEM_NAMES[stem]} 음소거`}
                        aria-pressed={mix.mute}
                        onClick={() => change({ mute: !mix.mute })}
                      >
                        음소거
                      </button>
                      <button
                        aria-label={`${STEM_NAMES[stem]} 솔로`}
                        aria-pressed={mix.solo}
                        onClick={() => change({ solo: !mix.solo })}
                      >
                        솔로
                      </button>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>
          {p.analysis && (
            <section className="panel tab-score">
              <div className="tab-row">
                <h2>기타 타브</h2>
                <button
                  className="button quiet"
                  onClick={onFretboard}
                  aria-expanded={!!fretboard}
                  aria-controls="tab-fretboard"
                >
                  지판에서 보기
                </button>
                <button
                  className="button quiet"
                  onClick={() => setFollow((f) => !f)}
                  aria-pressed={follow}
                >
                  현재 위치 따라가기 {follow ? "켜짐" : "꺼짐"}
                </button>
              </div>
              {fretboard && <div id="tab-fretboard">{fretboard}</div>}
              <div className="tab-row tab-parts">
                <span>타브에 표시할 파트</span>
                {STEMS.map((stem) => (
                  <label key={stem}>
                    <input
                      type="checkbox"
                      checked={song.parts.includes(stem)}
                      onChange={(e) => song.setPart(stem, e.target.checked)}
                    />
                    {STEM_NAMES[stem]}
                  </label>
                ))}
              </div>
              {!p.analysis.meter && (
                <p role="status">
                  박자가 미확정이라 임시 4/4로 표시합니다. 위에서 박자를 지정해
                  주세요.
                </p>
              )}
              {!song.visibleNotes.length && (
                <p>
                  {song.parts.length
                    ? "선택한 파트에서 검출된 음이 없습니다. 분리·채보가 어려운 구간일 수 있습니다."
                    : "위에서 타브에 표시할 파트를 선택해 주세요."}
                </p>
              )}
              <p className="tab-score-guide">
                TAB · {p.analysis.meter || "4/4?"} · 위에서부터 1–6번 줄 (E B G
                D A E) · 숫자는 프렛 · 점선 밑줄은 추정음
              </p>
              <div
                className="tab-measures"
                ref={tabRef}
                onWheel={() => setFollow(false)}
                onTouchStart={() => setFollow(false)}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setFollow(false);
                }}
              >
                {boundaries.slice(0, -1).map((start, i) => {
                  const notes = measureNotes[i];
                  const columns = [
                    ...new Set(
                      notes
                        .filter((n) => n.string !== null)
                        .map((n) => Math.round(n.start * 50) / 50),
                    ),
                  ].sort((a, b) => a - b);
                  const columnWidths = (columns.length ? columns : [start]).map(
                    (t) =>
                      notes.some(
                        (n) =>
                          Math.round(n.start * 50) / 50 === t &&
                          n.technique === "bend",
                      )
                        ? 64
                        : 40,
                  );
                  return (
                    <article
                      className={`tab-measure ${i === activeBar ? "current" : ""}`}
                      key={i}
                      data-bar={i}
                      style={{
                        flexBasis: Math.max(
                          180,
                          columnWidths.reduce((sum, width) => sum + width, 24),
                        ),
                      }}
                    >
                      <button
                        className="tab-measure-title"
                        onClick={() => song.seek(start)}
                        aria-label={`${i + 1}마디 · ${time(start)}부터 재생 위치 이동`}
                        aria-current={i === activeBar ? "true" : undefined}
                        title={`${i + 1}마디 · ${time(start)}`}
                      >
                        {i + 1}
                      </button>
                      <div
                        className="tab-staff"
                        style={{
                          gridTemplateColumns: columnWidths
                            .map((width) => `minmax(${width}px, 1fr)`)
                            .join(" "),
                        }}
                      >
                        {Array.from({ length: 6 }, (_, string) => (
                          <div className="tab-string" key={string}>
                            {(columns.length ? columns : [start]).map(
                              (t, j) => {
                                const ns = notes.filter(
                                  (n) =>
                                    n.string === string &&
                                    Math.abs(
                                      Math.round(n.start * 50) / 50 - t,
                                    ) < 0.001,
                                );
                                return (
                                  <div className="tab-cell" key={j}>
                                    {ns.map((n) => (
                                      <span
                                        key={n.id}
                                        data-note-id={n.id}
                                        className={`tab-note ${n.source} ${n.start <= song.position && n.end > song.position ? "sounding" : ""}`}
                                        role="img"
                                        aria-label={`${string + 1}번 줄 ${n.fret! - p.settings.capo}프렛 ${TECHNIQUES[n.technique]}`}
                                        title={`${n.source === "estimated" ? "자동 추정" : "사용자 수정"} · ${TECHNIQUES[n.technique]}`}
                                      >
                                        {n.fret! - p.settings.capo}
                                        <span>
                                          {n.technique === "bend"
                                            ? `↗${n.bend}`
                                            : n.technique === "slide"
                                              ? "/"
                                              : n.technique === "hammer"
                                                ? "H"
                                                : n.technique === "pull"
                                                  ? "P"
                                                  : n.technique === "vibrato"
                                                    ? "~"
                                                    : ""}
                                          {!connectionValid(n, p.notes) ||
                                          n.confidence < 0.5
                                            ? "!"
                                            : ""}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                );
                              },
                            )}
                          </div>
                        ))}
                      </div>
                      {notes.some((n) => n.string === null) && (
                        <div className="tab-row tab-unplaced">
                          미배치:{" "}
                          {notes
                            .filter((n) => n.string === null)
                            .map((n) => (
                              <span key={n.id}>
                                {NOTES[n.midi % 12]}
                                {Math.floor(n.midi / 12) - 1} !
                              </span>
                            ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** The 타브생성 screen is available only after signing in to the local server. */
function TabLogin({ song }: { song: TabSong }) {
  const mode: "login" | "register" = song.registered ? "login" : "register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await song.authenticate(mode, username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tab-studio">
      <section className="panel tab-auth">
        <div className="tab-row">
          <FileMusic />
          <h2>타브 생성 로그인</h2>
        </div>
        <p>
          타브 생성은 이 PC의 로컬 분석 서버를 사용합니다.{" "}
          {mode === "register"
            ? "이 서버에서 처음 사용한다면 아이디와 비밀번호로 계정을 만들어 주세요."
            : "등록한 아이디와 비밀번호로 로그인해 주세요."}
        </p>
        {!song.server && (
          <div className="tab-notice" role="status">
            로컬 분석 서버에 연결되지 않았습니다. README의 서버 실행 안내를
            확인해 주세요.{" "}
            <button
              className="button quiet"
              type="button"
              onClick={() => void song.checkAuth()}
            >
              연결 다시 확인
            </button>
          </div>
        )}
        <form className="tab-auth-form" onSubmit={submit}>
          <label>
            아이디
            <input
              aria-label="아이디"
              autoComplete="username"
              value={username}
              minLength={3}
              maxLength={40}
              required
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              aria-label="비밀번호"
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              value={password}
              minLength={4}
              maxLength={200}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="tab-row">
            <button
              className="button"
              type="submit"
              disabled={busy || !song.server}
            >
              {mode === "register" ? "계정 만들기" : "로그인"}
            </button>
            {mode === "register" && (
              <span role="status">등록된 계정이 없어 새 계정을 만듭니다.</span>
            )}
          </div>
        </form>
        {error && (
          <p role="alert" className="tab-notice">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
