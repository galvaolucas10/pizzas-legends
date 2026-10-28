import type { GameSession } from "../../game/GameSession";
import { h, hpBar } from "../dom";

/** HUD da exploração (GDD 11.2): nome, nível, PV, objetivo atual e aviso de salvamento. */
export class Hud {
  readonly element: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly hp: ReturnType<typeof hpBar>;
  private readonly objectiveEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly saveEl: HTMLElement;
  private readonly unsubscribe: (() => void)[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    doc: Document,
    private readonly session: GameSession,
  ) {
    this.element = h(doc, "div", "hud");
    this.element.hidden = true;
    const status = h(doc, "div", "hud__status panel");
    this.nameEl = h(doc, "div", "hud__name");
    this.hp = hpBar(doc);
    status.append(this.nameEl, this.hp.element);
    this.objectiveEl = h(doc, "div", "hud__objective panel");
    this.objectiveEl.setAttribute("aria-live", "polite");
    this.toastEl = h(doc, "div", "hud__toast panel");
    this.toastEl.hidden = true;
    this.toastEl.setAttribute("aria-live", "polite");
    this.saveEl = h(doc, "div", "hud__save", "Salvando...");
    this.saveEl.hidden = true;
    this.element.append(status, this.objectiveEl, this.toastEl, this.saveEl);

    const s = session.signals;
    this.unsubscribe.push(
      s.on("changed", () => this.refresh()),
      s.on("objectiveChanged", () => this.refresh()),
      s.on("levelUp", (e) =>
        this.toast(
          `Subiu para o nível ${e.level}! +${e.levels} ${e.levels === 1 ? "ponto" : "pontos"} de habilidade (menu → Habilidades)`,
        ),
      ),
      s.on("itemsGained", (items) =>
        this.toast(
          items.map((i) => `+${i.count} ${this.text(`${i.ingredientId}.name`)}`).join(" · "),
        ),
      ),
      s.on("skillLearned", (id) => this.toast(`Nova habilidade: ${this.text(`${id}.name`)}!`)),
      s.on("recipeLearned", (id) => this.toast(`Nova receita: ${this.text(`${id}.name`)}!`)),
      s.on("questEvent", (e) => {
        if (e.type === "questStepCompleted") this.toast("Etapa concluída!");
      }),
    );
    this.refresh();
  }

  private text(key: string): string {
    return this.session.content.locale[key] ?? key;
  }

  refresh(): void {
    const char = this.session.state.characters[0];
    if (!char) return;
    const toNext = this.session.xpToNextLevel;
    const xp = toNext === null ? "nível máximo" : `${char.xp}/${char.xp + toNext} XP`;
    this.nameEl.textContent = `${char.name} · Nv ${char.level} · ${xp}`;
    this.hp.set(this.session.maxHp, this.session.maxHp);
    const objective = this.session.objective;
    const progress = this.session.objectiveProgress;
    const count = progress ? ` (${progress.done}/${progress.total})` : "";
    this.objectiveEl.hidden = !objective;
    this.objectiveEl.textContent = objective
      ? `◆ ${this.text(objective)}${count}
Tab: menu → Missões para o passo a passo`
      : "";
  }

  set visible(value: boolean) {
    this.element.hidden = !value;
    if (value) this.refresh();
  }

  /** Aviso curto no canto (nível, receita, etapa). */
  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), 2500);
  }

  /** Mostra "Salvando..." enquanto a promessa não termina (mínimo de 600 ms, para ser visível). */
  saving(work: Promise<unknown>): void {
    this.saveEl.hidden = false;
    const minimum = new Promise((resolve) => setTimeout(resolve, 600));
    void Promise.allSettled([work, minimum]).then(() => (this.saveEl.hidden = true));
  }

  destroy(): void {
    this.unsubscribe.forEach((off) => off());
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.element.remove();
  }
}
