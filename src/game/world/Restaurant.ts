import type { GameEvent } from "../../content/schemas/events";
import { getAvailableRecipes } from "../../core/cooking";
import { customerCoins, isEmployeeWorking } from "../../core/restaurant";
import type { SaveData } from "../../core/types";
import type { Point } from "../../engine/Camera";
import type { Npc } from "../entities/Npc";
import type { GameSession } from "../GameSession";
import { findRoute, type StepDirection } from "./guidePath";
import type { WorldManager } from "./WorldManager";

type CustomerState = "arriving" | "ordering" | "waiting" | "eating" | "paying" | "leaving";

/** O que a funcionária está fazendo agora, e para qual cliente. */
interface EmployeeTask {
  customerId: string;
  kind: "order" | "cook" | "deliver" | "collect";
  /** Tempo que falta para concluir depois de chegar ao lugar. */
  waitMs: number;
}

/** Estado do cliente que cada tarefa espera encontrar (se mudou, a tarefa é abandonada). */
const TASK_EXPECTS: Record<EmployeeTask["kind"], CustomerState> = {
  order: "ordering",
  cook: "waiting",
  deliver: "waiting",
  collect: "paying",
};

interface Customer {
  id: string;
  sprite: string;
  seat: number;
  state: CustomerState;
  recipeId: string | null;
  /** Bebida pedida junto (refri, suco) ou null. */
  drinkId: string | null;
  /** Tempo de comer que falta (estado "eating"). */
  eatLeftMs: number;
}

/** Siglas das bebidas no balão do pedido. */
const DRINK_TAGS: Record<string, string> = {
  "ing.refrigerante": "Refri",
  "ing.suco": "Suco",
};

/** Siglas das pizzas no balão do pedido. */
const RECIPE_TAGS: Record<string, string> = {
  "rec.margherita": "Margh.",
  "rec.quatro_queijos": "4 Queijos",
  "rec.brasa": "Brasa",
  "rec.defumada": "Defum.",
};

const BUBBLES: Record<CustomerState, { text: string; color: string } | null> = {
  arriving: null,
  ordering: { text: "!", color: "#c0392b" },
  waiting: null, // mostra a pizza pedida (ver bubbleOf)
  eating: { text: "...", color: "#6b5a4a" },
  paying: { text: "$", color: "#1e8449" },
  leaving: null,
};

export interface RestaurantOptions {
  world: WorldManager;
  session: GameSession;
  /** Sorteio do pedido e da aparência (0 ≤ x < 1). Nos testes, um valor fixo. */
  random?: () => number;
  /** Outro salão (balance.extraRestaurants): mapa, porta e lugares próprios, sem funcionária. */
  place?: {
    mapId: string;
    door: string;
    seats: Seat[];
    maxCustomers: number;
    employee?: NonNullable<
      NonNullable<GameSession["content"]["balance"]["restaurant"]>["employee"]
    >;
  };
}

type Seat = { x: number; y: number; direction: "up" | "down" | "left" | "right" };

/**
 * Salão da pizzaria como restaurante (balance.restaurant): clientes chegam pela porta,
 * sentam, fazem o pedido, esperam a pizza, comem, pagam e vão embora. Novos clientes vão
 * chegando enquanto houver lugar. Os clientes ficam guardados ao sair do salão (quem está
 * sentado continua lá), mas não vão para o save.
 */
export class Restaurant {
  readonly customers: Customer[] = [];
  private nextArrivalMs: number;
  private seq = 0;
  private readonly random: () => number;
  private task: EmployeeTask | null = null;

  constructor(private readonly o: RestaurantOptions) {
    this.random = o.random ?? Math.random;
    this.nextArrivalMs = this.config.firstArrivalMs;
  }

  private get config() {
    const config = this.o.session.content.balance.restaurant;
    if (!config) throw new Error("balance.restaurant ausente");
    const place = this.o.place;
    return place ? { ...config, ...place, employee: place.employee } : config;
  }

