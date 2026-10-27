import type { ContentRegistry } from "../../content/registry";
import type { AssetLoader } from "../../engine/assets/AssetLoader";
import type { InputManager } from "../../engine/input/InputManager";
import { VIEW_H, VIEW_W } from "../../engine/render/viewport";
import type { Scene } from "../../engine/SceneStack";
import type { BattleOutcome } from "../events/EventRunner";

/**
 * Tela da batalha em DOM (implementada em ui/): mostra PV, intenção, cesta e ações,
 * e conduz a luta pelo BattleController. A cena só desenha os lutadores no canvas.
 */
export interface BattleScreenPort {
  update(dt: number): void;
  /** Resultado, quando o jogador fecha o resumo. */
  readonly outcome: BattleOutcome | null;
  /** Golpes recebidos por lado (a cena pisca o sprite quando o número sobe). */
  readonly hits: { player: number; enemy: number };
  /** O inimigo foi derrotado (o sprite some). */
  readonly enemyDown: boolean;
  destroy(): void;
}

export interface BattleSceneOptions {
  content: ContentRegistry;
  assets: AssetLoader;
  input: InputManager;
  enemyId: string;
  heroSprite: string;
  screen: BattleScreenPort;
  /** Chamado uma vez, quando a tela termina. */
  onClose(outcome: BattleOutcome): void;
}

const FLASH_MS = 400;
const SCALE = 2;

/** Batalha (F1-13): cena por cima do mundo, que fica pausado embaixo. */
export class BattleScene implements Scene {
  readonly blocksUpdateBelow = true;
  private time = 0;
  private closed = false;
  private flash = { player: 0, enemy: 0 };
  private seen = { player: 0, enemy: 0 };

  constructor(private readonly options: BattleSceneOptions) {}

  enter(): void {
    this.options.input.pushContext("battle");
  }

  exit(): void {
    this.options.input.popContext("battle");
    this.options.screen.destroy();
  }

  update(dt: number): void {
    this.time += dt;
    const { screen } = this.options;
    screen.update(dt);
    for (const side of ["player", "enemy"] as const) {
      if (screen.hits[side] > this.seen[side]) {
        this.seen[side] = screen.hits[side];
        this.flash[side] = FLASH_MS;
      }
      this.flash[side] = Math.max(0, this.flash[side] - dt);
    }
    if (screen.outcome && !this.closed) {
      this.closed = true;
      this.options.onClose(screen.outcome);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.time);
    const { content, enemyId, heroSprite, screen } = this.options;
    const enemySprite = content.enemies[enemyId]?.sprite;
    // Inimigo ao fundo (de frente), herói à frente (de costas), como no tutorial.
    if (enemySprite && !screen.enemyDown)
      this.drawFighter(ctx, enemySprite, 0, 286, 96, this.flash.enemy, 1);
    this.drawFighter(ctx, heroSprite, 2, 104, 146, this.flash.player, 0);
  }

  private drawFighter(
    ctx: CanvasRenderingContext2D,
    imageId: string,
    row: number,
    centerX: number,
    feetY: number,
    flash: number,
    bobPhase: number,
  ): void {
    // Plataforma.
    ctx.fillStyle = "#00000033";
    ctx.beginPath();
    ctx.ellipse(centerX, feetY - 2, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (flash > 0 && Math.floor(flash / 80) % 2 === 0) return; // pisca ao levar golpe
    const image = this.options.assets.image(imageId);
    const frame = this.options.content.assets.images[imageId]?.frame ?? { w: 32, h: 32 };
    const bob = Math.round(Math.sin(this.time / 300 + bobPhase * Math.PI) * 1);
    // O personagem ocupa ~16 px centrais do quadro de 32: centraliza pela metade do quadro.
    const x = Math.round(centerX - (frame.w * SCALE) / 2);
    const y = Math.round(feetY - frame.h * SCALE + 6 * SCALE + bob);
    ctx.drawImage(
      image,
      0,
      row * frame.h,
      frame.w,
      frame.h,
      x,
      y,
      frame.w * SCALE,
      frame.h * SCALE,
    );
  }
}

/** Fundo da batalha: parede de azulejos da cozinha e piso xadrez, com brilho do forno. */
function drawBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const horizon = 104;
  ctx.fillStyle = "#e9c9a0";
  ctx.fillRect(0, 0, VIEW_W, horizon);
  // Azulejos.
  ctx.fillStyle = "#dcb88d";
  for (let y = 0; y < horizon; y += 12) {
    for (let x = (y / 12) % 2 === 0 ? 0 : 12; x < VIEW_W; x += 24) ctx.fillRect(x, y, 12, 12);
  }
  // Rodapé.
  ctx.fillStyle = "#a4522f";
  ctx.fillRect(0, horizon - 6, VIEW_W, 6);
  // Piso xadrez.
  for (let y = horizon; y < VIEW_H; y += 16) {
    for (let x = 0; x < VIEW_W; x += 16) {
      ctx.fillStyle = ((x + y) / 16) % 2 === 0 ? "#c9a985" : "#b8956f";
      ctx.fillRect(x, y, 16, 16);
    }
  }
  // Brilho quente pulsando (o forno "lá fora").
  const glow = 0.08 + Math.sin(time / 500) * 0.03;
  ctx.fillStyle = `rgba(255, 140, 40, ${glow.toFixed(3)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
