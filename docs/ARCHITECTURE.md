# Pizza Legends — Arquitetura

> **Versão:** 0.1 · **Data:** 27/10/2026
> **Base:** [`DECISOES_TECNICAS.md`](DECISOES_TECNICAS.md) (ADR-001, 002, 006, 007) · [`DATA_MODELS.md`](DATA_MODELS.md) · [`GAME_DESIGN_DOCUMENT.md`](GAME_DESIGN_DOCUMENT.md)

Este documento descreve como o motor e o jogo são organizados: camadas, módulos, ciclo de vida, fluxo de dados e responsabilidades de cada sistema. Os formatos de dados ficam no `DATA_MODELS.md`. Aqui está o código que os usa.

---

## 1. Princípios

1. **Regras puras, apresentação separada.** Toda regra que muda progresso (preparo, batalha, XP, recompensas, missões) é uma função pura do `core`. Canvas, DOM, áudio e relógio ficam fora dela.
2. **Estado salvo é a fonte da verdade.** O `SaveData` em memória é o estado do jogo. Entidades, sprites e telas são **projeções** dele e podem ser recriados a qualquer momento.
3. **Conteúdo é dado.** Mapas, receitas, inimigos, missões e diálogos vêm de `src/data`, validados por Zod. Adicionar conteúdo não exige mudar código, salvo se for um novo tipo de efeito ou evento.
4. **Tempo do jogo, não do navegador.** Movimento, animação, esperas e scripts usam o relógio do `GameLoop`. Nada de `setTimeout`/`setInterval` na lógica de jogo.
5. **Determinismo.** Mesmo estado + mesmas entradas + mesma semente = mesmo resultado. É o que permite testar batalhas inteiras e validar regras no servidor no futuro.
6. **Motor desacoplado da plataforma.** O jogo recebe por injeção um canvas, um elemento de UI e um `SaveRepository`. Não sabe se está numa página estática ou dentro do Next.js.
7. **Incremental.** A arquitetura é alcançada em passos verificáveis a partir do código atual (seção 24), sem reescrever tudo de uma vez.

---

## 2. Stack

| Item | Escolha | Fonte |
|---|---|---|
| Linguagem | TypeScript (`strict`) | ADR-006 |
| Build / dev server | Vite | ADR-006 |
| Renderização | Canvas 2D próprio | ADR-002 |
| Interface (menus, diálogos, HUD) | DOM + CSS sobre o canvas | Seção 14 |
| Validação | Zod | ADR-006 |
| Testes | Vitest (unidade/integração); Playwright (smoke e2e, Fase 3) | ADR-006 |
| Mapas | Tiled → conversor → `MapDef` | ADR-007 |
| Áudio | Web Audio API | Seção 18 |
| Persistência (demo) | `localStorage` via `SaveRepository` | ADR-001 |
| Qualidade | ESLint, Prettier, GitHub Actions | Seção 20 |
| Futuro | Next.js + Supabase | ADR-002 |

Nenhuma biblioteca de jogo ou de UI (React, Phaser etc.) dentro do pacote do jogo. Dependências de runtime previstas: **apenas Zod**.

---

## 3. Camadas e regras de dependência

```text
┌─────────────────────────────────────────────────────────────┐
│ app/        bootstrap, API pública do motor (createGame)    │
├─────────────────────────────────────────────────────────────┤
│ ui/         telas DOM: HUD, diálogo, menus, forno, batalha  │
├─────────────────────────────────────────────────────────────┤
│ game/       cenas, mundo, entidades, EventSystem,           │
│             sistemas de runtime, apresentação da batalha    │
├──────────────────────────────┬──────────────────────────────┤
│ engine/                      │ core/                        │
│ loop, input, render,         │ regras puras (DATA_MODELS 6) │
│ assets, áudio, câmera        │ cookPizza, resolveTurn...    │
├──────────────────────────────┴──────────────────────────────┤
│ content/   esquemas Zod, tipos, ContentRegistry, validação  │
├─────────────────────────────────────────────────────────────┤
│ persistence/  SaveRepository, migrações, checksum           │
└─────────────────────────────────────────────────────────────┘
```

**Quem pode importar quem:**