  /** Prefixo dos ids dos clientes (cada salão tem os seus). */
  private get prefix(): string {
    return this.o.place ? `${this.o.place.mapId.replace(/^map./, "")}_` : "";
  }

  /** O jogador está no salão. */
  get here(): boolean {
    return this.o.world.map?.id === this.config.mapId;
  }

  /** A funcionária está cuidando do salão (a flag dela está ligada). */
  get employeeWorking(): boolean {
    const place = this.o.place;
    if (place)
      return Boolean(place.employee && !this.o.session.state.flags[place.employee.offFlag]);
    return isEmployeeWorking(this.o.session.state as SaveData, this.o.session.content);
  }

  isCustomer(id: string): boolean {
    return this.here && this.customers.some((c) => c.id === id);
  }

  /** Ao entrar no salão: quem estava sentado volta para o lugar; quem ia embora já foi. */
  onMapLoaded(): void {
    if (!this.here) return;
    for (let i = this.customers.length - 1; i >= 0; i--) {
      if (this.customers[i]!.state === "leaving") this.customers.splice(i, 1);
    }
    for (const c of this.customers) {
      if (c.state === "arriving") c.state = "ordering";
      const seat = this.config.seats[c.seat]!;
      const npc = this.spawn(c, seat.x, seat.y);
      this.o.world.sit(npc, seat.x, seat.y, seat.direction);
      this.paint(c);
    }
  }

  update(dt: number): void {
    for (const c of this.customers) {
      if (c.state !== "eating") continue;
      c.eatLeftMs -= dt;
      if (c.eatLeftMs <= 0) {
        c.state = "paying";
        this.paint(c);
      }
    }
    const working = this.employeeWorking;
    if (this.here && this.o.world.grid) {
      this.nextArrivalMs -= dt;
      if (this.nextArrivalMs <= 0) {
        this.nextArrivalMs = this.config.arrivalEveryMs;
        this.arrive();
      }
      for (const c of [...this.customers]) {
        if (c.state === "arriving") this.walkToSeat(c);
        else if (c.state === "leaving") this.walkOut(c);
      }
    } else if (working) {
      // Com a funcionária trabalhando, o salão continua cheio mesmo com o jogador longe.
      for (const c of this.customers) if (c.state === "arriving") c.state = "ordering";
      this.nextArrivalMs -= dt;
      if (this.nextArrivalMs <= 0) {
        this.nextArrivalMs = this.config.arrivalEveryMs;
        this.arriveAway();
      }
    }
    if (working) this.updateEmployee(dt);
    else {
      this.task = null;
      if (this.here) this.walkEmployee(this.config.employee?.home);
    }
  }

  // ---------- funcionária ----------

  private employeeNpc(): Npc | undefined {
    const id = this.config.employee?.id;
    return id ? (this.o.world.entity(id) as Npc | undefined) : undefined;
  }

  /** Próxima tarefa: receber de quem quer pagar, anotar pedidos e fazer as pizzas pedidas. */
  private nextTask(): EmployeeTask | null {
    const e = this.config.employee!;
    const step = (ms: number) => (this.here ? ms : Math.max(ms, e.awayStepMs));
    const find = (state: CustomerState) => this.customers.find((c) => c.state === state);
    const paying = find("paying");
    if (paying) return { customerId: paying.id, kind: "collect", waitMs: step(e.actionMs) };
    const ordering = find("ordering");
    if (ordering) return { customerId: ordering.id, kind: "order", waitMs: step(e.actionMs) };
    const waiting = find("waiting");
    if (waiting) return { customerId: waiting.id, kind: "cook", waitMs: e.cookMs };
    return null;
  }

