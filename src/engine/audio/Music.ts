/**
 * Música de fundo em estilo 8 bits, gerada na hora com a Web Audio API (sem arquivos de áudio).
 * O navegador só deixa tocar som depois de um toque ou tecla: `unlock()` deve ser chamado
 * num evento do usuário.
 */

/** Notas como "C5:4" (nota e oitava : duração em semicolcheias); "r:4" é pausa. */
interface VoiceDef {
  wave: OscillatorType;
  volume: number;
  notes: string;
}

interface TrackDef {
  bpm: number;
  voices: VoiceDef[];
  /** Bateria, uma letra por semicolcheia: k = bumbo, s = caixa, h = chimbal, . = nada. */
  drums: string;
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export type TrackName = "town" | "battle";

/** Baixo alternando tônica e quinta (ou tônica e oitava) em colcheias, meio compasso por acorde. */
function bass(roots: string[], octaveJump = false): string {
  const out: string[] = [];
  for (const root of roots) {
    const midi = toMidi(`${root}2`);
    const other = octaveJump ? midi + 12 : midi + 7;
    out.push(`${midi}:2`, `${other}:2`, `${midi}:2`, `${other}:2`);
  }
  return out.join(" ");
}

const TRACKS: Record<TrackName, TrackDef> = {
  // Vila: alegre, em dó maior.
  town: {
    bpm: 112,
    voices: [
      {
        wave: "square",
        volume: 0.16,
        notes: `E5:4 G5:2 E5:2 C5:4 D5:2 E5:2   F5:4 E5:2 D5:2 C5:6 r:2
                D5:4 F5:2 D5:2 B4:4 C5:2 D5:2   E5:4 D5:2 C5:2 G4:6 r:2
                E5:4 G5:2 E5:2 C6:4 B5:2 A5:2   G5:4 F5:2 E5:2 F5:4 A5:4
                G5:2 F5:2 E5:2 D5:2 C5:2 D5:2 E5:2 G4:2   C5:8 r:8`,
      },
      {
        wave: "triangle",
        volume: 0.32,
        notes: bass([
          "C",
          "C",
          "F",
          "C",
          "G",
          "G",
          "C",
          "G",
          "C",
          "A",
          "F",
          "F",
          "G",
          "G",
          "C",
          "C",
        ]),
      },
    ],
    drums: "k.h.s.h.k.h.s.h.".repeat(8),
  },
  // Batalha: mais rápida e tensa, em lá menor.
  battle: {
    bpm: 150,
    voices: [
      {
        wave: "square",
        volume: 0.15,
        notes: `A4:2 C5:2 E5:2 A5:2 G5:2 E5:2 C5:2 E5:2   F5:4 E5:2 D5:2 E5:6 r:2
                A4:2 C5:2 E5:2 A5:2 B5:2 A5:2 G5:2 E5:2   G5:4 F5:2 E5:2 D5:4 E5:4
                F5:2 F5:2 A5:2 F5:2 G5:2 G5:2 B5:2 G5:2   A5:4 G5:2 F5:2 E5:4 C5:4
                D5:2 E5:2 F5:2 G5:2 E5:2 D5:2 C5:2 B4:2   A4:8 E5:4 r:4`,
      },
      {
        wave: "triangle",
        volume: 0.34,
        notes: bass(
          ["A", "A", "F", "E", "A", "A", "G", "G", "F", "G", "A", "C", "D", "E", "A", "E"],
          true,
        ),
      },
    ],
    drums: "k.hhs.hhk.k.s.hh".repeat(8),
  },
};

function toMidi(note: string): number {
  if (/^\d+$/.test(note)) return Number(note);
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) throw new Error(`nota inválida: ${note}`);
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]!]! + (m[2] ? 1 : 0);
}

interface NoteEvent {
  midi: number;
  steps: number;
}

/** Notas por semicolcheia de início (pausas não geram evento). */
function compile(notes: string): { events: Map<number, NoteEvent>; length: number } {
  const events = new Map<number, NoteEvent>();
  let step = 0;
  for (const token of notes.trim().split(/\s+/)) {
    const [name, len] = token.split(":");
    const steps = Number(len);
    if (name !== "r") events.set(step, { midi: toMidi(name!), steps });
    step += steps;
  }
  return { events, length: step };
}

const STORAGE_KEY = "pizza-legends.music";
const MASTER_VOLUME = 0.35;

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private track: TrackName = "town";
  private compiled: { wave: OscillatorType; volume: number; events: Map<number, NoteEvent> }[] = [];
  private length = 0;
  private step = 0;
  private nextTime = 0;
  private enabledValue: boolean;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // sem armazenamento: música ligada
    }
    this.enabledValue = saved !== "off";
    this.load(this.track);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void this.ctx?.suspend();
      else if (this.enabledValue) void this.ctx?.resume();
    });
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  /** Liga ou desliga (e lembra a escolha neste aparelho). */
  setEnabled(on: boolean): void {
    this.enabledValue = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // ignora
    }
    if (on) {
      this.unlock();
      this.restart();
    } else {
      this.stopTimer();
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
    }
  }

  /** Chamar num toque/tecla: cria o áudio e começa a tocar. */
  unlock(): void {
    if (!this.enabledValue) return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
      this.restart();
    }
    if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
  }

  /** Troca a música (volta ao começo dela). */
  play(track: TrackName): void {
    if (track === this.track) return;
    this.track = track;
    this.load(track);
    if (this.timer !== null) this.restart();
  }

  private load(track: TrackName): void {
    const def = TRACKS[track];
    let length = def.drums.length;
    this.compiled = def.voices.map((v) => {
      const voice = compile(v.notes);
      length = Math.max(length, voice.length);
      return { wave: v.wave, volume: v.volume, events: voice.events };
    });
    this.length = length;
  }

  private restart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabledValue) return;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(MASTER_VOLUME, ctx.currentTime);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.stopTimer();
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  private stopTimer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Agenda as notas dos próximos ~120 ms (o relógio do áudio é preciso; o setInterval não). */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const def = TRACKS[this.track];
    const stepTime = 60 / def.bpm / 4;
    // Aba voltou depois de muito tempo: não tenta tocar tudo o que "perdeu".
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      for (const voice of this.compiled) {
        const note = voice.events.get(this.step);
        if (note) this.tone(voice.wave, voice.volume, note, this.nextTime, stepTime);
      }
      const drum = def.drums[this.step % def.drums.length];
      if (drum === "k") this.kick(this.nextTime);
      else if (drum === "s") this.hit(this.nextTime, 0.12, 0.09, 1800);
      else if (drum === "h") this.hit(this.nextTime, 0.03, 0.035, 7000);
      this.step = (this.step + 1) % this.length;
      this.nextTime += stepTime;
    }
  }

  private tone(
    wave: OscillatorType,
    volume: number,
    note: NoteEvent,
    at: number,
    stepTime: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
    const end = at + note.steps * stepTime * 0.92;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.setTargetAtTime(volume * 0.6, at + 0.01, 0.08);
    gain.gain.setTargetAtTime(0, end - 0.02, 0.015);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(end + 0.1);
  }

  private kick(at: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.12);
    gain.gain.setValueAtTime(0.5, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.16);
  }

  /** Ruído filtrado: caixa (grave) ou chimbal (agudo). */
  private hit(at: number, volume: number, length: number, cutoff: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(at);
    src.stop(at + length + 0.01);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
