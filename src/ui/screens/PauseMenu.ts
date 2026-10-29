import type { ContentRegistry } from "../../content/registry";
import type { Skill } from "../../content/schemas/gameplay";
import { PROFILE_NAMES } from "../../game/battle/BattleController";
import type { GameSession, ShopError, SkillError } from "../../game/GameSession";
import { Menu, type MenuItem, type UiInput } from "../components/Menu";
import { h } from "../dom";

export interface PauseMenuOptions {
  doc: Document;
  root: HTMLElement;
  session: GameSession;
  content: ContentRegistry;
  input: UiInput;
  /** URL de um ícone do manifesto (ou null). */
  iconUrl(assetId: string): string | null;
  /** Abre direto na loja (mercadinho da Lia); Esc fecha. */
  shopOnly?: { title: string };
  /** Abre a escolha de controles (computador ou celular) por cima do menu. */
  openControls?(): void;
  /** Liga/desliga a música de fundo. */
  music?: { readonly enabled: boolean; toggle(): void };
}

const QUEST_STATUS: Record<string, string> = {
  active: "Em andamento",
  completed: "Concluída",
  rewarded: "Concluída",
  available: "Disponível",
  unavailable: "Bloqueada",
};

const TIER_NAMES = ["", "I", "II", "III"] as const;

/** Posições no menu principal (para voltar com o foco nelas). */
const SKILLS_PAGE = 2;
const SHOP_PAGE = 5;

/**
 * Menu de pausa (F1-09, F2-03, GDD 11.2): mochila (pizzas e ingredientes), árvore de
 * habilidades, missões e status.
 */
export class PauseMenu {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly titleEl: HTMLElement;
  private readonly side: HTMLElement;
  private readonly noteEl: HTMLElement;

  constructor(private readonly o: PauseMenuOptions) {
    const doc = o.doc;
    this.root = h(doc, "div", "overlay");
    const box = h(doc, "div", "panel pause");
    this.titleEl = h(doc, "h2", "panel__title");
    const columns = h(doc, "div", "oven__columns");
    this.menu = new Menu(doc, "oven__menu");
    this.side = h(doc, "div", "oven__side");
    columns.append(this.menu.element, this.side);
    this.noteEl = h(doc, "p", "panel__note");
    this.noteEl.setAttribute("aria-live", "polite");
    box.append(
      this.titleEl,
      columns,
      this.noteEl,
      h(doc, "p", "panel__hint", "↑↓ escolher · Enter abrir · Esc voltar · Tab fechar"),
    );
    this.root.append(box);
    o.root.append(this.root);
    this.menu.onRefuse = (reason) => this.note(reason);
    if (o.shopOnly) this.showShop();
    else this.showMain();
  }

  private text(key: string): string {
    return this.o.content.locale[key] ?? key;
  }

  private note(message: string, good = false): void {
    this.noteEl.textContent = message;
    this.noteEl.classList.toggle("panel__good", good);
  }

  private showMain(focus = 0): void {
    this.titleEl.textContent = "Menu";
    const points = this.o.session.state.characters[0]?.skillPoints ?? 0;
    const pages: (MenuItem & { paint(): void })[] = [
      { label: "Pizzas", paint: () => this.paintPizzas() },
      { label: "Ingredientes", paint: () => this.paintIngredients() },
      {
        label: "Habilidades",
        detail: points > 0 ? `${points} pt` : undefined,
        paint: () => this.paintSkillTree(),
        onSelect: () => this.showSkills(),
      },
      { label: "Missões (guia)", paint: () => this.paintQuests() },
      { label: "Status", paint: () => this.paintStatus() },
    ];
    const openControls = this.o.openControls;
    if (openControls) {
      pages.push({
        label: "🎮 Controles",
        paint: () =>
          this.side.replaceChildren(
            h(this.o.doc, "p", "panel__text", "Escolha jogar no computador ou no celular."),
          ),
        onSelect: () => openControls(),
      });
    }
    const music = this.o.music;
    if (music) {
      const index = pages.length;
      pages.push({
        label: music.enabled ? "🎵 Música: ligada" : "🔇 Música: desligada",
        paint: () =>
          this.side.replaceChildren(
            h(this.o.doc, "p", "panel__text", "Enter liga ou desliga a música de fundo."),
          ),
        onSelect: () => {
          music.toggle();
          this.showMain(index);
        },
      });
    }
    this.menu.onFocus = (_item, index) => pages[index]?.paint();
    this.menu.onCancel = () => (this.done = true);
    this.menu.setItems([...pages, { label: "Fechar", onSelect: () => (this.done = true) }], focus);
  }

