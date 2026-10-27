/** Cria um elemento com classe e texto (atalho para as telas em DOM). */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Barra de PV: texto "12/20" e preenchimento proporcional (a cor não é a única pista). */
export function hpBar(doc: Document): { element: HTMLElement; set(hp: number, max: number): void } {
  const element = h(doc, "div", "hp");
  const fill = h(doc, "div", "hp__fill");
  const label = h(doc, "span", "hp__label");
  const track = h(doc, "div", "hp__track");
  track.append(fill);
  element.append(h(doc, "span", "hp__tag", "PV"), track, label);
  return {
    element,
    set(hp, max) {
      const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.dataset.level = ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low";
      label.textContent = `${hp}/${max}`;
    },
  };
}
