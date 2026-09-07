export type Technique =
  "none" | "bend" | "slide" | "hammer" | "pull" | "vibrato";
export type TabNote = {
  id: string;
  start: number;
  end: number;
  midi: number;
  confidence: number;
  attack?: number;
  curve: number[];
  technique: Technique;
  bend: number;
  source: "estimated" | "confirmed";
  string: number | null;
  fret: number | null;
  locked: boolean;
  link: string | null;
  /** Which separated stem this note was transcribed from. */
  part: Stem;
};
export type GuitarSettings = {
  tuning: number[];
  capo: number;
  minFret: number;
  maxFret: number;
};
export type Section = { id: string; name: string; start: number; end: number };
export type Analysis = {
  bpm: number | null;
  beats: number[];
  key: { root: number; mode: string; score?: number } | null;
  keyCandidates: { root: number; mode: string; score: number }[];
  meter: string | null;
  meterCandidates: { meter: string; score: number }[];
  firstDownbeat: number;
  sections: Section[];
  reviewRequired: boolean;
  timingEdited: boolean;
};
export const STEMS = ["vocals", "drums", "bass", "guitar", "other"] as const;
export type Stem = (typeof STEMS)[number];
export const STEM_NAMES: Record<Stem, string> = {
  vocals: "Vocal",
  drums: "Drums",
  bass: "Bass",
  guitar: "Guitar",
  other: "Piano/Other",
};
export type Mix = Partial<
  Record<Stem, { volume: number; mute: boolean; solo: boolean }>
>;
export type TabProject = {
  version: number;
  id: string;
  name: string;
  duration: number;
  analysis: Analysis | null;
  notes: TabNote[];
  settings: GuitarSettings;
  mix: Mix;
  position: number;
};
export type SongSession = { id: string; position: number; mix: Mix };
export function normalizeSongSession(value: unknown): SongSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      raw.id,
    )
  )
    return null;
  const mix: Mix = {};
  if (raw.mix && typeof raw.mix === "object") {
    for (const stem of STEMS) {
      const channel = (raw.mix as Record<string, unknown>)[stem];
      if (channel && typeof channel === "object") {
        const c = channel as Record<string, unknown>;
        mix[stem] = {
          volume:
            typeof c.volume === "number" && Number.isFinite(c.volume)
              ? Math.max(0, Math.min(100, c.volume))
              : 100,
          mute: c.mute === true,
          solo: c.solo === true,
        };
      }
    }
  }
  return {
    id: raw.id,
    position:
      typeof raw.position === "number" && Number.isFinite(raw.position)
        ? Math.max(0, Math.min(600, raw.position))
        : 0,
    mix,
  };
}
export const TECHNIQUES: Record<Technique, string> = {
  none: "없음",
  bend: "벤딩(초킹)",
  slide: "슬라이드",
  hammer: "해머온",
  pull: "풀오프",
  vibrato: "비브라토",
};

export function positions(note: TabNote, settings: GuitarSettings) {
  return settings.tuning.flatMap((midi, string) => {
    const fret = note.midi - midi;
    return fret >= Math.max(settings.capo, settings.minFret) &&
      fret <= settings.maxFret
      ? [{ string, fret }]
      : [];
  });
}
export function connectionValid(note: TabNote, notes: TabNote[]) {
  if (!["slide", "hammer", "pull"].includes(note.technique)) return true;
  const target = notes.find((n) => n.id === note.link);
  return (
    !!target &&
    note.string !== null &&
    target.string === note.string &&
    target.start > note.start &&
    target.start - note.end < 0.35 &&
    (note.technique === "hammer"
      ? target.midi > note.midi
      : note.technique === "pull"
        ? target.midi < note.midi
        : target.midi !== note.midi)
  );
}