  private paintPizzas(): void {
    const doc = this.o.doc;
    const pizzas = this.o.session.state.inventory.pizzas;
    if (pizzas.length === 0) {
      this.side.replaceChildren(
        h(doc, "p", "panel__text", "Nenhuma pizza na mochila."),
        h(doc, "p", "panel__hint", "Prepare pizzas em um forno."),
      );
      return;
    }
    const list = h(doc, "ul", "panel__list");
    for (const p of pizzas) {
      const li = h(doc, "li", "row");
      li.append(
        h(doc, "span", "", `${this.text(`${p.recipeId}.name`)} Q${p.quality}`),
        h(
          doc,
          "span",
          "row__detail",
          `${PROFILE_NAMES[p.profile]} · ${p.slicesLeft}/${p.maxSlices} fatias`,
        ),
      );
      list.append(li);
    }
    this.side.replaceChildren(
      list,
      h(doc, "p", "panel__hint", `${pizzas.length}/${this.o.content.balance.maxPizzas} pizzas`),
    );
  }

  private paintIngredients(): void {
    const doc = this.o.doc;
    const stock = Object.entries(this.o.session.state.inventory.ingredients).filter(
      ([, n]) => n > 0,
    );
    if (stock.length === 0) {
      this.side.replaceChildren(h(doc, "p", "panel__text", "Mochila vazia."));
      return;
    }
    const list = h(doc, "ul", "panel__list");
    for (const [id, count] of stock) {
      const li = h(doc, "li", "row");
      const name = h(doc, "span", "row__name");
      const url = this.o.iconUrl(`icon.${id.replace(/^ing\./, "ing_")}`);
      if (url) {
        const img = h(doc, "img", "icon");
        img.src = url;
        img.alt = "";
        name.append(img);
      }
      name.append(doc.createTextNode(this.text(`${id}.name`)));
      li.append(name, h(doc, "span", "row__detail", `×${count}`));
      list.append(li);
    }
    this.side.replaceChildren(list);
  }

  // ---------- Loja ----------

  private ingredientRow(id: string): HTMLElement {
    const doc = this.o.doc;
    const name = h(doc, "span", "row__name");
    const url = this.o.iconUrl(`icon.${id.replace(/^ing./, "ing_")}`);
    if (url) {
      const img = h(doc, "img", "icon");
      img.src = url;
      img.alt = "";
      name.append(img);
    }
    name.append(doc.createTextNode(this.text(`${id}.name`)));
    return name;
  }

  private shopErrorText(error: ShopError): string {
    switch (error.kind) {
      case "notEnoughCoins":
        return `Moedas insuficientes: custa ${error.need}, você tem ${error.have}.`;
      case "stackFull":
        return `Você já tem o máximo (${error.max}).`;
      case "notForSale":
        return "Esse item não está à venda.";
    }
  }

  private showShop(focus = 0): void {
    const { session } = this.o;
    const items = session.shopItems();
    const shopOnly = this.o.shopOnly;
    this.titleEl.textContent = `${shopOnly?.title ?? "Loja"} · ${session.coins} moedas`;
    this.menu.onCancel = shopOnly ? () => (this.done = true) : () => this.showMain(SHOP_PAGE);
    this.menu.onFocus = (_item, index) => {
      const item = items[index];
      if (item) this.paintShopItem(item.ingredientId, item.price);
    };
    this.menu.setItems(
      [
        ...items.map(({ ingredientId, price }, index) => ({
          label: this.text(`${ingredientId}.name`),
          detail: `${price} moedas`,
          disabled: session.coins < price,
          reason: `Moedas insuficientes: custa ${price}, você tem ${session.coins}.`,
          onSelect: () => {
            const r = session.dispatch({ type: "buyIngredient", ingredientId, count: 1 });
            if (r.ok) this.note(`Comprou 1 ${this.text(`${ingredientId}.name`)}!`, true);
            else this.note(this.shopErrorText(r.error as ShopError));
            this.showShop(index);
          },
        })),
        // Sair/voltar na própria lista (no celular não tem Esc).
        {
          label: shopOnly ? "Sair" : "Voltar",
          onSelect: shopOnly ? () => (this.done = true) : () => this.showMain(SHOP_PAGE),
        },
      ],
      focus,
    );
  }

