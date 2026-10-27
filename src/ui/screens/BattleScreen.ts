import type { ContentRegistry } from "../../content/registry";
import {
  BattleController,
  defaultBasket,
  PROFILE_NAMES,
  type BattleView,
  type CombatantView,
} from "../../game/battle/BattleController";
import type { BattleOutcome, BattleRequest } from "../../game/events/EventRunner";
import type { GameSession } from "../../game/GameSession";
import { DialogueBox } from "../components/DialogueBox";
import { Menu, type UiInput } from "../components/Menu";
import { h, hpBar } from "../dom";

export interface BattleScreenOptions {
  doc: Document;
  /** Onde a tela é montada (a camada de UI). */
  root: HTMLElement;
  session: GameSession;
  content: ContentRegistry;
  request: BattleRequest;
  input: UiInput;
  /** URL de um ícone do manifesto (ou null). */
  iconUrl(assetId: string): string | null;
}

type Phase = "basket" | "log" | "menu" | "slices" | "result" | "done";

/**
 * Tela da batalha (F1-13/F1-14, GDD 11.2): cesta → turnos (intenção, PV, efeitos, fatias)
 * → resumo. Conduz o BattleController; o canvas (BattleScene) só desenha os lutadores.
 */
export class BattleScreen {
  outcome: BattleOutcome | null = null;
  readonly hits = { player: 0, enemy: 0 };
  enemyDown = false;

  private readonly root: HTMLElement;
  private readonly enemyHud: CombatantHud;
  private readonly playerHud: CombatantHud;
  private readonly intentEl: HTMLElement;
  private readonly log: DialogueBox;
  private readonly menu: Menu;
  private readonly menuBox: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelMenu: Menu;
  private readonly panelBody: HTMLElement;
  private phase: Phase = "basket";
  private controller: BattleController | null = null;
  private queue: string[] = [];
  private afterLog: (() => void) | null = null;
  private basket = new Set<string>();

  constructor(private readonly o: BattleScreenOptions) {
    const doc = o.doc;
    this.root = h(doc, "div", "battle");
    this.enemyHud = new CombatantHud(doc, "battle__hud battle__hud--enemy");
    this.intentEl = h(doc, "div", "battle__intent");
    this.enemyHud.element.append(this.intentEl);
    this.playerHud = new CombatantHud(doc, "battle__hud battle__hud--player");
    // As caixas de PV só aparecem quando a luta começa (depois da cesta).
    this.enemyHud.element.hidden = true;
    this.playerHud.element.hidden = true;
    this.log = new DialogueBox(doc);
    this.log.element.classList.add("battle__log");
    this.menuBox = h(doc, "div", "battle__menu panel");
    this.menu = new Menu(doc);
    this.menuBox.append(this.menu.element);
    this.menuBox.hidden = true;
    this.panel = h(doc, "div", "battle__panel panel");
    this.panelBody = h(doc, "div", "battle__panel-body");
    this.panelMenu = new Menu(doc);
    this.panel.append(this.panelBody, this.panelMenu.element);
    this.panel.hidden = true;
    this.root.append(
      this.enemyHud.element,
      this.playerHud.element,
      this.log.element,
      this.menuBox,
      this.panel,
    );
    o.root.append(this.root);

    this.menu.onRefuse = (reason) => this.say([reason], () => this.showMenu());
    this.panelMenu.onRefuse = (reason) => this.flashPanelNote(reason);

    const pizzas = this.availablePizzas();
    if (pizzas.length > 0) {
      for (const id of defaultBasket(o.session, o.content)) this.basket.add(id);
      this.showBasket();
    } else {
      this.begin([]);
    }
  }

  private get content(): ContentRegistry {
    return this.o.content;
  }

  private text(key: string): string {
    return this.content.locale[key] ?? key;
  }

  private availablePizzas() {
    return this.o.session.state.inventory.pizzas.filter((p) => p.slicesLeft > 0);
  }

  // ---------- Cesta (F1-14) ----------