  private updateEmployee(dt: number): void {
    const e = this.config.employee!;
    this.task ??= this.nextTask();
    const task = this.task;
    if (!task) {
      if (this.here) this.walkEmployee(e.home);
      return;
    }
    const c = this.customers.find((x) => x.id === task.customerId);
    if (!c || c.state !== TASK_EXPECTS[task.kind]) {
      this.task = null; // o jogador atendeu antes, ou o cliente foi embora
      return;
    }
    if (this.here) {
      const seat = this.config.seats[c.seat]!;
      const arrived =
        task.kind === "cook" ? this.walkEmployee(e.kitchen) : this.walkEmployeeNextTo(seat);
      if (!arrived) return;
    }
    task.waitMs -= dt;
    if (task.waitMs > 0) return;
    switch (task.kind) {
      case "order":
        this.takeOrder(c);
        c.state = "waiting";
        this.paint(c);
        this.task = null;
        break;
      case "cook": // pizza pronta na cozinha: agora leva até a mesa
        this.task = {
          customerId: c.id,
          kind: "deliver",
          waitMs: this.here ? e.actionMs : e.awayStepMs,
        };
        break;
      case "deliver":
        c.state = "eating";
        c.eatLeftMs = this.config.eatMs;
        this.paint(c);
        this.task = null;
        break;
      case "collect": {
        this.o.session.dispatch({
          type: "customerPaid",
          byEmployee: true,
          withDrink: Boolean(c.drinkId),
        });
        const coins = customerCoins(this.o.session.content, true);
        const text = this.o.session.content.locale["nina.recebeu"] ?? "+{coins}";
        this.o.session.signals.emit("notice", text.replace("{coins}", String(coins)));
        c.state = "leaving";
        this.paint(c);
        if (!this.here) this.customers.splice(this.customers.indexOf(c), 1);
        this.task = null;
        break;
      }
    }
  }

  /** Anda até o tile. Devolve true quando já está lá. */
  private walkEmployee(to: Point | undefined): boolean {
    const npc = this.employeeNpc();
    if (!npc || !to) return true;
    if (npc.mover.moving) return false;
    if (npc.mover.tileX === to.x && npc.mover.tileY === to.y) return true;
    const step = this.nextStep(npc, (x, y) => x === to.x && y === to.y);
    if (step) npc.mover.tryStep(step, this.o.world.grid!);
    return false;
  }

  /** Anda até o lado da cadeira e vira para o cliente. Devolve true quando chegou. */
  private walkEmployeeNextTo(seat: Point): boolean {
    const npc = this.employeeNpc();
    if (!npc) return true;
    if (npc.mover.moving) return false;
    const p = npc.mover;
    if (Math.abs(p.tileX - seat.x) + Math.abs(p.tileY - seat.y) === 1) {
      p.direction =
        seat.x > p.tileX ? "right" : seat.x < p.tileX ? "left" : seat.y > p.tileY ? "down" : "up";
      return true;
    }
    const step = this.nextStep(npc, (x, y) => Math.abs(x - seat.x) + Math.abs(y - seat.y) === 1);
    if (step) npc.mover.tryStep(step, this.o.world.grid!);
    return false;
  }

  /** Conversa com o cliente: anota o pedido, entrega a pizza ou recebe o pagamento. */
  talk(id: string): GameEvent[] | null {
    const c = this.customers.find((x) => x.id === id);
    if (!c) return null;
    const say = (textKey: string): GameEvent[] => [
      { type: "message", speaker: "npc.cliente", textKey, vars: this.orderVars(c) },
    ];
    const session = this.o.session;
    switch (c.state) {
      case "ordering": {
        this.takeOrder(c);
        c.state = "waiting";
        this.paint(c);
        return say("cliente.pedido");
      }
      case "waiting": {
        const pizza = session.state.inventory.pizzas.find((p) => p.recipeId === c.recipeId);
        if (!pizza) return say("cliente.esperando");
        // Bebida: sai da mochila (comprada na loja); sem ela, o cliente avisa onde comprar.
        if (c.drinkId && (session.state.inventory.ingredients[c.drinkId] ?? 0) < 1)
          return say("cliente.falta_bebida");
        if (c.drinkId)
          session.dispatch({
            type: "takeIngredients",
            items: [{ ingredientId: c.drinkId, count: 1 }],
          });
        session.dispatch({ type: "takePizza", pizzaId: pizza.id });
        c.state = "eating";
        c.eatLeftMs = this.config.eatMs;
        this.paint(c);
        return say("cliente.entregue");
      }
      case "eating":
        return say("cliente.comendo");
      case "paying":
        session.dispatch({ type: "customerPaid", withDrink: Boolean(c.drinkId) });
        c.state = "leaving";
        this.paint(c);
        return say("cliente.paga");
      default:
        return null;
    }
  }

