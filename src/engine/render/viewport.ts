/** Resolução interna do jogo, em pixels de jogo (ARCHITECTURE 13, GDD 13.1). */
/** Largura da visão em pixels de jogo: muda com o formato da tela (sempre 216 de altura). */
export let VIEW_W = 384;
/** Limites da largura: de quase quadrado (celular em pé) a bem largo (monitor ultrawide). */
export const MIN_VIEW_W = 256;
export const MAX_VIEW_W = 640;
export const VIEW_H = 216;

export interface ScreenFit {
  /** Pixels físicos por pixel de jogo (mínimo 1; pode ser fracionário para ocupar a tela). */
  scale: number;
  /** Largura da visão em pixels de jogo para este formato de tela. */
  viewW: number;
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
  // Ocupa a altura toda; a largura da visão estica para preencher a tela (sem faixas pretas).
  const scale = Math.max(1, Math.min(deviceH / VIEW_H, deviceW / MIN_VIEW_W));
  const viewW = Math.max(MIN_VIEW_W, Math.min(MAX_VIEW_W, Math.round(deviceW / scale)));
  const width = Math.round(viewW * scale);
  const height = Math.round(VIEW_H * scale);
  const left = Math.max(0, Math.floor((deviceW - width) / 2));
  const top = Math.max(0, Math.floor((deviceH - height) / 2));
  return {
    scale,
    viewW,
    cssWidth: width / dpr,
    cssHeight: height / dpr,
    cssLeft: left / dpr,
    cssTop: top / dpr,
  };
}

/** Aplica a escala ao container e a recalcula quando a janela, o zoom ou a tela mudam. */
export function attachScreenScaler(
  container: HTMLElement,
  /** Chamado quando a largura da visão muda (o canvas precisa acompanhar). */
  onViewSize?: (viewW: number) => void,
): () => void {
  let dprQuery: MediaQueryList | null = null;

  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    const fit = fitToScreen(window.innerWidth, window.innerHeight, dpr);
    if (fit.viewW !== VIEW_W) {
      VIEW_W = fit.viewW;
      onViewSize?.(VIEW_W);
    }
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