  private paintShopItem(ingredientId: string, price: number): void {
    const doc = this.o.doc;
    const { session, content } = this.o;
    const ing = content.ingredients[ingredientId];
    const stats = h(doc, "dl", "stats");
    const add = (label: string, value: string) =>
      stats.append(h(doc, "dt", "", label), h(doc, "dd", "", value));
    add("Preço", `${price} moedas`);
    add("Na mochila", `${session.state.inventory.ingredients[ingredientId] ?? 0}`);
    if (ing) add("Tipo", CATEGORY_LABELS[ing.category] ?? ing.category);
    this.side.replaceChildren(
      this.ingredientRow(ingredientId),
      stats,
      h(doc, "p", "panel__hint", `Você tem ${session.coins} moedas · Enter compra 1`),
    );
  }

  // ---------- Habilidades (F2-03) ----------

  /** Habilidades na ordem da árvore: ramo a ramo, do nível 1 ao 3. */
  private skillList(): Skill[] {
    const { branches, skills } = this.o.content;
    const order = (branchId: string) => branches[branchId]?.order ?? 0;
    return Object.values(skills).sort(
      (a, b) => order(a.branchId) - order(b.branchId) || a.tier - b.tier,
    );
  }

  private skillName(skillId: string): string {
    return this.text(`${skillId}.name`);
  }

  private blockerText(error: SkillError): string {
    switch (error.kind) {
      case "alreadyLearned":
        return "Você já aprendeu esta habilidade.";
      case "missingRequirement":
        return `Primeiro aprenda ${this.skillName(error.skillId)}.`;
      case "levelTooLow":
        return `Precisa estar no nível ${error.minLevel}.`;
      case "notEnoughPoints":
        return `Pontos insuficientes: custa ${error.need}, você tem ${error.have}.`;
      case "unknownSkill":
        return "Habilidade desconhecida.";
    }
  }

  private pointsLabel(n: number): string {
    return `${n} ${n === 1 ? "ponto" : "pontos"}`;
  }

  /** Visão geral: os três ramos com o estado de cada habilidade (símbolo + texto, GDD 11.3). */
  private paintSkillTree(): void {
    const doc = this.o.doc;
    const { session, content } = this.o;
    const char = session.state.characters[0]!;
    const list = h(doc, "ul", "panel__list");
    const branches = Object.values(content.branches).sort((a, b) => a.order - b.order);
    for (const branch of branches) {
      const li = h(doc, "li", "quest");
      li.append(h(doc, "strong", "", this.text(`${branch.id}.name`)));
      const line = this.skillList()
        .filter((s) => s.branchId === branch.id)
        .map((s) => {
          const learned = char.skills.includes(s.id);
          const open = !learned && !session.skillBlocker(s.id);
          return `${learned ? "✔" : open ? "●" : "○"} ${this.skillName(s.id)}`;
        })
        .join(" → ");
      li.append(h(doc, "p", "panel__text", line));
      list.append(li);
    }
    this.side.replaceChildren(
      h(doc, "p", "panel__text", `Pontos de habilidade: ${char.skillPoints}`),
      list,
      h(doc, "p", "panel__hint", "✔ aprendida · ● pode aprender · ○ bloqueada"),
    );
  }

  private showSkills(focus = 0): void {
    const { session } = this.o;
    const char = session.state.characters[0]!;
    const skills = this.skillList();
    this.titleEl.textContent = `Habilidades · ${this.pointsLabel(char.skillPoints)}`;
    this.menu.onCancel = () => this.showMain(SKILLS_PAGE);
    this.menu.onFocus = (_item, index) => {
      const skill = skills[index];
      if (skill) this.paintSkill(skill);
    };
    this.menu.setItems(
      skills.map((skill, index) => {
        const learned = char.skills.includes(skill.id);
        const blocker = session.skillBlocker(skill.id);
        const branch = this.text(`${skill.branchId}.name`);
        return {
          label: `${branch} ${TIER_NAMES[skill.tier]} · ${this.skillName(skill.id)}`,
          mark: learned ? "✔" : undefined,
          detail: learned ? "aprendida" : `${skill.cost} pt`,
          disabled: blocker !== null,
          reason: blocker ? this.blockerText(blocker) : undefined,
          onSelect: () => this.showConfirm(skill, index),
        };
      }),
      focus,
    );
  }