/** Beam search over complete phrase paths, retaining held strings and locked edits. */
export function arrange(notes: TabNote[], settings: GuitarSettings): TabNote[] {
  const ordered = [...notes].sort(
    (a, b) => a.start - b.start || a.midi - b.midi,
  );
  type Path = {
    cost: number;
    tail: { note: TabNote; prev?: Path["tail"] } | undefined;
    held: TabNote[];
    previous: TabNote | null;
  };
  let paths: Path[] = [{ cost: 0, tail: undefined, held: [], previous: null }];
  for (const note of ordered) {
    const choices = positions(note, settings);
    const allowed = note.locked
      ? choices.filter((p) => p.string === note.string && p.fret === note.fret)
      : choices;
    const next: Path[] = [];
    for (const path of paths) {
      const held = path.held.filter((n) => n.end > note.start + 0.025);
      const candidates = allowed.filter(
        (p) => !held.some((n) => n.string === p.string),
      );
      for (const p of [...candidates, { string: null, fret: null }]) {
        const current = { ...note, ...p };
        const prev = path.previous;
        const frets = [...held.map((n) => n.fret ?? 0), p.fret ?? 0].filter(
          (n) => n > settings.capo,
        );
        if (
          p.fret !== null &&
          frets.length &&
          Math.max(...frets) - Math.min(...frets) > 5
        )
          continue;
        const distance =
          p.fret === null
            ? 100
            : prev?.fret != null
              ? Math.abs(p.fret - prev.fret) +
                Math.abs(p.string! - prev.string!) * 1.5
              : p.fret * 0.15;
        const span = frets.length ? Math.max(...frets) - Math.min(...frets) : 0;
        const connected =
          prev &&
          ["slide", "hammer", "pull"].includes(prev.technique) &&
          prev.link === note.id;
        const cost =
          path.cost +
          distance +
          span * 0.6 +
          (connected && prev.string !== p.string ? 30 : 0);
        next.push({
          cost,
          held: p.string === null ? held : [...held, current],
          previous: p.string === null ? prev : current,
          tail: { note: current, prev: path.tail },
        });
      }
    }
    paths = next.sort((a, b) => a.cost - b.cost).slice(0, 24);
  }
  const result: TabNote[] = [];
  let tail = paths[0]?.tail;
  while (tail) {
    result.push(tail.note);
    tail = tail.prev;
  }
  const arranged = result.reverse();
  return arranged.map((note, i) => {
    if (
      note.source !== "estimated" ||
      note.technique !== "none" ||
      note.string === null
    )
      return note;
    const target = arranged
      .slice(i + 1, i + 7)
      .find(
        (n) =>
          n.string === note.string &&
          n.start > note.start &&
          Math.abs(n.start - note.end) < 0.12,
      );
    if (!target) return note;
    const delta = target.midi - note.midi;
    if (!delta || Math.abs(delta) > 5) return note;
    const last = note.curve.at(-1) || 0;
    if (note.curve.length > 4 && Math.abs(last - delta) < 0.6)
      return { ...note, technique: "slide", link: target.id };
    if (
      target.attack !== undefined &&
      target.attack < 0.18 &&
      Math.abs(delta) <= 4
    )
      return {
        ...note,
        technique: delta > 0 ? "hammer" : "pull",
        link: target.id,
      };
    return note;
  });
}

export const isStem = (value: unknown): value is Stem =>
  (STEMS as readonly unknown[]).includes(value);

/** Solve fingering per source part so toggling one part never shifts another's tab. */
export function arrangeAll(
  notes: TabNote[],
  settings: GuitarSettings,
): TabNote[] {
  const groups = new Map<Stem, TabNote[]>();
  for (const note of notes) {
    const part = isStem(note.part) ? note.part : "guitar";
    const group = groups.get(part) ?? [];
    group.push(note);
    groups.set(part, group);
  }
  return [...groups.values()]
    .flatMap((group) => arrange(group, settings))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
}

export function bars(project: TabProject) {
  const a = project.analysis;
  const bpm = a?.bpm || 120;
  const [n, d] = (a?.meter || "4/4").split("/").map(Number);
  const quarterBeats = (n * 4) / d;
  const result = [0];
  const first = a?.firstDownbeat || 0;
  if (first > 0.05) result.push(first);
  const beatMap = a?.beats || [];
  const origin = beatMap.findIndex((t) => t >= first - 0.05);
  for (let i = 1; i < 2000; i++) {
    const beat = i * quarterBeats;
    const index = Math.max(0, origin) + Math.floor(beat);
    const mapped =
      beatMap[index] !== undefined && beatMap[index + 1] !== undefined
        ? beatMap[index] + (beatMap[index + 1] - beatMap[index]) * (beat % 1)
        : undefined;
    const time =
      !a?.timingEdited && origin >= 0 && mapped !== undefined
        ? mapped
        : first + (beat * 60) / bpm;
    if (time >= project.duration) break;
    if (time > result[result.length - 1] + 0.05) result.push(time);
  }
  return [...result, project.duration];
}

export const AUTH_KEY = "jambrigde-tab-auth";
export type Account = { username: string };

/** Login state is per-device: the token authorizes API calls, the name is for display. */
export function readAuth(): { token: string; username: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return raw &&
      typeof raw.token === "string" &&
      typeof raw.username === "string"
      ? { token: raw.token, username: raw.username }
      : null;
  } catch {
    return null;
  }
}

export function storeAuth(value: { token: string; username: string } | null) {
  try {
    if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* Persisting the login is optional. */
  }
}

/** Thrown when the local server rejects the request for a missing or expired login. */
export class AuthError extends Error {}

/** Attach the stored login token so every server call — JSON or audio — is authorized. */
export function authHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  const auth = readAuth();
  if (auth) headers.set("Authorization", `Bearer ${auth.token}`);
  return headers;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : `요청 실패 (${response.status}) · 로컬 분석 서버 실행을 확인해 주세요.`;
    if (response.status === 401) throw new AuthError(detail);
    throw new Error(detail);
  }
  return response.json();
}
