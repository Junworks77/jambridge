import { authHeaders, STEMS, type Mix, type Stem } from "./tablature";

/** All five channels use the same AudioContext clock and segment boundary. */
export class SongAudio {
  private generation = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  private gains = new Map<string, GainNode>();
  private cache = new Map<string, Promise<AudioBuffer[]>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private mix: Mix = {};
  private position = 0;
  private anchor = 0;
  private anchorPosition = 0;
  private scheduledEnd = 0;
  private context: AudioContext | null = null;
  private running = false;

  setMix(mix: Mix) {
    this.mix = mix;
    const solo = STEMS.some((s) => mix[s]?.solo);
    this.gains.forEach((gain, key) => {
      const value = mix[key as Stem];
      const level =
        key === "original"
          ? 1
          : value?.mute || (solo && !value?.solo)
            ? 0
            : (value?.volume ?? 100) / 100;
      gain.gain.setTargetAtTime(level, gain.context.currentTime, 0.015);
    });
  }
  getPosition() {
    if (this.running && this.context)
      return Math.min(
        this.scheduledEnd,
        this.anchorPosition +
          Math.max(0, this.context.currentTime - this.anchor),
      );
    return this.position;
  }
  stop() {
    this.position = this.getPosition();
    this.running = false;
    this.generation++;
    clearTimeout(this.timer);
    this.nodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
      node.disconnect();
    });
    this.nodes.clear();
    this.gains.forEach((g) => g.disconnect());
    this.gains.clear();
    return this.position;
  }
  clear() {
    this.stop();
    this.cache.clear();
  }
  async start(options: {
    id: string;
    duration: number;
    position: number;
    original: boolean;
    loop: [number, number] | null;
    context: AudioContext;
    output: AudioNode;
    onTime: (time: number) => void;
    onBuffer: (value: boolean) => void;
    onEnd: () => void;
    onError: (error: Error) => void;
  }) {
    this.stop();
    const generation = this.generation;
    const { context, output, id, duration, loop } = options;
    this.context = context;
    this.position = Math.min(options.position, duration);
    const channels = options.original ? ["original"] : [...STEMS];
    for (const channel of channels) {
      const gain = context.createGain();
      gain.connect(output);
      this.gains.set(channel, gain);
    }
    this.setMix(this.mix);
    const load = (index: number) => {
      const key = `${id}/${options.original}/${index}`;
      if (!this.cache.has(key)) {
        const pending = Promise.all(
          channels.map(async (channel) => {
            const response = await fetch(
              `/api/projects/${id}/audio/${channel}/${index}`,
              { headers: authHeaders() },
            );
            if (response.status === 401)
              throw new Error(
                "로그인이 만료되었습니다. 타브 생성 화면에서 다시 로그인해 주세요.",
              );
            if (!response.ok)
              throw new Error(
                "stem을 불러오지 못했습니다. 서버와 분석 상태를 확인해 주세요.",
              );
            return context.decodeAudioData(await response.arrayBuffer());
          }),
        );
        this.cache.set(key, pending);
        pending.catch(() => this.cache.delete(key));
      }
      // Keep only this and neighboring segments, bounding decoded audio memory.
      for (const entry of this.cache.keys())
        if (
          entry !== key &&
          (!entry.startsWith(`${id}/${options.original}/`) ||
            Math.abs(Number(entry.split("/").pop()) - index) > 2)
        )
          this.cache.delete(entry);
      return this.cache.get(key)!;
    };
    const boundary = loop?.[1] ?? duration;
    let nextPosition =
      this.position >= boundary ? (loop?.[0] ?? 0) : this.position;
    let scheduling = false;
    const schedule = async () => {
      if (scheduling) return;
      scheduling = true;
      try {
        const index = Math.floor(nextPosition / 15);
        const buffers = await load(index);
        if (generation !== this.generation) return;
        const delayed =
          !this.running ||
          context.currentTime >=
            this.anchor + (this.scheduledEnd - this.anchorPosition);
        const at = delayed
          ? context.currentTime + 0.06
          : this.anchor + (nextPosition - this.anchorPosition);
        if (delayed) {
          this.anchor = at;
          this.anchorPosition = nextPosition;
        }
        const length = Math.min((index + 1) * 15, boundary) - nextPosition;
        channels.forEach((channel, i) => {
          const source = context.createBufferSource();
          source.buffer = buffers[i];
          source.connect(this.gains.get(channel)!);
          source.start(at, nextPosition - index * 15, length);
          this.nodes.add(source);
          source.onended = () => {
            this.nodes.delete(source);
            source.disconnect();
          };
        });
        this.running = true;
        this.scheduledEnd = nextPosition + length;
        nextPosition = this.scheduledEnd;
        options.onBuffer(false);
        if (nextPosition < boundary)
          void load(Math.floor(nextPosition / 15)).catch(() => {});
      } catch (error) {
        if (generation === this.generation) {
          this.stop();
          options.onBuffer(false);
          options.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      } finally {
        scheduling = false;
      }
    };
    options.onBuffer(true);
    await schedule();
    const pump = () => {
      if (generation !== this.generation) return;
      const position = this.getPosition();
      options.onTime(position);
      if (position >= boundary - 0.001) {
        this.stop();
        if (loop) void this.start({ ...options, position: loop[0] });
        else options.onEnd();
        return;
      }
      if (nextPosition < boundary && this.scheduledEnd - position < 1)
        void schedule();
      if (position >= this.scheduledEnd - 0.001) options.onBuffer(true);
      this.timer = setTimeout(pump, 30);
    };
    pump();
  }
}