| Camada | Pode importar | Não pode importar |
|---|---|---|
| `content` | Zod | todas as outras |
| `core` | `content` (tipos) | `engine`, `game`, `ui`, `persistence`, DOM, `Math.random`, `Date` |
| `persistence` | `content` | `engine`, `game`, `ui` |
| `engine` | — (genérico, sem conceitos de pizza) | `core`, `game`, `ui`, `content` |
| `game` | `core`, `engine`, `content`, `persistence` (interface) | `ui` |
| `ui` | `game` (somente leitura e comandos), `content` (tipos) | `engine` interno, `core` direto |
| `app` | todas | — |

As regras são impostas pelo ESLint (`no-restricted-imports` por pasta). Um import proibido quebra o lint e a CI.

`engine` não conhecer o jogo é intencional: ela é um motor genérico de jogo 2D em grade, e o vocabulário do jogo vive em `game` e `core`.

---

## 4. Estrutura de diretórios

```text
pizzas-legends/
├── content/
│   ├── maps/*.tmj               # fontes do Tiled (ADR-007)
│   └── tilesets/*.tsj
├── public/
│   └── assets/                  # sprites, tilesets, áudio, fontes
├── scripts/
│   ├── build-maps.ts            # .tmj → src/data/maps/*.json
│   └── validate-content.ts      # validação completa (também roda na CI)
├── src/
│   ├── app/
│   │   ├── createGame.ts        # API pública do motor (seção 5)
│   │   └── main.ts              # bootstrap da página standalone
│   ├── content/
│   │   ├── schemas/             # esquemas Zod (fonte dos tipos)
│   │   ├── registry.ts          # ContentRegistry
│   │   └── validate.ts          # integridade referencial (DATA_MODELS 7.1)
│   ├── core/
│   │   ├── cooking.ts           # previewPizza, cookPizza, convertIngredients
│   │   ├── progression.ts       # grantXp, learnSkill
│   │   ├── rewards.ts           # claimReward
│   │   ├── conditions.ts        # evaluateCondition
│   │   ├── quests.ts            # updateQuests
│   │   ├── battle/              # createBattle, resolveTurn, applyBattleResult
│   │   ├── world.ts             # restAtOven
│   │   ├── rng.ts               # mulberry32
│   │   └── newGame.ts           # SaveData inicial
│   ├── engine/
│   │   ├── GameLoop.ts
│   │   ├── input/               # InputManager, KeyboardSource
│   │   ├── render/              # Renderer, SpriteSheet, TileLayerCache
│   │   ├── assets/              # AssetLoader, manifest
│   │   ├── audio/               # AudioManager
│   │   ├── Camera.ts
│   │   └── SceneStack.ts
│   ├── game/
│   │   ├── GameSession.ts       # estado + comandos + sinais (seção 8)
│   │   ├── signals.ts
│   │   ├── scenes/              # TitleScene, WorldScene, BattleScene
│   │   ├── world/               # WorldManager, GridOccupancy, MapRenderer
│   │   ├── entities/            # Entity, Player, Npc, EnemyActor, Interactable
│   │   ├── events/              # EventRunner + handlers por tipo de GameEvent
│   │   ├── battle/              # BattlePresenter (animações a partir do log)
│   │   └── save/                # SaveSystem (gatilhos de autosave)
│   ├── persistence/
│   │   ├── SaveRepository.ts
│   │   ├── LocalSaveRepository.ts
│   │   ├── migrations.ts
│   │   └── checksum.ts
│   ├── ui/
│   │   ├── UiRoot.ts
│   │   ├── components/          # caixa de diálogo, lista, barra de PV...
│   │   └── screens/             # Hud, Menu, Oven, Basket, Battle, Title
│   └── data/                    # conteúdo JSON (DATA_MODELS 2)
├── tests/
│   ├── fixtures/saves/          # v1.json, v2.json... (DATA_MODELS 7.3)
│   └── ...                      # testes espelham src/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 5. Ciclo de vida e API pública

### 5.1 API do motor

```ts
interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  saveRepository: SaveRepository;      // LocalSaveRepository na demo; Supabase no futuro
  onEvent?: (e: PublicGameEvent) => void; // avisos para a página hospedeira (ex.: "demoCompleted")
}

interface GameHandle {
  start(): Promise<void>;   // carrega conteúdo e assets, abre a tela de título
  pause(): void;
  resume(): void;
  destroy(): void;          // remove listeners, para áudio e loop; obrigatório no Next.js (desmontagem)
}