  private showBasket(): void {
    this.phase = "basket";
    const doc = this.o.doc;
    const enemy = this.content.enemies[this.o.request.enemyId]!;
    const beats = Object.entries(this.content.balance.profileBeats).find(
      ([, loser]) => loser === enemy.profile,
    )?.[0];
    const max = this.content.balance.basketSize;
    this.panelBody.replaceChildren(
      h(doc, "h2", "panel__title", "Monte a cesta"),
      h(
        doc,
        "p",
        "panel__text",
        `${this.text(`${enemy.id}.name`)} · perfil ${PROFILE_NAMES[enemy.profile] ?? enemy.profile}` +
          (beats ? ` · fraco contra ${PROFILE_NAMES[beats]}` : ""),
      ),
      h(doc, "p", "panel__hint", `Leve até ${max} pizzas. Confirmar marca ou desmarca.`),
    );
    const refresh = () => {
      const pizzas = this.availablePizzas();
      this.panelMenu.setItems(
        [
          {
            label: "Lutar!",
            detail: `${this.basket.size}/${max}`,
            onSelect: () => this.begin([...this.basket]),
          },
          ...pizzas.map((p) => {
            const selected = this.basket.has(p.id);
            const strong = beats === p.profile;
            return {
              label: `${this.text(`${p.recipeId}.name`)} Q${p.quality}`,
              mark: selected ? "✔" : "·",
              detail: `${PROFILE_NAMES[p.profile]}${strong ? " ★" : ""} · ${p.slicesLeft}/${p.maxSlices}`,
              disabled: !selected && this.basket.size >= max,
              reason: `A cesta já tem ${max} pizzas.`,
              onSelect: () => {
                if (selected) this.basket.delete(p.id);
                else this.basket.add(p.id);
                refresh();
              },
            };
          }),
        ],
        true,
      );
    };
    this.panel.hidden = false;
    this.panel.dataset.kind = "basket";
    refresh();
  }

  // ---------- Luta ----------

  private begin(basket: string[]): void {
    this.panel.hidden = true;
    const { session, content, request } = this.o;
    this.controller = new BattleController(
      session,
      content,
      request.enemyId,
      basket,
      request.enemyGlobalId,
    );
    this.refreshHud();
    const name = this.text(`${request.enemyId}.name`);
    this.say([`${name} quer um duelo culinário!`, ...this.controller.openingMessages], () =>
      this.next(),
    );
  }

  /** Depois das mensagens: fim da luta ou nova escolha. */
  private next(): void {
    if (this.controller?.finished) this.showResult();
    else this.showMenu();
  }

  private showMenu(): void {
    const c = this.controller!;
    const view = c.view();
    this.phase = "menu";
    this.log.show("O que você vai fazer?");
    this.log.complete();
    const slices = view.basket.some((p) => p.slicesLeft > 0);
    this.menu.onCancel = undefined;
    this.menu.setItems([
      slices
        ? { label: "Servir fatia", onSelect: () => this.showSlices() }
        : {
            label: "Improvisar",
            detail: `${this.content.balance.improviseDamage} dano`,
            onSelect: () => this.choose({ kind: "improvise" }),
          },
      {
        label: "Defender",
        detail: "−50% dano",
        onSelect: () => this.choose({ kind: "defend" }),
      },
      {
        label: "Fugir",
        disabled: !view.enemy.canFlee,
        reason: "Não dá para fugir deste duelo!",
        onSelect: () => this.choose({ kind: "flee" }),
      },
    ]);
    this.menuBox.hidden = false;
    this.menuBox.dataset.kind = "main";
  }

  private showSlices(): void {
    const view = this.controller!.view();
    this.phase = "slices";
    this.menu.onCancel = () => this.showMenu();
    this.menu.onFocus = (_item, index) => {
      const pizza = view.basket.filter((p) => p.slicesLeft > 0)[index];
      if (pizza) {
        this.log.show(pizza.summary || "Sem efeito extra.");
        this.log.complete();
      }
    };
    this.menu.setItems(
      view.basket
        .filter((p) => p.slicesLeft > 0)
        .map((p) => ({
          label: `${p.name} ${p.slicesLeft}/${p.maxSlices}`,
          detail:
            (p.predictedDamage ? `${p.predictedDamage} dano` : "suporte") +
            (p.effectiveness === "strong" ? " ★" : p.effectiveness === "weak" ? " ▼" : ""),
          onSelect: () => this.choose({ kind: "slice", pizzaId: p.id }),
        })),
    );
    this.menuBox.dataset.kind = "slices";
  }

  private choose(choice: Parameters<BattleController["choose"]>[0]): void {
    const c = this.controller!;
    this.menu.onFocus = undefined;
    this.menuBox.hidden = true;
    const before = c.view();
    const messages = c.choose(choice);
    const after = c.view();
    if (after.player.hp < before.player.hp) this.hits.player += 1;
    if (after.enemy.hp < before.enemy.hp) this.hits.enemy += 1;
    if (after.phase === "victory") this.enemyDown = true;
    this.refreshHud();
    this.say(messages, () => this.next());
  }

  // ---------- Resultado ----------

