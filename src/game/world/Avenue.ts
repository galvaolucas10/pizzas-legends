import type { GameEvent } from "../../content/schemas/events";
import { getAvailableRecipes } from "../../core/cooking";
import type { Point } from "../../engine/Camera";
import type { Npc } from "../entities/Npc";
import type { GameSession } from "../GameSession";
import { CAR_KINDS, CAR_WIDTH, drawCar, drawMoto, type CarKind } from "./vehicleArt";
import type { WorldManager } from "./WorldManager";

export interface OnlineOrder {
  id: number;
  recipeId: string;
  address: string;
}

interface Car {
  lane: number;
  x: number;
  color: string;
  kind: CarKind;
}

interface Ride {
  order: OnlineOrder;
  /** Tempo de viagem que já passou (ida e volta = rideMs). */
  elapsedMs: number;
  /** A pizza foi feita pelo garçom (ele fica com a parte dele). */
  byHelper: boolean;
}

/** Garçom preparando a pizza de um pedido online. */
interface HelperTask {
  order: OnlineOrder;
  leftMs: number;
}

const CAR_COLORS = ["#c0392b", "#2e86c1", "#27ae60", "#8e44ad", "#dfe6e9", "#2d3436"];
const CAR_W = CAR_WIDTH;

export interface AvenueOptions {
  world: WorldManager;
  session: GameSession;
  random?: () => number;
}

/**
 * Avenida (balance.avenue): carros passando nas faixas (cenário) e o motoboy dos pedidos
 * online. Pedidos chegam de tempos em tempos (com aviso no HUD); o jogador prepara a pizza e
 * leva ao motoboy, que sai de moto pela avenida, volta e paga. Nada disso vai para o save.
 */
export class Avenue {
  readonly orders: OnlineOrder[] = [];
  private cars: Car[] = [];
  private ride: Ride | null = null;
  private helperTask: HelperTask | null = null;
  /** Últimos pedidos entregues (para a tela de pedidos), mais recente primeiro. */
  private delivered: { order: OnlineOrder; coins: number }[] = [];
  private nextOrderMs: number;
  private seq = 0;
  private readonly random: () => number;

  constructor(private readonly o: AvenueOptions) {
    this.random = o.random ?? Math.random;
    this.nextOrderMs = this.config.firstOrderMs;
    const width = this.mapWidthPx();
    this.config.lanes.forEach((_, lane) => {
      for (let i = 0; i < this.config.carsPerLane; i++) {
        this.cars.push({
          lane,
          x: ((i + 0.3 * lane) / Math.max(1, this.config.carsPerLane)) * width,
          color: CAR_COLORS[(lane * 3 + i) % CAR_COLORS.length]!,
          kind: CAR_KINDS[(lane * 2 + i) % CAR_KINDS.length]!,
        });
      }
    });
    o.world.decorations.push((ctx, camera, timeMs) => this.draw(ctx, camera, timeMs));
  }

  private get config() {
    const config = this.o.session.content.balance.avenue;
    if (!config) throw new Error("balance.avenue ausente");
    return config;
  }

  private mapWidthPx(): number {
    return (this.o.session.content.maps[this.config.mapId]?.width ?? 40) * 16;
  }

  private get here(): boolean {
    return this.o.world.map?.id === this.config.mapId;
  }

  /** O motoboy está na rua entregando. */
  get riding(): boolean {
    return this.ride !== null;
  }

  isMotoboy(id: string): boolean {
    return this.here && id === this.config.motoboy;
  }

