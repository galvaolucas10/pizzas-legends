/** Resolução interna do jogo, em pixels de jogo (ARCHITECTURE 13, GDD 13.1). */
export const VIEW_W = 384;
export const VIEW_H = 216;

export interface ScreenFit {
  /** Pixels físicos por pixel de jogo (sempre inteiro, mínimo 1). */
  scale: number;
  /** Tamanho e posição do canvas em pixels CSS. */
  cssWidth: number;
  cssHeight: number;
  cssLeft: number;
  cssTop: number;
}

/**
 * Maior escala inteira que cabe na janela.
 * A conta é feita em pixels físicos (CSS × devicePixelRatio): assim o jogo continua nítido
 * com o Windows em 125% ou 150%, onde uma escala inteira em pixels CSS ficaria borrada.
 */
export function fitToScreen(viewportCssW: number, viewportCssH: number, dpr: number): ScreenFit {
  const deviceW = Math.floor(viewportCssW * dpr);
  const deviceH = Math.floor(viewportCssH * dpr);
  const scale = Math.max(1, Math.floor(Math.min(deviceW / VIEW_W, deviceH / VIEW_H)));
  const width = VIEW_W * scale;
  const height = VIEW_H * scale;
  // Bordas em pixels físicos inteiros, para o canvas não cair "entre" dois pixels.
  const left = Math.max(0, Math.floor((deviceW - width) / 2));
  const top = Math.max(0, Math.floor((deviceH - height) / 2));
  return {
    scale,
    cssWidth: width / dpr,
    cssHeight: height / dpr,
    cssLeft: left / dpr,
    cssTop: top / dpr,
  };
}

/** Aplica a escala ao container e a recalcula quando a janela, o zoom ou a tela mudam. */
export function attachScreenScaler(container: HTMLElement): () => void {
  let dprQuery: MediaQueryList | null = null;

  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    const fit = fitToScreen(window.innerWidth, window.innerHeight, dpr);
    const style = container.style;
    style.width = `${fit.cssWidth}px`;
    style.height = `${fit.cssHeight}px`;
    style.left = `${fit.cssLeft}px`;
    style.top = `${fit.cssTop}px`;
    // Tamanho de 1 pixel de jogo em pixels CSS, para a UI em DOM (ARCHITECTURE 14).
    style.setProperty("--px", `${fit.scale / dpr}px`);

    // O devicePixelRatio muda ao trocar de monitor ou de zoom; observar o valor atual.
    dprQuery?.removeEventListener("change", apply);
    dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    dprQuery.addEventListener("change", apply);
  };

  window.addEventListener("resize", apply);
  apply();

  return () => {
    window.removeEventListener("resize", apply);
    dprQuery?.removeEventListener("change", apply);
  };
}