  private showResult(): void {
    const c = this.controller!;
    const summary = c.finish();
    const outcome: BattleOutcome = summary.phase;
    this.phase = "result";
    this.menuBox.hidden = true;
    if (summary.phase === "fled") {
      this.finish(outcome);
      return;
    }
    const doc = this.o.doc;
    const lines: HTMLElement[] = [];
    if (summary.phase === "victory") {
      lines.push(h(doc, "h2", "panel__title", "Vitória!"));
      lines.push(h(doc, "p", "panel__text", `+${summary.xp} XP`));
      if (summary.levelUp)
        lines.push(
          h(doc, "p", "panel__text panel__good", `Subiu para o nível ${summary.levelUp}!`),
        );
      if (summary.drops.length) {
        lines.push(h(doc, "p", "panel__text", "Ingredientes:"));
        const list = h(doc, "ul", "panel__list");
        for (const d of summary.drops) list.append(h(doc, "li", "", `${d.name} ×${d.count}`));
        lines.push(list);
      }
    } else {
      lines.push(h(doc, "h2", "panel__title", "Derrota..."));
      lines.push(
        h(
          doc,
          "p",
          "panel__text",
          "Você perdeu as fatias usadas, mas guarda XP, ingredientes e progresso. Hora de voltar ao forno.",
        ),
      );
    }
    this.panelBody.replaceChildren(...lines);
    this.panelMenu.onCancel = undefined;
    this.panelMenu.setItems([{ label: "Continuar", onSelect: () => this.finish(outcome) }]);
    this.panel.dataset.kind = "result";
    this.panel.hidden = false;
  }

  private finish(outcome: BattleOutcome): void {
    this.phase = "done";
    this.outcome = outcome;
  }

  // ---------- Mensagens ----------

  private say(messages: string[], then: () => void): void {
    this.queue = [...messages];
    this.afterLog = then;
    this.phase = "log";
    this.menuBox.hidden = true;
    this.showNextMessage();
  }

  private showNextMessage(): void {
    const message = this.queue.shift();
    if (message === undefined) {
      const then = this.afterLog;
      this.afterLog = null;
      then?.();
      return;
    }
    this.log.show(message);
  }

  private flashPanelNote(reason: string): void {
    const note = h(this.o.doc, "p", "panel__note", reason);
    this.panelBody.querySelector(".panel__note")?.remove();
    this.panelBody.append(note);
  }

  update(dt: number): void {
    const input = this.o.input;
    switch (this.phase) {
      case "log":
        this.log.update(dt);
        if (input.wasPressed("confirm")) {
          input.consume("confirm");
          if (this.log.typing) this.log.complete();
          else this.showNextMessage();
        }
        break;
      case "menu":
      case "slices":
        this.menu.handle(input);
        break;
      case "basket":
      case "result":
        this.panelMenu.handle(input);
        break;
      case "done":
        break;
    }
  }

  private refreshHud(): void {
    const view = this.controller?.view();
    if (!view) return;
    this.enemyHud.element.hidden = false;
    this.playerHud.element.hidden = false;
    this.enemyHud.set(view.enemy, null);
    this.playerHud.set(view.player, view.turn);
    this.paintIntent(view);
  }

  private paintIntent(view: BattleView): void {
    const doc = this.o.doc;
    if (!view.intent || view.phase !== "playerChoice") {
      this.intentEl.replaceChildren();
      return;
    }
    const url = this.o.iconUrl(view.intent.icon);
    const parts: HTMLElement[] = [h(doc, "span", "battle__intent-tag", "Próximo:")];
    if (url) {
      const img = h(doc, "img", "icon");
      img.src = url;
      img.alt = "";
      parts.push(img);
    }
    parts.push(
      h(
        doc,
        "span",
        "",
        `${view.intent.name}${view.intent.detail ? ` (${view.intent.detail})` : ""}`,
      ),
    );
    this.intentEl.replaceChildren(...parts);
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Caixa com nome, perfil, PV e efeitos de um lutador. */
class CombatantHud {
  readonly element: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly profileEl: HTMLElement;
  private readonly hp: ReturnType<typeof hpBar>;
  private readonly statusEl: HTMLElement;

  constructor(
    private readonly doc: Document,
    className: string,
  ) {
    this.element = h(doc, "div", `${className} panel`);
    const top = h(doc, "div", "battle__hud-top");
    this.nameEl = h(doc, "span", "battle__name");
    this.profileEl = h(doc, "span", "battle__profile");
    top.append(this.nameEl, this.profileEl);
    this.statusEl = h(doc, "div", "battle__statuses");
    this.hp = hpBar(doc);
    this.element.append(top, this.hp.element, this.statusEl);
  }

  set(c: CombatantView, turn: number | null): void {
    this.nameEl.textContent = c.name;
    this.profileEl.textContent = turn !== null ? `Turno ${turn}` : c.profileName;
    this.hp.set(c.hp, c.maxHp);
    this.statusEl.replaceChildren(
      ...c.statuses.map((s) =>
        h(
          this.doc,
          "span",
          "chip",
          `${s.name}${s.remaining !== null ? ` ${s.remaining}` : ""}${s.value ? ` (${s.value})` : ""}`,
        ),
      ),
    );
  }
}