  /** Pedidos online esperando pizza, por receita (para o balcão mostrar). */
  pendingOrders(): { recipeId: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const order of this.orders)
      counts.set(order.recipeId, (counts.get(order.recipeId) ?? 0) + 1);
    return [...counts].map(([recipeId, count]) => ({ recipeId, count }));
  }

  private name(recipeId: string): string {
    return this.o.session.content.locale[`${recipeId}.name`] ?? recipeId;
  }

  private text(key: string, vars: Record<string, string>): string {
    let text = this.o.session.content.locale[key] ?? key;
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v);
    return text;
  }

  update(dt: number): void {
    const cfg = this.config;
    // Carros andam sempre (dão a volta ao sair do mapa).
    const width = this.mapWidthPx();
    for (const car of this.cars) {
      const lane = cfg.lanes[car.lane]!;
      car.x += (lane.direction * lane.speed * dt) / 1000;
      if (lane.direction > 0 && car.x > width + CAR_W) car.x = -CAR_W * 2;
      if (lane.direction < 0 && car.x < -CAR_W * 2) car.x = width + CAR_W;
    }
    // Pedidos online chegam desde o começo do jogo.
    {
      this.nextOrderMs -= dt;
      if (this.nextOrderMs <= 0) {
        this.nextOrderMs = cfg.orderEveryMs;
        this.newOrder();
      }
    }
    if (this.ride) {
      this.ride.elapsedMs += dt;
      if (this.ride.elapsedMs >= cfg.rideMs) this.finishRide();
    }
    this.updateHelper(dt);
    this.syncMotoboy();
  }

  /**
   * O garçom cuida dos pedidos online sozinho: faz a pizza, leva ao motoboy e ele sai para
   * entregar. O dinheiro vai para o saldo do jogador (menos a parte do garçom).
   */
  private updateHelper(dt: number): void {
    const helper = this.config.helper;
    if (!helper) return;
    if (!this.helperTask) {
      const order = this.orders.shift();
      if (!order) return;
      this.helperTask = { order, leftMs: helper.cookMs };
      this.notice("garcom.fazendo", { pizza: this.name(order.recipeId) });
      return;
    }
    this.helperTask.leftMs -= dt;
    if (this.helperTask.leftMs > 0 || this.ride) return; // pronta: espera a moto voltar
    const { order } = this.helperTask;
    this.helperTask = null;
    this.ride = { order, elapsedMs: 0, byHelper: true };
    this.notice("garcom.entregou_motoboy", { pizza: this.name(order.recipeId) });
  }

  private notice(key: string, vars: Record<string, string>): void {
    this.o.session.signals.emit("notice", this.text(key, vars));
  }

  /** Todos os pedidos online: na fila, sendo feito pelo garçom e a caminho com o motoboy. */
  orderList(): {
    pizza: string;
    address: string;
    status: "esperando" | "preparando" | "a caminho" | "entregue";
    coins?: number;
  }[] {
    const line = (
      o: OnlineOrder,
      status: "esperando" | "preparando" | "a caminho" | "entregue",
    ) => ({
      pizza: this.name(o.recipeId),
      address: o.address,
      status,
    });
    return [
      ...(this.ride ? [line(this.ride.order, "a caminho")] : []),
      ...(this.helperTask ? [line(this.helperTask.order, "preparando")] : []),
      ...this.orders.map((o) => line(o, "esperando")),
      ...this.delivered.map((d) => ({ ...line(d.order, "entregue"), coins: d.coins })),
    ];
  }

  /** Pedido que o garçom está preparando agora (se houver). */
  get helperCooking(): OnlineOrder | null {
    return this.helperTask?.order ?? null;
  }

  private newOrder(): void {
    const cfg = this.config;
    if (this.orders.length >= cfg.maxOrders) return;
    const char = this.o.session.state.characters[0]!;
    const known = getAvailableRecipes(char, this.o.session.content);
    const recipeId = known[Math.floor(this.random() * known.length)] ?? "rec.margherita";
    const address = cfg.addresses[Math.floor(this.random() * cfg.addresses.length)]!;
    const order = { id: ++this.seq, recipeId, address };
    this.orders.push(order);
    this.o.session.signals.emit(
      "notice",
      this.text("motoboy.novo_pedido", { pizza: this.name(recipeId), endereco: address }),
    );
  }

  /** Conversa com o motoboy: entrega a pizza de um pedido ou diz o que falta. */
  talk(): GameEvent[] | null {
    if (this.ride) return null;
    const say = (textKey: string, vars: Record<string, string> = {}): GameEvent[] => [
      { type: "message", speaker: "npc.motoboy_dudu", textKey, vars },
    ];
    if (this.orders.length === 0) return say("motoboy.sem_pedido");
    const session = this.o.session;
    const pizzas = session.state.inventory.pizzas;
    const order = this.orders.find((o) => pizzas.some((p) => p.recipeId === o.recipeId));
    if (!order) {
      const first = this.orders[0]!;
      return say("motoboy.pedido", { pizza: this.name(first.recipeId), endereco: first.address });
    }
    const pizza = pizzas.find((p) => p.recipeId === order.recipeId)!;
    session.dispatch({ type: "takePizza", pizzaId: pizza.id });
    this.orders.splice(this.orders.indexOf(order), 1);
    this.ride = { order, elapsedMs: 0, byHelper: false };
    return say("motoboy.leva", { pizza: this.name(order.recipeId), endereco: order.address });
  }

  private finishRide(): void {
    const ride = this.ride!;
    this.ride = null;
    this.o.session.dispatch({ type: "onlinePaid", byHelper: ride.byHelper });
    const cut = ride.byHelper ? (this.config.helper?.cut ?? 0) : 0;
    this.delivered = [
      { order: ride.order, coins: Math.max(0, this.config.pay - cut) },
      ...this.delivered,
    ].slice(0, 5);
    this.notice("motoboy.entregou", {
      pizza: this.name(ride.order.recipeId),
      moedas: String(Math.max(0, this.config.pay - cut)),
    });
  }

  /** Motoboy some do ponto enquanto entrega (a moto aparece na avenida). */
  private syncMotoboy(): void {
    if (!this.here) return;
    const npc = this.o.world.entity(this.config.motoboy) as Npc | undefined;
    if (npc) npc.hidden = this.ride !== null;
  }

  // ---------- desenho ----------

  private draw(ctx: CanvasRenderingContext2D, camera: Point, timeMs: number): void {
    if (!this.here) return;
    // Recorta na pista: carro chegando ou saindo não aparece fora dela.
    const map = this.o.world.map!;
    const road = this.config.road;
    ctx.save();
    ctx.beginPath();
    ctx.rect(road.fromX - camera.x, -camera.y, road.toX - road.fromX, map.height * 16);
    ctx.clip();
    this.drawTraffic(ctx, camera, timeMs);
    ctx.restore();
    // Moto estacionada ao lado do motoboy (fora da pista).
    if (!this.ride) {
      const park = this.config.park;
      drawMoto(ctx, park.x * 16 + 8 - camera.x, park.y * 16 + 10 - camera.y, 1, false, timeMs);
    }
  }

  private drawTraffic(ctx: CanvasRenderingContext2D, camera: Point, timeMs: number): void {
    const cfg = this.config;
    for (const car of this.cars) {
      const lane = cfg.lanes[car.lane]!;
      drawCar(
        ctx,
        Math.round(car.x - camera.x),
        Math.round(lane.y - camera.y),
        car.kind,
        car.color,
        lane.direction,
        timeMs,
      );
    }
    if (!this.ride) return;
    // Ida pela faixa de cima até sair da pista; volta pela de baixo até a pizzaria.
    const half = cfg.rideMs / 2;
    const parkX = cfg.park.x * 16;
    const end = cfg.road.toX + 40;
    const going = this.ride.elapsedMs < half;
    const t = going ? this.ride.elapsedMs / half : (this.ride.elapsedMs - half) / half;
    const laneUp = cfg.lanes[0]!;
    const laneDown = cfg.lanes[cfg.lanes.length - 1]!;
    const x = going ? parkX + t * (end - parkX) : end - t * (end - parkX);
    const y = going ? laneUp.y : laneDown.y;
    drawMoto(ctx, Math.round(x - camera.x), Math.round(y - camera.y), going ? 1 : -1, true, timeMs);
  }
}