  /** Pedidos esperando pizza, por receita; null quando a funcionária está cuidando deles. */
  pendingOrders(): { recipeId: string; count: number }[] | null {
    if (this.employeeWorking) return null;
    const counts = new Map<string, number>();
    for (const c of this.customers) {
      if (c.state === "waiting" && c.recipeId)
        counts.set(c.recipeId, (counts.get(c.recipeId) ?? 0) + 1);
    }
    return [...counts].map(([recipeId, count]) => ({ recipeId, count }));
  }

  /** Onde a seta deve levar: clientes que querem pedir, pagar ou cuja pizza já está pronta. */
  guideTargets(): Point[] {
    const pizzas = this.o.session.state.inventory.pizzas;
    return this.customers
      .filter(
        (c) =>
          c.state === "ordering" ||
          c.state === "paying" ||
          (c.state === "waiting" && pizzas.some((p) => p.recipeId === c.recipeId)),
      )
      .map((c) => this.npc(c)?.mover)
      .filter((m) => m !== undefined)
      .map((m) => ({ x: m.tileX, y: m.tileY }));
  }

  // ---------- por dentro ----------

  private npc(c: Customer): Npc | undefined {
    return this.o.world.entity(c.id) as Npc | undefined;
  }

  private spawn(c: Customer, x: number, y: number): Npc {
    return this.o.world.addNpc(
      { kind: "npc", id: c.id, npcId: "npc.cliente", x, y, direction: "up", talking: [] },
      c.sprite,
    );
  }

  private paint(c: Customer): void {
    const npc = this.npc(c);
    if (!npc) return;
    npc.bubble =
      c.state === "waiting"
        ? {
            text:
              (RECIPE_TAGS[c.recipeId ?? ""] ?? "?") +
              (c.drinkId ? `+${DRINK_TAGS[c.drinkId] ?? "Bebida"}` : ""),
            color: "#8e3b1a",
          }
        : BUBBLES[c.state];
  }

  /** Anota o pedido: a pizza e, às vezes, uma bebida. */
  private takeOrder(c: Customer): void {
    c.recipeId = this.pickRecipe();
    const drinks = this.config.drinks ?? [];
    const chance = this.config.drinkChance ?? 0;
    c.drinkId =
      drinks.length && this.random() < chance
        ? drinks[Math.floor(this.random() * drinks.length)]!
        : null;
  }

  /** Textos do pedido: {pizza} e {bebida} (" e um Refrigerante" ou nada). */
  private orderVars(c: Customer): Record<string, string> {
    const text = (id: string) => this.o.session.content.locale[`${id}.name`] ?? id;
    return {
      pizza: c.recipeId ? text(c.recipeId) : "pizza",
      bebida: c.drinkId ? ` e um ${text(c.drinkId)}` : "",
    };
  }

  private pickRecipe(): string {
    const char = this.o.session.state.characters[0]!;
    const known = getAvailableRecipes(char, this.o.session.content);
    return known[Math.floor(this.random() * known.length)] ?? "rec.margherita";
  }

  private get door(): Point | undefined {
    const map = this.o.world.map;
    const door = map?.objects.find((o) => o.kind === "door" && o.id === this.config.door);
    return door ? { x: door.x, y: door.y } : undefined;
  }

  /** Cliente que chega com o jogador fora do salão: já aparece sentado. */
  private arriveAway(): void {
    const cfg = this.config;
    if (this.customers.length >= cfg.maxCustomers) return;
    const taken = new Set(this.customers.map((c) => c.seat));
    const free = cfg.seats.map((_, i) => i).filter((i) => !taken.has(i));
    if (free.length === 0) return;
    this.customers.push({
      id: `${this.prefix}cliente${++this.seq}`,
      sprite: cfg.sprites[Math.floor(this.random() * cfg.sprites.length)]!,
      seat: free[Math.floor(this.random() * free.length)]!,
      state: "ordering",
      recipeId: null,
      drinkId: null,
      eatLeftMs: 0,
    });
  }

