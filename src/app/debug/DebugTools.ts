import type { ContentRegistry } from "../../content/registry";
import type { InputManager } from "../../engine/input/InputManager";
import { TILE } from "../../engine/render/TileLayerCache";
import type { WorldScene } from "../../game/scenes/WorldScene";

/**
 * Ferramentas de depuração (ARCHITECTURE 21). Só existem em desenvolvimento:
 * o createGame as importa dinamicamente atrás de `import.meta.env.DEV`, e o build as remove.
 * F1 liga/desliga a sobreposição e o painel.
 */
export class DebugTools {
  enabled = false;
  private readonly panel: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly runners: HTMLElement;
  private readonly mapSelect: HTMLSelectElement;
  private readonly entranceSelect: HTMLSelectElement;
  private frames = 0;
  private fps = 0;
  private fpsWindowStart = performance.now();
  private ticksThisFrame = 0;
  private lastTicksPerFrame = 0;
  private updateMs = 0;
  private renderMs = 0;

  constructor(
    private readonly scene: WorldScene,
    private readonly input: InputManager,
    private readonly content: ContentRegistry,
  ) {
    injectStyles();
    this.panel = document.createElement("div");
    this.panel.className = "debug-panel";
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <strong>Depuração (F1)</strong>
      <pre class="debug-panel__stats"></pre>
      <label>Teleporte
        <select class="debug-panel__map"></select>
        <select class="debug-panel__entrance"></select>
        <button type="button">Ir</button>
      </label>
      <pre class="debug-panel__runners"></pre>`;
    this.stats = this.panel.querySelector(".debug-panel__stats")!;
    this.runners = this.panel.querySelector(".debug-panel__runners")!;
    this.mapSelect = this.panel.querySelector(".debug-panel__map")!;
    this.entranceSelect = this.panel.querySelector(".debug-panel__entrance")!;

    for (const id of Object.keys(content.maps)) this.mapSelect.add(new Option(id, id));
    this.mapSelect.addEventListener("change", () => this.fillEntrances());
    this.panel.querySelector("button")!.addEventListener("click", () => {
      this.scene.goTo(this.mapSelect.value, this.entranceSelect.value);
      this.mapSelect.blur();
    });
    this.fillEntrances();
    document.body.append(this.panel);
  }

  /** Chamado em cada tick, antes da lógica do jogo. Lê o F1 em qualquer contexto. */
  tick(updateMs: number): void {
    if (this.input.wasPressed("debug")) {
      this.enabled = !this.enabled;
      this.panel.hidden = !this.enabled;
      this.input.consume("debug");
    }
    this.ticksThisFrame += 1;
    this.updateMs = updateMs;
  }

  /** Chamado em cada quadro, depois do desenho do jogo. */
  render(ctx: CanvasRenderingContext2D, alpha: number, renderMs: number): void {
    this.renderMs = renderMs;
    this.lastTicksPerFrame = this.ticksThisFrame;
    this.ticksThisFrame = 0;
    this.frames += 1;
    const now = performance.now();
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsWindowStart));
      this.frames = 0;
      this.fpsWindowStart = now;
    }
    if (!this.enabled) return;
    this.drawOverlay(ctx, alpha);
    this.updatePanel();
  }

  destroy(): void {
    this.panel.remove();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, alpha: number): void {
    const world = this.scene.world;
    const map = world.map;
    const grid = world.grid;
    if (!map || !grid) return;
    const camera = world.camera(alpha);
    const sx = (x: number) => x * TILE - camera.x;
    const sy = (y: number) => y * TILE - camera.y;

    ctx.save();
    ctx.font = "5px monospace";
    ctx.textBaseline = "top";
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.strokeRect(sx(x) + 0.5, sy(y) + 0.5, TILE - 1, TILE - 1);
        if (grid.isWall(x, y)) {
          ctx.fillStyle = "rgba(220,40,40,0.35)";
          ctx.fillRect(sx(x), sy(y), TILE, TILE);
        }
      }
    }
    for (const [x, y, id] of grid.entries()) {
      ctx.fillStyle = "rgba(40,120,255,0.4)";
      ctx.fillRect(sx(x), sy(y), TILE, TILE);
      this.label(ctx, id, sx(x) + 1, sy(y) + 1, "#cfe0ff");
    }
    for (const object of map.objects) {
      if (object.kind !== "door") continue;
      ctx.fillStyle = "rgba(40,220,90,0.45)";
      ctx.fillRect(sx(object.x), sy(object.y), TILE, TILE);
      this.label(ctx, "porta", sx(object.x) + 1, sy(object.y) + 10, "#d6ffe0");
    }
    for (const [name, e] of Object.entries(map.entrances)) {
      ctx.strokeStyle = "#ffd23f";
      ctx.strokeRect(sx(e.x) + 2.5, sy(e.y) + 2.5, TILE - 5, TILE - 5);
      this.label(ctx, name, sx(e.x) + 1, sy(e.y) + 10, "#ffe98a");
    }
    ctx.restore();
  }

  private label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, y - 1, ctx.measureText(text).width + 2, 7);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private updatePanel(): void {
    const world = this.scene.world;
    const p = world.player.mover;
    this.stats.textContent = [
      `FPS ${this.fps}  ticks/quadro ${this.lastTicksPerFrame}`,
      `update ${this.updateMs.toFixed(2)} ms  render ${this.renderMs.toFixed(2)} ms`,
      `mapa ${world.map?.id ?? "-"}  jogador (${p.tileX},${p.tileY}) ${p.direction}`,
      `contexto de entrada: ${this.input.activeContext}`,
    ].join("\n");

    const lines: string[] = [];
    const blocking = this.scene.events.blockingRunner;
    if (blocking) lines.push(`[cena] ${describe(blocking.current)}`);
    for (const [id, runner] of this.scene.events.backgroundRunners) {
      lines.push(
        `${id}: ${describe(runner.current)}${this.scene.events.isBlocking ? " (pausado)" : ""}`,
      );
    }
    this.runners.textContent = lines.join("\n") || "(nenhum roteiro)";
  }

  private fillEntrances(): void {
    const map = this.content.maps[this.mapSelect.value];
    this.entranceSelect.replaceChildren(
      ...Object.keys(map?.entrances ?? {}).map((name) => new Option(name, name)),
    );
  }
}

function describe(event: { type: string } | undefined): string {
  if (!event) return "-";
  const { type, ...rest } = event as Record<string, unknown>;
  return `${type} ${JSON.stringify(rest)}`;
}

const STYLE_ID = "debug-tools-style";

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .debug-panel {
      position: fixed; top: 8px; left: 8px; z-index: 10; max-width: 420px;
      padding: 8px 10px; background: rgba(10, 12, 20, 0.88); color: #dfe6ff;
      font: 12px/1.4 ui-monospace, monospace; border: 1px solid #4a5580; border-radius: 4px;
    }
    .debug-panel pre { margin: 6px 0; white-space: pre-wrap; }
    .debug-panel select, .debug-panel button { font: inherit; margin-left: 4px; }
  `;
  document.head.append(style);
}
