import assert from "node:assert/strict";
import { build } from "esbuild";

async function moduleFor(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
const { arrange, positions, bars, connectionValid } =
  await moduleFor("src/tablature.ts");
const settings = {
  tuning: [64, 59, 55, 50, 45, 40],
  capo: 0,
  minFret: 0,
  maxFret: 24,
};
const note = (id, midi, start = 0, end = 0.4) => ({
  id,
  midi,
  start,
  end,
  confidence: 0.9,
  curve: [],
  technique: "none",
  bend: 0,
  source: "estimated",
  string: null,
  fret: null,
  locked: false,
  link: null,
});
const chord = arrange(
  [40, 47, 52, 56, 59, 64].map((m, i) => note(String(i), m)),
  settings,
);
assert.equal(chord.length, 6);
assert.equal(chord.filter((n) => n.string !== null).length, 6);
assert.equal(new Set(chord.map((n) => n.string)).size, 6);
for (const n of chord) assert.equal(settings.tuning[n.string] + n.fret, n.midi);
assert.deepEqual(positions(note("low", 38), settings), []);
assert.equal(
  positions(note("drop", 38), {
    ...settings,
    tuning: [64, 59, 55, 50, 45, 38],
  })[0].fret,
  0,
);
assert.equal(positions(note("capo", 40), { ...settings, capo: 2 }).length, 0);
const locked = {
  ...note("lock", 69, 0, 0.2),
  string: 0,
  fret: 5,
  locked: true,
  source: "confirmed",
};
assert.equal(
  arrange([locked, note("next", 71, 0.2, 0.5)], settings)[0].string,
  0,
);
const impossible = arrange([note("impossible", 120)], settings)[0];
assert.equal(impossible.midi, 120);
assert.equal(impossible.string, null);
assert.equal(
  connectionValid({ ...locked, technique: "hammer", link: "target" }, [
    { ...note("target", 71, 0.2, 0.5), string: 0, fret: 7 },
  ]),
  true,
);
assert.equal(
  connectionValid({ ...locked, technique: "pull", link: "target" }, [
    { ...note("target", 71, 0.2, 0.5), string: 0, fret: 7 },
  ]),
  false,
);
for (const [meter, duration] of [
  ["3/4", 1.5],
  ["4/4", 2],
  ["5/8", 1.25],
  ["7/8", 1.75],
  ["12/8", 3],
]) {
  assert.equal(
    bars({
      duration: 12,
      analysis: {
        bpm: 120,
        meter,
        beats: [],
        firstDownbeat: 0,
        timingEdited: true,
      },
    })[1],
    duration,
  );
}

const { SongAudio } = await moduleFor("src/songAudio.ts");
let sources = [],
  gains = [],
  ended = 0;
const context = {
  currentTime: 10,
  decodeAudioData: async () => ({ duration: 15 }),
  createGain() {
    const g = {
      context: this,
      connect() {},
      disconnect() {},
      gain: {
        value: 1,
        setTargetAtTime(v) {
          this.value = v;
        },
      },
    };
    gains.push(g);
    return g;
  },
  createBufferSource() {
    const s = {
      connect() {},
      disconnect() {},
      start(...args) {
        this.args = args;
      },
      stop() {
        this.stopped = true;
      },
    };
    sources.push(s);
    return s;
  },
};
globalThis.fetch = async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(8),
});
const audio = new SongAudio();
const options = {
  id: "fixture",
  duration: 40,
  position: 3,
  original: false,
  loop: null,
  context,
  output: {},
  onTime() {},
  onBuffer() {},
  onEnd() {
    ended++;
  },
  onError(e) {
    throw e;
  },
};
await audio.start(options);
assert.equal(sources.length, 5);
assert(sources.every((s) => s.args[0] === 10.06 && s.args[1] === 3));
audio.setMix({ guitar: { volume: 40, mute: false, solo: true } });
assert.deepEqual(
  gains.map((g) => g.gain.value),
  [0, 0, 0, 0.4, 0],
);
context.currentTime = 11.06;
assert(Math.abs(audio.stop() - 4) < 1e-6);
assert(sources.every((s) => s.stopped));
sources = [];
gains = [];
await audio.start({ ...options, position: 18, original: true });
assert.equal(sources.length, 1);
assert.equal(sources[0].args[1], 3);
audio.stop();
await audio.start({ ...options, duration: 4, position: 3, original: true });
context.currentTime += 2;
await new Promise((r) => setTimeout(r, 45));
assert.equal(ended, 1);
audio.clear();
console.log(
  "PASS: polyphonic fingering, tuning/capo, impossible notes, techniques, five meters, synchronized stems, solo, pause, seek, end.",
);
