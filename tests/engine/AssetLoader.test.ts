import { describe, expect, it } from "vitest";
import { AssetLoader } from "../../src/engine/assets/AssetLoader";

/** Imagem falsa: decode() resolve, a menos que o caminho contenha "quebrada". */
function fakeImage() {
  const image = {
    src: "",
    decode: () =>
      image.src.includes("quebrada") ? Promise.reject(new Error("404")) : Promise.resolve(),
  };
  return image as unknown as HTMLImageElement;
}

function setup() {
  const errors: string[] = [];
  const placeholder = { placeholder: true } as unknown as HTMLCanvasElement;
  const loader = new AssetLoader({
    images: { "img.ok": { src: "ok.png" }, "img.ruim": { src: "quebrada.png" } },
    baseUrl: "/assets/",
    createImage: fakeImage,
    createPlaceholder: () => placeholder,
    onError: (message) => errors.push(message),
  });
  return { loader, errors, placeholder };
}

describe("AssetLoader", () => {
  it("carrega e decodifica um pacote, informando o progresso", async () => {
    const { loader, errors } = setup();
    const progress: number[] = [];
    await loader.loadBundle(["img.ok"], (f) => progress.push(f));
    expect(loader.isLoaded("img.ok")).toBe(true);
    expect((loader.image("img.ok") as HTMLImageElement).src).toBe("/assets/ok.png");
    expect(progress).toEqual([0, 1]);
    expect(errors).toEqual([]);
  });

  it("asset ausente vira placeholder magenta e erro no console, sem quebrar", async () => {
    const { loader, errors, placeholder } = setup();
    await loader.loadBundle(["img.ruim", "img.inexistente"]);
    expect(loader.image("img.ruim")).toBe(placeholder);
    expect(loader.image("img.inexistente")).toBe(placeholder);
    expect(errors.join("\n")).toContain('não foi possível carregar "img.ruim"');
    expect(errors.join("\n")).toContain('"img.inexistente" não existe no manifesto');
  });

  it("acusa uso de imagem antes do carregamento", () => {
    const { loader, errors, placeholder } = setup();
    expect(loader.image("img.ok")).toBe(placeholder);
    expect(errors[0]).toContain("usado antes de ser carregado");
  });

  it("não carrega duas vezes o mesmo asset", async () => {
    const { loader } = setup();
    await Promise.all([loader.loadBundle(["img.ok"]), loader.loadBundle(["img.ok"])]);
    const first = loader.image("img.ok");
    await loader.loadBundle(["img.ok"]);
    expect(loader.image("img.ok")).toBe(first);
  });
});
