/** Arquivo de imagem conhecido pelo loader (o motor não depende do formato do conteúdo). */
export interface ImageSource {
  src: string;
}

export type DrawableImage = HTMLImageElement | HTMLCanvasElement;

export interface AssetLoaderOptions {
  /** Imagens e tilesets por AssetId. */
  images: Record<string, ImageSource>;
  /** Prefixo dos caminhos (ex.: `/assets/`). */
  baseUrl: string;
  /** Cria a imagem; injetável nos testes. */
  createImage?: () => HTMLImageElement;
  /** Cria o placeholder magenta; injetável nos testes. */
  createPlaceholder?: () => DrawableImage;
  /** Avisos de asset ausente (padrão: console.error). */
  onError?: (message: string) => void;
}

/**
 * Carrega e decodifica imagens em pacotes (ARCHITECTURE 12.1).
 * - Nada é desenhado antes do carregamento: as cenas só começam depois de `loadBundle`.
 * - Um asset ausente vira um placeholder magenta e um erro no console, sem quebrar o jogo.
 */
export class AssetLoader {
  private readonly loaded = new Map<string, DrawableImage>();
  private readonly pending = new Map<string, Promise<void>>();
  private placeholderImage: DrawableImage | null = null;

  constructor(private readonly options: AssetLoaderOptions) {}

  /** Carrega os IDs informados (em paralelo). `onProgress` recebe de 0 a 1. */
  async loadBundle(ids: Iterable<string>, onProgress?: (fraction: number) => void): Promise<void> {
    const list = [...new Set(ids)];
    let done = 0;
    onProgress?.(list.length === 0 ? 1 : 0);
    await Promise.all(
      list.map((id) =>
        this.loadOne(id).then(() => {
          done += 1;
          onProgress?.(done / list.length);
        }),
      ),
    );
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  /** Imagem carregada; se não estiver, o placeholder (e um erro, para o bug aparecer em dev). */
  image(id: string): DrawableImage {
    const image = this.loaded.get(id);
    if (image) return image;
    this.report(`asset "${id}" usado antes de ser carregado`);
    return this.placeholder();
  }

  private loadOne(id: string): Promise<void> {
    if (this.loaded.has(id)) return Promise.resolve();
    const inFlight = this.pending.get(id);
    if (inFlight) return inFlight;

    const source = this.options.images[id];
    if (!source) {
      this.report(`asset "${id}" não existe no manifesto`);
      this.loaded.set(id, this.placeholder());
      return Promise.resolve();
    }

    const image = this.options.createImage?.() ?? new Image();
    image.src = `${this.options.baseUrl}${source.src}`;
    const promise = image
      .decode()
      .then(() => {
        this.loaded.set(id, image);
      })
      .catch(() => {
        this.report(`não foi possível carregar "${id}" (${image.src})`);
        this.loaded.set(id, this.placeholder());
      })
      .finally(() => this.pending.delete(id));
    this.pending.set(id, promise);
    return promise;
  }

  private placeholder(): DrawableImage {
    this.placeholderImage ??= this.options.createPlaceholder?.() ?? magentaPlaceholder();
    return this.placeholderImage;
  }

  private report(message: string): void {
    (this.options.onError ?? console.error)(`[assets] ${message}`);
  }
}

/** Quadriculado magenta/preto de 32×32: impossível de confundir com arte do jogo. */
function magentaPlaceholder(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#ff00ff" : "#000000";
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
    }
  }
  return canvas;
}
