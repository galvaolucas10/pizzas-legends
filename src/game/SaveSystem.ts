import type { SaveData } from "../core/types";
import type { SaveFile, SaveRepository, SlotId } from "../persistence/SaveRepository";
import type { GameSession } from "./GameSession";

export interface SaveSystemOptions {
  repo: SaveRepository;
  session: GameSession;
  /** Antes de gravar: guarda a posição do jogador e o tempo de jogo na sessão. */
  beforeSave?(): void;
  /** Avisado a cada gravação (o HUD mostra "Salvando..."). */
  onSaving?(work: Promise<unknown>): void;
  warn?(message: string): void;
}

/**
 * Quando e como gravar (GDD 12): automático ao trocar de mapa, ao fim da batalha e ao
 * concluir uma etapa; manual no forno. Gravações seguidas viram uma só.
 */
export class SaveSystem {
  private inFlight: Promise<boolean> | null = null;
  private again = false;
  private enabled = false;

  constructor(private readonly o: SaveSystemOptions) {
    o.session.signals.on("questEvent", (e) => {
      if (e.type === "questStepCompleted") this.autosave();
    });
  }

  /** Liga o autosave (desligado na tela de título, antes de existir uma partida). */
  start(): void {
    this.enabled = true;
  }

  stop(): void {
    this.enabled = false;
  }

  /** Grava no slot automático. Pedidos durante uma gravação geram mais uma, no fim. */
  autosave(): Promise<boolean> {
    if (!this.enabled) return Promise.resolve(false);
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    const work = this.write("auto").finally(() => {
      this.inFlight = null;
      if (this.again) {
        this.again = false;
        void this.autosave();
      }
    });
    this.inFlight = work;
    this.o.onSaving?.(work);
    return work;
  }

  /** Salvamento manual (no forno): grava no slot 1 e também no automático. */
  async saveManual(): Promise<boolean> {
    const ok = await this.write("slot1");
    if (ok) await this.write("auto");
    return ok;
  }

  /** O save mais recente entre todos os slots, se houver. */
  async latest(): Promise<SaveFile | null> {
    const slots = await this.o.repo.list();
    const newest = [...slots].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!newest) return null;
    const result = await this.o.repo.load(newest.slotId);
    if (result.status !== "ok") return null;
    for (const w of result.warnings) this.o.warn?.(w);
    return result.file;
  }

  private async write(slotId: SlotId): Promise<boolean> {
    const { session, repo } = this.o;
    try {
      this.o.beforeSave?.();
      const data = session.state as SaveData;
      const char = data.characters[0]!;
      await repo.save(slotId, data, {
        characterName: char.name,
        level: char.level,
        mapId: data.world.mapId,
        objectiveKey: session.objective,
        playTimeMs: data.stats.playTimeMs,
      });
      return true;
    } catch (error) {
      this.o.warn?.(`falha ao salvar: ${String(error)}`);
      return false;
    }
  }
}