  /** Detalhe de uma habilidade: o efeito aparece antes de confirmar (GDD 11.3). */
  private paintSkill(skill: Skill): void {
    const doc = this.o.doc;
    const { session } = this.o;
    const char = session.state.characters[0]!;
    const learned = char.skills.includes(skill.id);
    const blocker = session.skillBlocker(skill.id);
    const stats = h(doc, "dl", "stats");
    const add = (label: string, value: string) =>
      stats.append(h(doc, "dt", "", label), h(doc, "dd", "", value));
    add("Custo", this.pointsLabel(skill.cost));
    for (const reqId of skill.requires) {
      add("Requer", `${char.skills.includes(reqId) ? "✔" : "✗"} ${this.skillName(reqId)}`);
    }
    if (skill.minLevel) {
      add("Nível mínimo", `${char.level >= skill.minLevel ? "✔" : "✗"} ${skill.minLevel}`);
    }
    const status = learned
      ? "✔ Você já tem esta habilidade."
      : blocker
        ? this.blockerText(blocker)
        : "Enter para aprender.";
    this.side.replaceChildren(
      h(doc, "strong", "", this.skillName(skill.id)),
      h(
        doc,
        "p",
        "row__detail",
        `${this.text(`${skill.branchId}.name`)} · nível ${TIER_NAMES[skill.tier]} da árvore`,
      ),
      h(doc, "p", "panel__text", this.text(`${skill.id}.desc`)),
      stats,
      h(doc, "p", "panel__hint", status),
    );
  }

  private showConfirm(skill: Skill, index: number): void {
    const { session } = this.o;
    const points = session.state.characters[0]!.skillPoints;
    const name = this.skillName(skill.id);
    this.titleEl.textContent = `Aprender ${name}?`;
    this.paintSkill(skill);
    this.side.append(
      h(
        this.o.doc,
        "p",
        "panel__text",
        `Pontos: ${points} → ${points - skill.cost}. Não dá para desfazer.`,
      ),
    );
    this.menu.onCancel = () => this.showSkills(index);
    this.menu.onFocus = undefined;
    this.menu.setItems([
      {
        label: "Aprender",
        detail: this.pointsLabel(skill.cost),
        onSelect: () => {
          const result = session.dispatch({ type: "learnSkill", skillId: skill.id });
          if (result.ok) this.note(`Você aprendeu ${name}!`, true);
          else this.note(this.blockerText(result.error as SkillError));
          this.showSkills(index);
        },
      },
      { label: "Cancelar", onSelect: () => this.showSkills(index) },
    ]);
  }

  // ---------- Missões e status ----------

  private paintQuests(): void {
    const doc = this.o.doc;
    const { session, content } = this.o;
    const list = h(doc, "ul", "panel__list");
    for (const quest of Object.values(content.quests)) {
      const status = session.questStatus(quest.id);
      if (status === "unavailable") continue;
      const li = h(doc, "li", "quest");
      li.append(
        h(doc, "strong", "", this.text(`${quest.id}.name`)),
        h(doc, "span", "row__detail", ` · ${QUEST_STATUS[status] ?? status}`),
      );
      const step = session.state.quests[quest.id]?.step ?? 0;
      const objective = status === "active" ? quest.steps[step]?.objectiveKey : undefined;
      if (objective) {
        const progress = session.stepProgress(quest.id);
        const count = progress ? ` (${progress.done}/${progress.total})` : "";
        li.append(h(doc, "p", "panel__text", `${this.text(objective)}${count}`));
        const guide = this.o.content.locale[`${objective}.guia`];
        if (guide) li.append(h(doc, "p", "panel__hint", guide));
      }
      list.append(li);
    }
    this.side.replaceChildren(
      list.childElementCount ? list : h(doc, "p", "panel__text", "Nenhuma missão ainda."),
    );
  }

  private paintStatus(): void {
    const doc = this.o.doc;
    const { session } = this.o;
    const char = session.state.characters[0]!;
    const next = session.xpToNextLevel;
    const stats = h(doc, "dl", "stats");
    for (const [label, value] of [
      ["Nome", char.name],
      ["Nível", `${char.level}`],
      ["PV", `${session.maxHp}`],
      ["XP", `${char.xp}${next !== null ? ` (faltam ${next})` : ""}`],
      ["Receitas", `${char.knownRecipes.length}`],
      ["Habilidades", `${char.skills.length}/${Object.keys(this.o.content.skills).length}`],
      ["Pontos de habilidade", `${char.skillPoints}`],
    ] as const) {
      stats.append(h(doc, "dt", "", label), h(doc, "dd", "", value));
    }
    const minutes = Math.floor(session.state.stats.playTimeMs / 60000);
    this.side.replaceChildren(stats, h(doc, "p", "panel__hint", `Tempo de jogo: ${minutes} min`));
  }

  update(): void {
    if (this.done) return;
    const input = this.o.input;
    if (input.wasPressed("menu")) {
      input.consume("menu");
      this.done = true;
      return;
    }
    this.menu.handle(input);
  }

  destroy(): void {
    this.root.remove();
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  massa: "Massa",
  bebida: "Bebida",
  molho: "Molho",
  queijo: "Queijo",
  cobertura: "Cobertura (opcional)",
};