function createGame(options: GameOptions): GameHandle;
```

Esta é a **única** superfície que a página hospedeira usa, hoje no `main.ts` e depois em um componente do Next.js.

### 5.2 Sequência de inicialização

```text
createGame()
  └─ start()
      1. carregar e validar ContentRegistry  (falha → tela de erro com a mensagem do Zod em dev)
      2. carregar Settings
      3. AssetLoader: carregar o pacote "boot" (fonte, UI, tela de título)
      4. iniciar GameLoop e InputManager
      5. SceneStack.push(TitleScene)
TitleScene
  ├─ Novo jogo  → nome do personagem → core/newGame → GameSession → WorldScene(map inicial)
  └─ Continuar  → SaveRepository.load → migrar/validar → GameSession → WorldScene(world.mapId)
```

### 5.3 Pausa automática

`visibilitychange` (aba oculta) chama `pause()`: o loop para de atualizar e a música abaixa. Ao voltar, o acumulador do loop é zerado, para evitar um "salto" de simulação.

---

## 6. GameLoop e tempo

### 6.1 Passo fixo

```text
TICK = 1000 / 60 ms           (simulação a 60 Hz em qualquer monitor)
MAX_FRAME = 250 ms            (evita espiral de recuperação após travadas)

a cada requestAnimationFrame(now):
  frame = min(now − last, MAX_FRAME); last = now
  acc += frame
  while acc ≥ TICK:
      input.poll()             # congela o estado das ações para este tick
      scenes.update(TICK)      # lógica sempre com dt constante
      acc −= TICK
  scenes.render(acc / TICK)    # alpha para interpolação visual
