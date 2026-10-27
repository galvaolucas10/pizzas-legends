import type { ContentRegistry } from "../content/registry";
import type { SaveData } from "../core/types";
import { fnv1a, stableStringify } from "./checksum";
import { CURRENT_SCHEMA_VERSION, migrate } from "./migrations";
import { SaveDataSchema, SaveFileSchema } from "./saveSchema";

export type SlotId = "auto" | "slot1" | "slot2" | "slot3";

export interface SaveSummary {
  characterName: string;
  level: number;
  mapId: string;
  objectiveKey: string | null;
  playTimeMs: number;
}

export interface SaveFile {
  format: "pizzalegends-save";
  schemaVersion: number;
  gameVersion: string;
  slotId: SlotId;
  createdAt: string;
  updatedAt: string;
  revision: number;
  summary: SaveSummary;
  checksum: string;
  data: SaveData;
}

/** Resultado de uma carga: o save, ou o motivo de não carregar (sem travar o jogo). */
export type LoadResult =
  | { status: "ok"; file: SaveFile; warnings: string[] }
  | { status: "empty" }
  | { status: "corrupted"; reason: string }
  | { status: "newerVersion"; version: number };

/** Interface assíncrona (ADR-001): a versão com Supabase a implementa sem mudar quem usa. */
export interface SaveRepository {
  list(): Promise<(SaveSummary & { slotId: SlotId; updatedAt: string })[]>;
  load(slotId: SlotId): Promise<LoadResult>;
  save(slotId: SlotId, data: SaveData, summary: SaveSummary): Promise<SaveFile>;
  delete(slotId: SlotId): Promise<void>;
}

/** Armazenamento chave → texto (localStorage no navegador; um Map nos testes). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export const GAME_VERSION = "0.2.0";
const PREFIX = "pizzalegends";
const MAX_BACKUPS = 3;

/**
 * Saves no localStorage (DATA_MODELS 8.2): escrita segura (tmp → valida → final),
 * checksum, migrações, backup de saves corrompidos e limpeza de IDs de conteúdo removido.
 */
export class LocalSaveRepository implements SaveRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly content: ContentRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list() {
    const out = [];
    for (const slotId of ["auto", "slot1", "slot2", "slot3"] as const) {
      const result = await this.load(slotId);
      if (result.status === "ok")
        out.push({ ...result.file.summary, slotId, updatedAt: result.file.updatedAt });
    }
    return out;
  }

  async load(slotId: SlotId): Promise<LoadResult> {
    const key = `${PREFIX}:save:${slotId}`;
    const text = this.store.getItem(key);
    if (text === null) return { status: "empty" };

    const corrupted = (reason: string): LoadResult => {
      this.backup(slotId, text);
      return { status: "corrupted", reason };
    };

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return corrupted("JSON inválido");
    }
    const envelope = SaveFileSchema.safeParse(raw);
    if (!envelope.success) return corrupted("envelope inválido");
    const file = envelope.data;
    if (fnv1a(stableStringify(file.data)) !== file.checksum)
      return corrupted("checksum não confere");
    if (file.schemaVersion > CURRENT_SCHEMA_VERSION)
      return { status: "newerVersion", version: file.schemaVersion };

    const migrated = migrate(file.data, file.schemaVersion);
    const data = SaveDataSchema.safeParse(migrated);
    if (!data.success) return corrupted("estrutura inválida");
    const { save, warnings } = this.dropUnknownIds(data.data as SaveData);
    return {
      status: "ok",
      file: { ...file, schemaVersion: CURRENT_SCHEMA_VERSION, data: save } as SaveFile,
      warnings,
    };
  }

  async save(slotId: SlotId, data: SaveData, summary: SaveSummary): Promise<SaveFile> {
    const key = `${PREFIX}:save:${slotId}`;
    const previous = await this.load(slotId);
    const now = this.now().toISOString();
    const file: SaveFile = {
      format: "pizzalegends-save",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gameVersion: GAME_VERSION,
      slotId,
      createdAt: previous.status === "ok" ? previous.file.createdAt : now,
      updatedAt: now,
      revision: previous.status === "ok" ? previous.file.revision + 1 : 1,
      summary,
      checksum: fnv1a(stableStringify(data)),
      data,
    };
    const text = JSON.stringify(file);
    // Escrita segura: só substitui o save bom depois de conferir a cópia temporária.
    this.store.setItem(`${key}:tmp`, text);
    if (this.store.getItem(`${key}:tmp`) !== text) throw new Error("falha ao gravar o save");
    this.store.setItem(key, text);
    this.store.removeItem(`${key}:tmp`);
    return file;
  }

  async delete(slotId: SlotId): Promise<void> {
    this.store.removeItem(`${PREFIX}:save:${slotId}`);
  }

  /** Copia o save ruim para um backup (máx. 3) e libera o slot; o original nunca é sobrescrito antes disso. */
  private backup(slotId: SlotId, text: string): void {
    this.store.setItem(`${PREFIX}:backup:${slotId}:${this.now().getTime()}`, text);
    this.store.removeItem(`${PREFIX}:save:${slotId}`);
    const backups = this.store
      .keys()
      .filter((k) => k.startsWith(`${PREFIX}:backup:${slotId}:`))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS)))
      this.store.removeItem(old);
  }

  /** Conteúdo removido numa versão nova não pode travar o save (DATA_MODELS 7.2, passo 6). */
  private dropUnknownIds(save: SaveData): { save: SaveData; warnings: string[] } {
    const warnings: string[] = [];
    const c = this.content;
    const keep = (id: string, table: Readonly<Record<string, unknown>>, what: string) => {
      if (id in table) return true;
      warnings.push(`${what} removido do save: ${id}`);
      return false;
    };
    const ingredients = Object.fromEntries(
      Object.entries(save.inventory.ingredients).filter(([id]) =>
        keep(id, c.ingredients, "ingrediente"),
      ),
    );
    const pizzas = save.inventory.pizzas.filter((p) =>
      keep(p.recipeId, c.recipes, "pizza de receita"),
    );
    const characters = save.characters.map((ch) => ({
      ...ch,
      skills: ch.skills.filter((id) => keep(id, c.skills, "habilidade")),
      knownRecipes: ch.knownRecipes.filter((id) => keep(id, c.recipes, "receita")),
    }));
    const world = c.maps[save.world.mapId]
      ? save.world
      : (warnings.push(`mapa removido: ${save.world.mapId}`),
        {
          ...save.world,
          mapId: "map.cozinha_mestre",
          position: { x: 5, y: 6, direction: "down" as const },
        });
    return {
      save: { ...save, characters, world, inventory: { ...save.inventory, ingredients, pizzas } },
      warnings,
    };
  }
}

/** Adapta o localStorage, tolerando navegação privada ou armazenamento bloqueado. */
export function browserStore(): KeyValueStore | null {
  try {
    const ls = window.localStorage;
    const probe = `${PREFIX}:probe`;
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i) ?? "").filter(Boolean),
    };
  } catch {
    return null;
  }
}

/** Armazenamento em memória (testes ou quando o localStorage está bloqueado). */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}