  /** Um cliente novo entra pela porta, se houver cadeira livre e a porta estiver livre. */
  private arrive(): void {
    const cfg = this.config;
    const door = this.door;
    const grid = this.o.world.grid!;
    if (!door || this.customers.length >= cfg.maxCustomers || grid.isBlocked(door.x, door.y))
      return;
    const taken = new Set(this.customers.map((c) => c.seat));
    const free = cfg.seats.map((_, i) => i).filter((i) => !taken.has(i));
    if (free.length === 0) return;
    const seat = free[Math.floor(this.random() * free.length)]!;
    const c: Customer = {
      id: `${this.prefix}cliente${++this.seq}`,
      sprite: cfg.sprites[Math.floor(this.random() * cfg.sprites.length)]!,
      seat,
      state: "arriving",
      recipeId: null,
      drinkId: null,
      eatLeftMs: 0,
    };
    this.customers.push(c);
    this.spawn(c, door.x, door.y);
  }

  private walkToSeat(c: Customer): void {
    const npc = this.npc(c);
    if (!npc || npc.mover.moving) return;
    const seat = this.config.seats[c.seat]!;
    const p = npc.mover;
    if (Math.abs(p.tileX - seat.x) + Math.abs(p.tileY - seat.y) <= 1) {
      this.o.world.sit(npc, seat.x, seat.y, seat.direction);
      c.state = "ordering";
      this.paint(c);
      return;
    }
    const step = this.nextStep(npc, (x, y) => Math.abs(x - seat.x) + Math.abs(y - seat.y) === 1);
    if (step === null) {
      this.o.world.sit(npc, seat.x, seat.y, seat.direction); // sem caminho: senta direto
      c.state = "ordering";
      this.paint(c);
    } else if (step) npc.mover.tryStep(step, this.o.world.grid!); // ocupado: tenta de novo
  }

  private walkOut(c: Customer): void {
    const npc = this.npc(c);
    const door = this.door;
    if (!npc || !door || npc.mover.moving) return;
    if (npc.mover.tileX === door.x && npc.mover.tileY === door.y) {
      this.o.world.removeEntity(npc);
      this.customers.splice(this.customers.indexOf(c), 1);
      return;
    }
    const step = this.nextStep(npc, (x, y) => x === door.x && y === door.y, door);
    if (step === null) {
      this.o.world.removeEntity(npc); // sem caminho: some, para nunca travar
      this.customers.splice(this.customers.indexOf(c), 1);
    } else if (step) npc.mover.tryStep(step, this.o.world.grid!);
  }

  /**
   * Próximo passo até o objetivo, sem passar por portas (exceto `allowDoor`).
   * null = não há caminho; undefined = já está no objetivo.
   */
  private nextStep(
    npc: Npc,
    isGoal: (x: number, y: number) => boolean,
    allowDoor?: Point,
  ): StepDirection | null | undefined {
    const world = this.o.world;
    const grid = world.grid!;
    const from = { x: npc.mover.tileX, y: npc.mover.tileY };
    const walkable = (x: number, y: number) => {
      if (grid.isWall(x, y)) return false;
      const door = world.doorAt(x, y);
      return !door || (allowDoor !== undefined && x === allowDoor.x && y === allowDoor.y);
    };
    // Primeiro desvia de quem está parado no caminho (garçom, outro cliente, o jogador);
    // se não houver desvio, segue o caminho livre de paredes e espera a pessoa sair.
    const route =
      findRoute(from, isGoal, (x, y) => walkable(x, y) && !grid.isBlocked(x, y)) ??
      findRoute(from, isGoal, walkable);
    if (!route) return null;
    return route[0];
  }
}