```

- Resolve o problema P0/P1 do planejamento: hoje o movimento é "1 px por quadro", então anda 2× mais rápido em monitores de 120 Hz.
- **Velocidade de caminhada:** 1 tile a cada 16 ticks (≈ 267 ms), igual à sensação atual a 60 Hz. Fica em `balance`/configuração do engine.
- **Animação** em milissegundos (`frameDurationMs`), não em quantidade de quadros.
- **Renderização:** posições interpoladas com `alpha` e **arredondadas para pixel inteiro**, para manter o pixel art nítido em monitores acima de 60 Hz.

### 6.2 Relógio do jogo

`GameClock` acumula apenas tempo simulado (não avança pausado). É a referência para scripts (`wait`, `stand.time`), `fleeStunMs` e `PlayStats.playTimeMs`.

---

## 7. Cenas

```ts
interface Scene {
  enter(params?: unknown): void | Promise<void>;
  exit(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
  readonly inputContext: InputContext;   // seção 9
  readonly blocksUpdateBelow: boolean;   // overlays como o menu pausam a cena de baixo
}
```

| Cena | Função | Observação |
|---|---|---|
| `TitleScene` | Novo jogo / continuar / opções / créditos | — |
| `WorldScene` | Exploração do mapa ativo | Mantida na pilha durante a batalha (não é recriada) |
| `BattleScene` | Combate | Empilhada sobre o mundo; ao sair, o mundo continua de onde parou |
| `MenuScene` | Overlay de menu, forno, cesta | `blocksUpdateBelow = true` |

`SceneStack` gerencia push/pop/replace com **transições** (fade ou "tampa de forno", GDD 7.1). Durante uma transição, as entradas são ignoradas.

Cutscenes e diálogos **não** são cenas: são o `EventSystem` rodando em modo bloqueante dentro da `WorldScene` (seção 11).

---

## 8. Estado: `GameSession`, comandos e sinais

### 8.1 Fluxo de dados

```text
            comando (intenção)                 função pura (core)
UI / EventSystem / Entidades ──▶ GameSession.dispatch() ──▶ novo SaveData
                                       │
                                       ├─ updateQuests() automático
                                       ├─ emite sinais (itemGained, levelUp, questStepCompleted...)
                                       └─ marca "sujo" para o SaveSystem
                                                │
UI, áudio, efeitos visuais ◀── sinais ──────────┘
```

```ts
class GameSession {
  get state(): Readonly<SaveData>;
  dispatch(command: Command): CommandResult;   // síncrono e transacional
  readonly signals: Signals;
}

type Command =
  | { type: "cookPizza"; recipeId: RecipeId; ingredientIds: IngredientId[]; batch?: 2 }
  | { type: "convert"; conversionId: ConversionId; times: number }
  | { type: "learnSkill"; skillId: SkillId }
  | { type: "claimReward"; rewardId: RewardId }
  | { type: "setFlag"; flag: FlagId; value: boolean | number }
  | { type: "incrementFlag"; flag: FlagId; by: number }
  | { type: "takeIngredients"; items: ItemCount[] }
  | { type: "takePizza"; pizzaId: PizzaInstanceId }
  | { type: "applyBattleResult"; battle: BattleState }
  | { type: "rest"; ovenId: OvenId }
  | { type: "setPosition"; mapId: MapId; x: number; y: number; direction: Direction }
  | { type: "setBasket"; pizzaIds: PizzaInstanceId[] };
```

**Regras:**
- O `SaveData` é **imutável**: cada comando produz um novo objeto. Para evitar cópias profundas, use cópia estrutural (`{...state, inventory: {...}}`).
- Um comando que falha (ex.: falta ingrediente) não altera nada e devolve o erro tipado, que a UI exibe.
- `GameSession` é o **único** lugar que chama funções do `core` que alteram o save, e o único que segura o RNG.
- **Posição do jogador**: a posição em pixels durante o movimento é estado de runtime da entidade. O `SaveData.world.position` só é atualizado (via `setPosition`) ao concluir cada passo de tile e antes de cada autosave.

### 8.2 Sinais

Pub/sub tipado (`signals.on("levelUp", fn)` retorna uma função de cancelar). Usado só para **notificar** UI, áudio e efeitos. Nenhum sinal altera estado.

> **Nomenclatura:** "sinais" (notificações internas) ≠ "eventos" (`GameEvent`, roteiros do `EventSystem`). Os nomes distintos evitam confusão no código.

---

## 9. Entrada

```ts
type Action = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "menu" | "debug";

interface InputManager {
  isHeld(a: Action): boolean;
  wasPressed(a: Action): boolean;    // verdadeiro só no tick em que foi pressionada
  readonly direction: Direction | null;   // direção mais recente mantida (lógica atual de heldDirections)
  pushContext(c: InputContext): void;
  popContext(c: InputContext): void;
}

type InputContext = "world" | "dialogue" | "menu" | "battle" | "transition";
```

- **Fontes** (`KeyboardSource`; no futuro `GamepadSource`, `TouchSource`) só traduzem dispositivos em ações. O mapeamento de teclas segue o GDD 11.1.
- **Contexto ativo** = topo da pilha. Só a cena ou sistema do contexto ativo lê as ações. Isso impede, por exemplo, que o jogador ande enquanto um diálogo está aberto.
- `input.poll()` acontece uma vez por tick (seção 6.1). Pressionamentos entre ticks não se perdem: ficam em buffer até o próximo `poll`.
- `blur` da janela libera todas as teclas, o que corrige o personagem "andando sozinho" após um Alt+Tab.

---

## 10. Mundo

### 10.1 `WorldManager`

Responsável pelo mapa ativo:

1. `loadMap(mapId, entrance)`: busca o `MapDef`, carrega o pacote de assets do mapa, monta a `GridOccupancy`, instancia as entidades visíveis (avaliando `visibleIf`, `defeatedEnemies`, `harvested` e flags) e posiciona o jogador.
2. `unloadMap()`: cancela os `behaviorLoop`, remove entidades e libera caches de renderização.
3. **Transição** (porta): bloqueia a entrada → fade out → `unload` → `load` → `setPosition` + autosave → fade in.

### 10.2 Ocupação da grade

```ts
class GridOccupancy {
  isBlocked(x: number, y: number): boolean;     // parede estática OU entidade sólida OU reserva
  reserve(entityId: string, x: number, y: number): boolean;
  release(entityId: string, x: number, y: number): void;
}
```

- Paredes vêm de `MapDef.collision`. Entidades sólidas ocupam seu tile.
- Antes de andar, a entidade **reserva** o tile de destino (equivalente ao `moveWall` atual) e libera o de origem ao chegar. Duas entidades nunca entram no mesmo tile.
- Fora do mapa conta como bloqueado.

### 10.3 Entidades

```text
Entity (id, tileX/Y, pixelX/Y, direction, sprite, solid)
├── Player          movimento por input, interação com o tile à frente
├── Npc             talking[], behaviorLoop
├── EnemyActor      patrulha, colisão com o jogador → startBattle, atordoamento pós-fuga
└── Interactable    chest | oven | harvest | sign | door | trigger
```

- Composição sobre herança profunda: movimento (`GridMover`) e animação (`SpriteAnimator`) são componentes reutilizados por `Player`, `Npc` e `EnemyActor`.
- `update(dt)` altera só o estado de runtime. Mudanças de progresso passam por `GameSession.dispatch`.
- **Interação:** em `confirm`, o `Player` pega a entidade no tile à frente e chama `interact()`. A entidade inicia o script correspondente no `EventSystem` (ex.: NPC → primeira `talking` cuja condição é verdadeira).
- **Gatilhos de passagem** (`door`, `trigger`) disparam ao **terminar** um passo sobre o tile.

### 10.4 Câmera

- Centrada no jogador (posição interpolada) e **limitada às bordas do mapa**. Hoje ela mostra a área preta além do cenário. Em mapas menores que a tela, o mapa é centralizado.
- O centro da tela vem das constantes de resolução, não de `withGrid(10.5)`/`withGrid(6)` repetidos no código.

### 10.5 Ordem de desenho

```text
1. camadas lower (cache pré-renderizado do mapa)
2. sombras
3. entidades ordenadas por pixelY (desempate: id)    # corrige a sobreposição incorreta atual
4. camadas upper (cache)
5. efeitos de mundo (partículas, brilho de coleta)
```

---

## 11. `EventSystem`

Executa as listas de `GameEvent` do `DATA_MODELS.md` 3.12. Substitui o `OverworldEvent` ausente.

### 11.1 Executor por ticks

```ts
interface EventHandler<E extends GameEvent> {
  start(event: E, ctx: EventContext): void;
  update(dt: number, ctx: EventContext): "running" | "done";
  cancel?(ctx: EventContext): void;
}

class EventRunner {
  constructor(events: GameEvent[], mode: "blocking" | "background");
  update(dt: number): "running" | "done";
  cancel(): void;
}
```

- Cada tipo de `GameEvent` tem um handler registrado em uma tabela. Um tipo sem handler é um erro de validação de conteúdo, não um erro em tempo de execução.
- Os handlers avançam com `dt` do `GameLoop`. Não há Promises nem timers. Assim é fácil **cancelar** (troca de mapa), **pausar** (menu aberto) e **testar** com relógio simulado.
- `if` e `choice` empilham sub-executores. `startBattle` empilha a `BattleScene` e o handler aguarda o resultado para seguir com `onWin`/`onLose`.

### 11.2 Modos

| Modo | Uso | Comportamento |
|---|---|---|
| **blocking** | Diálogos, cenas, interações | Só um por vez; empilha o contexto de entrada `dialogue`; pausa os `background` |
| **background** | `behaviorLoop` de NPCs/inimigos | Um por entidade; repete ao terminar; pausado durante `blocking` e menus |

### 11.3 Comportamentos de movimento

- `walk` bloqueado (tile ocupado): a entidade espera e tenta de novo a cada tick, como no tutorial. Em modo `blocking`, há um tempo-limite (3 s) seguido de aviso no console em dev, para que uma cena nunca trave o jogo.
- Durante uma cena com o jogador, os `behaviorLoop` param. Um NPC que vem falar com o jogador é sempre roteirizado pela cena.

---

## 12. Assets

### 12.1 Manifesto

`src/data/assets.json` liga cada `AssetId` (usado no conteúdo) a um arquivo:

```ts
interface AssetManifest {
  images: Record<AssetId, { src: string; frame?: { w: number; h: number }; animations?: Record<string, AnimationDef> }>;
  tilesets: Record<AssetId, { src: string; tileSize: 16; columns: number }>;
  audio: Record<AssetId, { src: string; kind: "music" | "sfx"; loop?: boolean }>;
  bundles: Record<string, AssetId[]>;   // "boot", "map.vila", "battle" ...
}

interface AnimationDef {
  frames: [col: number, row: number][];
  frameDurationMs: number;
  loop: boolean;
}
```

- As animações padrão de personagem (as 4 direções, idle e walk, que hoje estão fixas em `Sprite.js`) ficam em um modelo `anim.character_32` reutilizável.
- `AssetLoader.loadBundle(name, onProgress)` carrega e decodifica (`img.decode()`), com tela de carregamento para pacotes grandes. Resolve o desenho de imagens ainda não carregadas apontado no planejamento (P1).
- Um asset ausente gera **placeholder magenta** e erro no console em dev, sem quebrar o jogo. Na CI, `validate-content` verifica se todo `AssetId` citado existe no manifesto e se todo arquivo do manifesto existe em `public/assets`.
- Arquivos sem espaços nem parênteses (ex.: corrige `DemoLower (12).png`). Padrão: `snake_case`.

---

## 13. Renderização

- **Resolução interna** é uma constante (`VIEW_W × VIEW_H`). Decidida na F0-04: **384×216** (GDD 13.1). Fica em `engine/render/viewport.ts`, junto com `CAMERA_SCREEN_X/Y` (onde a câmera é desenhada). Nenhum código pode assumir valores fixos.
- **Escala inteira:** o canvas tem a resolução interna, e o CSS o amplia pelo maior inteiro que cabe na janela (`image-rendering: pixelated`, `ctx.imageSmoothingEnabled = false`). Substitui o `transform: scale(3)` fixo. A conta é feita em pixels físicos (`innerWidth × devicePixelRatio`), para continuar nítido com zoom do Windows em 125%/150%. Recalculado no `resize` e quando o `devicePixelRatio` muda.
- **Cache de tiles:** ao carregar um mapa, as camadas `lower` e `upper` são desenhadas uma vez em canvases fora da tela (`TileLayerCache`). Em cada quadro, são só dois `drawImage` recortados pela câmera, o mesmo custo do modelo atual de duas imagens.
- **Sprites:** `SpriteSheet` + `SpriteAnimator` (frame atual por tempo). Desenhar **não** avança a animação: hoje `Sprite.draw()` faz as duas coisas.
- **Batalha:** canvas para cenário, combatentes e efeitos. Números, barras e menus ficam no DOM (seção 14).

---

## 14. Interface (DOM sobre o canvas)

**Decisão:** menus, diálogos, HUD e painéis de batalha são **HTML/CSS** posicionados sobre o canvas, e não desenhados nele.

| Motivo | Detalhe |
|---|---|
| Texto nítido | Fontes renderizadas na resolução real da tela, não ampliadas |
| Layout | Listas, rolagem e quebra de linha (inventário, receitas) prontos no CSS |
| Acessibilidade | Foco, leitores de tela (`aria-live` para diálogos) e zoom do navegador |
| Migração para Next.js | A UI pode, no futuro, virar componentes React sem tocar no motor |

**Regras:**
- `ui/` **lê** o estado (`session.state`) e **escuta** sinais, e só altera o jogo por `dispatch` ou por métodos explícitos de cena (ex.: `battleScene.choose(action)`).
- A UI não guarda estado de jogo próprio. Ao reabrir uma tela, ela é renderizada a partir do `SaveData`.
- Componentes em TypeScript puro com uma pequena função `h()` (ou `lit-html`, se a complexidade justificar). Sem framework na demo.
- O container da UI acompanha o tamanho e a escala do canvas. Uma variável CSS `--px` (= tamanho de 1 pixel de jogo em pixels CSS; igual à escala inteira quando `devicePixelRatio` = 1) mantém a estética pixel art nas medidas.
- **Navegação por teclado:** as telas consomem as ações do `InputManager` (contexto `menu`/`battle`), não eventos de teclado do DOM. Assim, o futuro gamepad funciona igual.

---

## 15. Batalha: lógica × apresentação

```text
BattleScene
├── BattleState            (core: dados puros)
├── resolveTurn()          (core: resolve o turno inteiro instantaneamente → novo estado + log)
└── BattlePresenter        (game: transforma o log em animações sequenciais)
        log: [ {type:"damage", target:"enemy", amount:10, profile:"cremoso", effective:true},
               {type:"status", target:"enemy", status:"status.enfraquecido"},
               {type:"intent", actionId:"act.golpe_pa"} ... ]
```

- A lógica **nunca espera** animação. O `BattlePresenter` reproduz o log em fila (texto flutuante, tremor, som), e a UI só reabre as opções quando a fila esvazia.
- O mesmo `resolveTurn` roda nos testes sem nenhuma apresentação. Isso permite **simular batalhas completas** para balanceamento (seção 19).
- Ao terminar: `dispatch({ type: "applyBattleResult" })` → recompensas, fatias, estatísticas → autosave → `pop` da cena.

---

## 16. Persistência

- **`SaveSystem`** (em `game/save`) decide **quando** salvar. **`SaveRepository`** (em `persistence`) decide **como**.
- Gatilhos de autosave (GDD 12): fim de troca de mapa, fim de batalha, conclusão de etapa de missão. Nunca durante cena bloqueante, batalha ou transição: o pedido fica pendente e é executado assim que o estado estiver estável.
- **Fila de escrita:** uma gravação por vez, e a última pendente substitui as anteriores. Evita duas gravações simultâneas corrompendo o slot.
- `checksum`: **FNV-1a 32 bits** sobre o JSON de `data` serializado com chaves em ordem estável. Detecta corrupção, não trapaça.
- Escrita segura via chave temporária (DATA_MODELS 8.2).
- `migrations.ts` + fixtures por versão (DATA_MODELS 7.3).

---

## 17. Pipeline de conteúdo

```text
Tiled (.tmj) ──▶ scripts/build-maps.ts ──▶ src/data/maps/*.json ─┐
JSON de conteúdo (src/data/*.json) ─────────────────────────────┼─▶ Zod + validate.ts ──▶ ContentRegistry
assets.json + public/assets ─────────────────────────────────────┘
```

- `npm run dev` roda o conversor uma vez e observa `content/maps` (plugin Vite simples que reexecuta o conversor e recarrega a página).
- `npm run validate` roda a validação completa. A CI e o teste `content.test.ts` usam a mesma função.

### 17.1 Convenções no Tiled (ADR-007)

| Elemento no Tiled | Convenção | Vira no `MapDef` |
|---|---|---|
| Propriedade do mapa `id` | ex.: `map.vila` | `id` |
| Propriedade do mapa `music` | `AssetId` | `music` |
| Camadas de tiles com prefixo `ground` | ex.: `ground`, `ground_detail` | `lower[]` (na ordem) |
| Camadas de tiles com prefixo `over` | ex.: `over_roofs` | `upper[]` |
| Camada de tiles `collision` | qualquer tile = parede; invisível no jogo | `collision` |
| Camada de objetos `entrances` | pontos; nome = ID da entrada; propriedade `direction` | `entrances` |
| Camada de objetos `objects` | **classe** do objeto = `kind` (`npc`, `enemy`, `chest`...); nome = ID local; propriedades personalizadas = campos | `objects[]` |
| Propriedade `script` em NPC/trigger | referência a `src/data/dialogues/<arquivo>.json#<chave>` | `talking` / `events` |
| Propriedade `visibleIf` | referência nomeada a uma condição em `src/data/conditions.json` | `visibleIf` |

- Tamanho de tile: 16×16 obrigatório (o conversor recusa outro valor).
- Coordenadas de objetos do Tiled (em pixels) são convertidas para tiles pelo conversor. Um objeto fora da grade gera erro.
- Roteiros e condições ficam fora do Tiled, para serem versionados, revisados em diff e validados como JSON.

> Isso acrescenta ao `DATA_MODELS.md` o arquivo `src/data/conditions.json` (condições nomeadas reutilizáveis). O `MapDef` gerado já contém a condição resolvida, então o runtime não muda.

---

## 18. Áudio

- `AudioManager` sobre Web Audio API, com dois barramentos: **música** e **efeitos**, cada um com volume próprio (Settings).
- O contexto de áudio só é criado ou retomado após a primeira interação do usuário (política de autoplay dos navegadores). A tela de título exige um "Pressione Enter" que cumpre esse papel.
- Música muda com o mapa (`MapDef.music`) e com crossfade de 500 ms. A batalha empilha a música de combate e restaura a do mapa ao sair.
- Efeitos disparados por **sinais** (`itemGained`, `levelUp`) e pelo `BattlePresenter`, nunca pelo `core`.

---

## 19. Estratégia de testes

Detalhamento completo no futuro `TEST_PLAN.md`.

| Nível | O que testa | Ferramenta |
|---|---|---|
| Unidade (`core`) | Cada função pura da seção 6 do DATA_MODELS: preparo, XP, recompensas, condições, missões, batalha | Vitest |
| Conteúdo | Validação completa do registro e dos mapas convertidos | Vitest + `validate.ts` |
| Saves | Fixtures por versão migram e validam; save corrompido vai para backup | Vitest |
| Simulação de batalha | Batalhas inteiras com cestas e sementes fixas. Ex.: "nível 4 com Quatro Queijos ×2 + Margherita ×2 vence a Ravena em ≤ 3 tentativas" | Vitest |
| Integração (`game`) | `EventRunner` com relógio falso, `GridOccupancy`, transições de mapa | Vitest + jsdom |
| Smoke e2e | Abre o jogo, novo jogo, anda, abre diálogo, salva, recarrega | Playwright (Fase 3) |

As **simulações de batalha** transformam as metas de balanceamento do GDD em testes, que avisam quando uma mudança de números quebra a curva da demo.

---

## 20. Qualidade e CI

- Scripts do `package.json`: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `validate`, `build:maps`.
- GitHub Actions em todo push: `typecheck` → `lint` → `validate` → `test` → `build`. Os mesmos comandos rodam localmente antes de cada push.
- `tsconfig` `strict: true`, `noUncheckedIndexedAccess: true` (pega o tipo de erro do `behaviorLoop[index]` indefinido do código atual).
- Commits direto na `main`, que precisa estar sempre jogável. A mensagem do commit leva o ID da tarefa do roadmap.

---

## 21. Ferramentas de depuração (só em desenvolvimento)

Ativadas por `import.meta.env.DEV` e pela tecla F1 (ação `debug`). Removidas do build de produção.

- Grade de colisão e reservas sobrepostas ao mapa; IDs das entidades.
- FPS, ticks por quadro, duração do update e do render.
- Painel de estado: flags, missões, inventário (editáveis), botão "dar ingredientes".
- Teleporte para qualquer mapa e entrada; forçar batalha com qualquer inimigo.
- Log do `EventRunner` (evento atual de cada executor).

---

## 22. Orçamentos de desempenho

| Métrica | Meta (desktop médio) |
|---|---|
| Taxa de quadros | 60 fps estáveis |
| `update` por tick | < 2 ms |
| `render` por quadro | < 4 ms |
| JS do build (gzip) | < 150 KB |
| Carregamento inicial até a tela de título | < 3 s em banda larga |
| Pacote de assets por mapa | < 1 MB |

---

## 23. Integração futura com Next.js e Supabase

Quando algum gatilho da ADR-001 for atingido:

```text
pizzas-legends/                      # monorepo (npm workspaces)
├── apps/web/                        # Next.js: páginas, login, perfil
│   └── GameCanvas.tsx               # "use client"; import dinâmico do jogo; createGame/destroy
├── packages/game/                   # o conteúdo atual de src/ (sem mudanças de arquitetura)
└── packages/save-supabase/          # SupabaseSaveRepository implements SaveRepository
```

- O pacote `game` **nunca importa** Next.js, React ou Supabase. O `apps/web` injeta o `SaveRepository` adequado.
- Validação de recompensas no servidor (se houver ranking) reaproveita as funções do `core` em uma Edge Function ou rota do Next.js.
- Detalhes de tabelas, RLS e sincronização: `DATABASE.md`.

---

## 24. Migração do código atual (Fase 0)

Ordem proposta. Cada passo termina com o jogo rodando e é um commit separado.

| Passo | Entrega | Arquivos atuais afetados | Resolve |
|---:|---|---|---|
| 1 | Projeto Vite + TS; código atual convertido em módulos `.ts` com o mínimo de mudança; CI básica | todos | Escopo global (P1) |
| 2 | `GameLoop` de passo fixo; animação por ms | `Overworld.js`, `Sprite.js`, `Person.js` | FPS variável (P0/P1) |
| 3 | `InputManager` com ações e contextos | `Directionput.js` | Nome do arquivo; base para diálogos |
| 4 | `content/` com Zod + `ContentRegistry`; primeiro `MapDef` | `OverworldMap.js` | Mistura pixel/tile; mapas instanciados no carregamento |
| 5 | Tiled + conversor; `cozinha_mestre` e `despensa` recriados | `images/*Lower/Upper*` | Coordenadas inconsistentes do `Kitchen` |
| 6 | `WorldManager`, `GridOccupancy`, câmera limitada, ordenação por Y | `OverworldMap.js`, `GameObject.js` | Sobreposição; câmera |
| 7 | `EventSystem` + `behaviorLoop` | `GameObject.js` | `OverworldEvent` ausente (P0) |
| 8 | Portas e transição entre mapas | — | Transição de mapas (P1) |
| 9 | UI DOM + diálogo mínimo | — | Critério de saída da Fase 0 |
| 10 | `GameSession` + `LocalSaveRepository` (posição e flags) | — | Base para a Fase 1 |

Ao final do passo 9, os critérios de encerramento da estabilização do planejamento (seção 2.5) estão cumpridos.

---

## 25. Questões em aberto

1. ~~Resolução interna final (352×198 ou 384×216).~~ **Resolvida (F0-04):** 384×216 (GDD 13.1).
2. Função `h()` própria ou `lit-html` para a UI. Decidir quando a tela do forno for implementada.
3. Fonte pixel art e sua licença (registrar em `ASSETS_AND_LICENSES.md`).
4. Hospedagem da demo (estática): Vercel, GitHub Pages ou Netlify. Decidir na Fase 3.
