# Pizza Legends — Modelos de Dados

> **Versão:** 0.1 · **Data:** 27/10/2026 · **Schema de save:** `schemaVersion: 3` (a v2 fez o nível começar em 0; a v3 voltou a começar em 1. As migrações 1 → 2 → 3 se anulam para saves v1)
> **Base:** [`GAME_DESIGN_DOCUMENT.md`](GAME_DESIGN_DOCUMENT.md) · [`DECISOES_TECNICAS.md`](DECISOES_TECNICAS.md) (ADR-001, ADR-004, ADR-005)

Este documento define **o formato de todos os dados do jogo**: o conteúdo estático (ingredientes, receitas, mapas…), o estado salvo do jogador e as funções puras que os transformam. É o contrato entre os sistemas do motor e a base para o futuro `DATABASE.md`.

---

## 1. Convenções

### 1.1 Notação

Os esquemas usam **notação TypeScript**, a linguagem do projeto (ADR-006). No código, cada tipo é definido como **esquema Zod**, e o tipo TypeScript é inferido dele (`z.infer`). As interfaces abaixo descrevem o resultado; o esquema Zod é a fonte da verdade.

`?` = campo opcional · `A | B` = um ou outro · `Record<K, V>` = objeto chave→valor.

### 1.2 Idioma

| Elemento | Idioma | Exemplo |
|---|---|---|
| Nomes de campos e funções | Inglês (segue o código existente: `behaviorLoop`, `gameObjects`) | `maxSlices`, `cookPizza()` |
| IDs de conteúdo | Português, sem acentos | `ing.mussarela`, `rec.quatro_queijos` |
| Textos exibidos | Arquivo de idioma, nunca no conteúdo | `locales/pt-BR.json` |

Correspondência com os termos do GDD: `nivel` → `level`, `pvMax` → `maxHp`, `pontosHabilidade` → `skillPoints`, `tamanhoCesta` → `basketSize`, `qualidade` → `quality`, `P` → `potency`, `fatias` → `slices`, `cesta` → `basket`, `prepararPizza` → `cookPizza`.

### 1.3 IDs estáveis (ADR-001, regra 3)

Formato: `<prefixo>.<slug>`, com slug em `snake_case` ASCII. **Um ID nunca é reutilizado nem renomeado** depois de publicado. Para trocar o nome exibido, altere o arquivo de idioma.

| Prefixo | Entidade | Exemplo |
|---|---|---|
| `char.` | Personagem jogável | `char.aprendiz` |
| `ing.` | Ingrediente | `ing.pimenta_dragao` |
| `rec.` | Receita | `rec.margherita` |
| `skill.` | Habilidade | `skill.fogo_controlado` |
| `branch.` | Ramo da árvore | `branch.massa` |
| `conv.` | Conversão de ingrediente | `conv.fermentacao` |
| `enemy.` | Inimigo | `enemy.vespa_pimenta` |
| `act.` | Ação de batalha | `act.ferroada` |
| `status.` | Efeito de status | `status.queimadura` |
| `map.` | Mapa | `map.bosque` |
| `npc.` | Personagem não jogável | `npc.mestre_basilio` |
| `quest.` | Missão | `quest.primeiro_desafio` |
| `rew.` | Pacote de recompensa | `rew.despensa_ratos` |
| `flag.` | Flag persistente | `flag.ponte_aberta` |
| `oven.` | Forno | `oven.acampamento` |

Objetos **dentro de um mapa** usam ID local (`vespa_1`, `bau_sotao`). O ID global de um objeto é `<mapId>/<idLocal>`, ex.: `map.bosque/vespa_1`.

Instâncias criadas em jogo (pizzas) usam um ID sequencial gerado pelo save: `pz_<n>` (ver 4.4). Não usar UUID nem `Date.now()`: IDs sequenciais são determinísticos e testáveis.

### 1.4 Textos e idioma

Textos ficam em `src/data/locales/pt-BR.json`, com chaves derivadas do ID por convenção. Assim, o conteúdo não precisa de campos de texto:

```json
{
  "ing.mussarela.name": "Mussarela",
  "ing.mussarela.desc": "Derrete bem e combina com tudo.",
  "dlg.mestre_basilio.intro.1": "Acordou, aprendiz? O forno não espera!"
}
```

Na carga, o validador verifica se toda entidade tem ao menos a chave `.name`.

### 1.5 Unidades

| Grandeza | Unidade no conteúdo e no save | Unidade em tempo de execução |
|---|---|---|
| Posição no mapa | **quadros (tiles)**, inteiros | pixels (`tile × 16`) |
| Tempo | milissegundos | milissegundos |
| Direção | `"up" \| "down" \| "left" \| "right"` | igual |
| Porcentagens/multiplicadores | número decimal (`1.5`, `0.3`) | igual |

O código atual mistura pixels (`utils.withGrid`) e tiles (mapa `Kitchen`). A partir deste documento, **dados sempre em tiles** e a conversão acontece num único lugar, na carga do mapa.

---

## 2. Organização dos arquivos de conteúdo

O conteúdo é estático, versionado no repositório e carregado no início do jogo (ADR-001, regra 6).

```text
src/data/
├── ingredients.json
├── recipes.json
├── conversions.json
├── skills.json            # ramos + habilidades
├── statuses.json
├── actions.json           # ações de batalha (inimigos e templates de pizza)
├── enemies.json
├── rewards.json
├── quests.json
├── npcs.json
├── conditions.json        # condições nomeadas, referenciadas pelos mapas do Tiled
├── dialogues/             # um arquivo por NPC ou cena
├── maps/                  # MapDef gerados pelo conversor do Tiled (não editar à mão)
├── assets.json            # manifesto de assets (ARCHITECTURE.md, seção 12)
├── balance.json           # constantes numéricas globais
└── locales/pt-BR.json
```

JSON (e não módulos JS) porque é puro dado: pode ser validado por ferramentas, editado sem risco de executar código e, no futuro, servido pelo backend sem conversão.

### 2.1 `ContentRegistry`

Na inicialização, o jogo carrega todos os arquivos em um registro imutável e **valida** (seção 7). Os sistemas consultam o registro por ID; nenhum sistema lê JSON diretamente.

```ts
interface ContentRegistry {
  balance: Balance;
  ingredients: Record<IngredientId, Ingredient>;
  recipes: Record<RecipeId, Recipe>;
  conversions: Record<ConversionId, Conversion>;
  branches: Record<BranchId, SkillBranch>;
  skills: Record<SkillId, Skill>;
  statuses: Record<StatusId, StatusDef>;
  actions: Record<ActionId, BattleActionDef>;
  enemies: Record<EnemyId, Enemy>;
  rewards: Record<RewardId, Reward>;
  quests: Record<QuestId, Quest>;
  npcs: Record<NpcId, Npc>;
  maps: Record<MapId, MapDef>;
  characters: Record<CharacterId, CharacterDef>;
}
```

---

## 3. Conteúdo estático

### 3.1 Tipos básicos

```ts
type Direction = "up" | "down" | "left" | "right";
type Profile = "picante" | "cremoso" | "defumado" | "fresco";
type Rarity = "comum" | "incomum" | "raro" | "lendario";
type IngredientCategory = "massa" | "molho" | "queijo" | "cobertura";
```

### 3.2 Constantes de balanceamento (`balance.json`)

Todos os números do GDD marcados **[Balancear]** que não pertencem a uma entidade específica ficam aqui. Assim, o balanceamento é ajustado em um só arquivo.

```ts
interface Balance {
  rarityValue: Record<Rarity, number>;            // { comum: 1, incomum: 2, raro: 3, lendario: 4 }
  profileBeats: Record<Profile, Profile>;         // { fresco: "picante", picante: "cremoso", cremoso: "defumado", defumado: "fresco" }
  advantageMultiplier: number;                    // 1.5
  sameProfileMultiplier: number;                  // 0.75
  potency: { base: number; perQuality: number };  // P = 4 + 2 × quality
  slices: { min: number; max: number };           // 1..8
  xpTable: number[];                              // XP total para chegar ao nível n = xpTable[n − 1]: [0, 60, 150, 280, 450]
  maxHp: { base: number; perLevel: number };      // 50 + 10 × (level − 1)
  basketSize: number;                             // 4
  maxPizzas: number;                              // 12
  maxIngredientStack: number;                     // 99
  defendMultiplier: number;                       // 0.5
  improviseDamage: number;                        // 3
  fleeStunMs: number;                             // 3000
  firstCookXp: number;                            // 10
  maxLevel: number;                               // 5
}
```

### 3.3 Ingrediente

```ts
interface Ingredient {
  id: IngredientId;
  category: IngredientCategory;
  rarity: Rarity;
  profile: Profile | null;               // null = neutro
  toppingModifiers: ToppingModifier[];   // vazio para não-coberturas; lista porque uma cobertura pode ter vários efeitos
  icon: AssetId;
}

type ToppingModifier =
  | { type: "healPerSlice"; value: number }
  | { type: "damagePerSlice"; value: number }
  | { type: "qualityBonus"; value: number }
  | { type: "statusDuration"; status: StatusId; value: number }
  | { type: "statusDamage"; status: StatusId; value: number };
```

```json
{
  "id": "ing.pimenta_dragao",
  "category": "cobertura",
  "rarity": "raro",
  "profile": "picante",
  "toppingModifiers": [
    { "type": "statusDamage", "status": "status.queimadura", "value": 1 },
    { "type": "statusDuration", "status": "status.queimadura", "value": 1 }
  ],
  "icon": "icon.ing.pimenta_dragao"
}
```

### 3.4 Receita

```ts
interface Recipe {
  id: RecipeId;
  profile: Profile;
  baseQuality: number;
  baseSlices: number;
  toppingSlots: number;                  // base 1
  requirements: RecipeRequirement[];     // ingredientes obrigatórios (sem coberturas)
  sliceAction: SliceActionTemplate;      // o que cada fatia faz
  unlock: UnlockSource;                  // documentação e validação; o desbloqueio real acontece por evento ou habilidade
}

type RecipeRequirement =
  | { kind: "category"; category: IngredientCategory; count: number; distinct?: boolean }
  | { kind: "ingredient"; ingredientId: IngredientId; count: number };

type UnlockSource =
  | { kind: "start" }
  | { kind: "reward"; rewardId: RewardId }
  | { kind: "skill"; skillId: SkillId };
```

**Correspondência entre requisitos e ingredientes:** requisitos `ingredient` são satisfeitos primeiro; depois os de `category`. Um mesmo ingrediente nunca satisfaz dois requisitos. Exemplo da Quatro Queijos: `{ kind: "category", category: "queijo", count: 2, distinct: true }` exige dois queijos com IDs diferentes.

#### Template de ação da fatia

Os efeitos das fatias são definidos em função da potência `P`:

```ts
interface SliceActionTemplate {
  damage?: number;            // multiplicador de P (ex.: 0.7)
  heal?: number;              // multiplicador de P
  shield?: number;            // multiplicador de P
  applyStatus?: StatusApplication[];
  cleanseNegative?: number;   // quantos efeitos negativos remove
}

interface StatusApplication {
  status: StatusId;
  target: "self" | "opponent";
  duration?: number;          // sobrescreve a duração padrão do status
}
```

```json
{
  "id": "rec.margherita",
  "profile": "fresco",
  "baseQuality": 1,
  "baseSlices": 4,
  "toppingSlots": 1,
  "requirements": [
    { "kind": "category", "category": "massa", "count": 1 },
    { "kind": "ingredient", "ingredientId": "ing.molho_tomate", "count": 1 },
    { "kind": "ingredient", "ingredientId": "ing.mussarela", "count": 1 }
  ],
  "sliceAction": { "damage": 0.7, "heal": 0.6, "cleanseNegative": 1 },
  "unlock": { "kind": "start" }
}
```

### 3.5 Conversão de ingrediente

Usada por *Fermentação Natural* e *Defumação*. Executada no forno.

```ts
interface Conversion {
  id: ConversionId;
  inputs: { ingredientId: IngredientId; count: number }[];
  output: { ingredientId: IngredientId; count: number };
  requiresSkill: SkillId;
}
```

### 3.6 Habilidades

```ts
interface SkillBranch {
  id: BranchId;
  order: number;              // posição na tela
  icon: AssetId;
}

interface Skill {
  id: SkillId;
  branchId: BranchId;
  tier: 1 | 2 | 3;
  cost: number;
  requires: SkillId[];        // pré-requisitos explícitos (tier anterior do ramo)
  minLevel?: number;          // tier 3 exige nível 4
  effects: SkillEffect[];
}

type SkillEffect =
  | { type: "addSlices"; value: number }
  | { type: "addQuality"; value: number }
  | { type: "addToppingSlots"; value: number }
  | { type: "lastSliceMultiplier"; value: number }                 // Borda Recheada: 1.5
  | { type: "harmonyBonus"; value: number }                        // Harmonia: +2
  | { type: "toppingIntensity"; value: number }                    // Toque Final: 1.5
  | { type: "unlockRecipe"; recipeId: RecipeId }
  | { type: "unlockConversion"; conversionId: ConversionId }
  | { type: "batchFreeCategory"; category: IngredientCategory; batchSize: number }; // Forno a Lenha
```

Efeitos são **dados**, não código: `cookPizza()` lê a lista e aplica cada tipo conhecido. Um efeito novo exige um novo `type` e seu tratamento, com teste.

### 3.7 Efeitos de status

```ts
interface StatusDef {
  id: StatusId;
  polarity: "positive" | "negative";   // Fresco remove apenas negativos
  defaultDuration: number | null;      // em turnos; null = até ser consumido/expirar por regra
  stacking: "refresh" | "sum";         // renova duração ou soma valor
  maxValue?: number;                   // para Escudo: múltiplo de P (2)
  tick?: { damage?: number };          // efeito no início do turno do afetado
  damageDealtMultiplier?: number;      // Enfraquecido: 0.7
  nextActionMultiplier?: number;       // Preparando: 2
}
```

Status da demo: `status.queimadura`, `status.enfraquecido`, `status.escudo`, `status.preparando`.

### 3.8 Ações de batalha (inimigos)

Fatias de pizza são geradas a partir do `SliceActionTemplate` da receita. Ações naturais de criaturas são definidas em valores absolutos. As duas produzem o mesmo `ResolvedAction` em tempo de execução (seção 5.2), cumprindo as regras unificadas de batalha do GDD (7.1).

```ts
interface BattleActionDef {
  id: ActionId;
  profile: Profile | null;
  damage?: number;
  heal?: number;
  shield?: number;
  applyStatus?: StatusApplication[];
  stealSlice?: boolean;          // Belisco do Rato: remove 1 fatia da pizza com mais fatias
  skipTurn?: boolean;            // "Atiça o forno!"
  usesPerBattle?: number;        // Respiro: 1
  intentIcon: AssetId;           // ícone de intenção mostrado ao jogador
}
```

### 3.9 Inimigo

```ts
interface Enemy {
  id: EnemyId;
  profile: Profile;
  maxHp: number;
  traits: EnemyTrait[];
  canFlee: boolean;              // false em chefes
  xp: number;
  drops: Drop[];
  phases: EnemyPhase[];          // inimigos comuns têm uma fase só
  basket?: EnemyPizza[];         // só para rivais que usam pizzas visíveis (Ravena)
  sprite: AssetId;
}

type EnemyTrait =
  | { type: "agile" }                                   // age primeiro no 1º turno
  | { type: "resistant"; flatReduction: number };       // Fungo: −2 por golpe

interface EnemyPhase {
  untilHpAtOrBelow: number;      // fase vale enquanto HP > este valor; última fase = 0
  profile?: Profile;             // muda o perfil do inimigo nesta fase
  pattern: ActionId[];           // ciclo de ações
  onEnterAction?: ActionId;      // ação de transição (anunciada como intenção)
}

interface Drop {
  ingredientId: IngredientId;
  count: number;
  chance: number;                // 0..1; 1 = garantido
}

interface EnemyPizza {
  label: string;                 // chave de idioma: nome da pizza exibido
  actionId: ActionId;            // ação de cada fatia
  slices: number;
}
```

> **Rival com pizzas:** na Ravena, cada `ActionId` do `pattern` corresponde a uma pizza do `basket`, e a interface mostra as fatias restantes. A IA continua seguindo o padrão fixo. A cesta visível dá ao jogador informação e coerência temática, sem uma IA de escolha de fatias.

### 3.10 Recompensas

Toda recompensa do jogo (missão, baú, coleta única, segredo, primeira vitória) é um **pacote com ID**. Receber um pacote grava a flag `rew.<id>`, e um pacote já recebido nunca é entregue de novo. Essa é a defesa central contra duplicação (planejamento 9.1; GDD 7.6 e 12).

```ts
interface Reward {
  id: RewardId;
  xp?: number;
  skillPoints?: number;
  ingredients?: { ingredientId: IngredientId; count: number }[];
  recipes?: RecipeId[];
  setFlags?: FlagId[];
}
```

### 3.11 Condições

Linguagem única de condições, usada por diálogos, objetos de mapa e missões.

```ts
type Condition =
  | { flag: FlagId }                                       // flag verdadeira ou > 0
  | { flag: FlagId; atLeast: number }                      // contador
  | { quest: QuestId; status: QuestStatus }
  | { quest: QuestId; stepAtLeast: number }
  | { hasIngredient: IngredientId; count: number }
  | { hasPizza: { minQuality?: number; recipeId?: RecipeId } }
  | { hasSkill: SkillId }
  | { knowsRecipe: RecipeId }
  | { minLevel: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };
```

Avaliação: `evaluateCondition(condition, saveData, content) -> boolean`, função pura.

### 3.12 Eventos (roteiros)

Diálogos, cenas e interações são **listas de eventos** executadas em sequência pelo `EventSystem`. O tipo substitui o `OverworldEvent` que o código atual referencia mas não define, e cobre também os `behaviorLoop` de NPCs.

```ts
type GameEvent =
  // movimento e cena
  | { type: "walk"; who: ObjectRef; direction: Direction }
  | { type: "stand"; who: ObjectRef; direction: Direction; time: number }
  | { type: "face"; who: ObjectRef; towards: "player" | Direction }
  | { type: "wait"; time: number }
  // diálogo
  | { type: "message"; speaker?: NpcId; textKey: string }
  | { type: "choice"; textKey: string; options: { textKey: string; events: GameEvent[] }[] }
  // estado
  | { type: "claimReward"; rewardId: RewardId }
  | { type: "setFlag"; flag: FlagId; value?: boolean | number }
  | { type: "incrementFlag"; flag: FlagId; by?: number }
  | { type: "takeIngredients"; items: { ingredientId: IngredientId; count: number }[] }
  | { type: "takePizza"; filter: { minQuality?: number; recipeId?: RecipeId } }   // abre seletor
  | { type: "advanceQuest"; questId: QuestId; toStep: number }
  // fluxo
  | { type: "if"; condition: Condition; then: GameEvent[]; else?: GameEvent[] }
  | { type: "startBattle"; enemyId: EnemyId; source?: ObjectRef; onWin?: GameEvent[]; onLose?: GameEvent[] }
  | { type: "changeMap"; mapId: MapId; entrance: string }
  | { type: "openOven"; ovenId: OvenId }
  | { type: "rest"; ovenId: OvenId }
  | { type: "autosave" }
  | { type: "endDemo" };

type ObjectRef = "player" | string;   // ID local no mapa atual
```

**Regras do `EventSystem`:**
- Eventos de roteiro (cenas e diálogos) bloqueiam o controle do jogador até terminar. Os `behaviorLoop` de NPCs **não** bloqueiam e são pausados enquanto uma cena roda.
- Toda espera usa o relógio do `GameLoop`, nunca `setTimeout` (planejamento 6.4). Uma troca de mapa cancela os loops do mapa anterior.
- Entregar itens ao jogador acontece **só** por `claimReward`. Isso obriga toda recompensa a ter ID e ser deduplicada. Exceção: drops de batalha, que são aleatórios e repetíveis por natureza (seção 5.3).

### 3.13 NPC e diálogos

```ts
interface Npc {
  id: NpcId;
  sprite: AssetId;
  portrait?: AssetId;
}

// Definido no objeto de mapa que posiciona o NPC (3.14)
interface Talking {
  condition?: Condition;      // a primeira entrada cuja condição é verdadeira é executada
  events: GameEvent[];
}
```

```json
"talking": [
  {
    "condition": { "quest": "quest.primeiro_desafio", "stepAtLeast": 5 },
    "events": [{ "type": "message", "speaker": "npc.mestre_basilio", "textKey": "dlg.mestre_basilio.pos_duelo.1" }]
  },
  {
    "events": [{ "type": "message", "speaker": "npc.mestre_basilio", "textKey": "dlg.mestre_basilio.padrao.1" }]
  }
]
```

### 3.14 Mapa

Mapas são editados no Tiled e convertidos para `MapDef` em tempo de build (ADR-007). O jogo só conhece o `MapDef`. As convenções de camadas e propriedades no Tiled estão no `ARCHITECTURE.md`.

```ts
interface MapDef {
  id: MapId;
  width: number;                         // em tiles
  height: number;
  tilesets: { assetId: AssetId; firstGid: number; columns: number }[];
  lower: number[][];                     // camadas desenhadas abaixo das entidades (índices de tile, 0 = vazio)
  upper: number[][];                     // camadas desenhadas acima das entidades
  collision: string[];                   // gerado pelo conversor: uma string por linha, "#" parede, "." livre
  music?: AssetId;
  entrances: Record<string, { x: number; y: number; direction: Direction }>;
  objects: MapObject[];
}

type MapObject = MapObjectBase & (
  | { kind: "npc"; npcId: NpcId; talking: Talking[]; behaviorLoop?: GameEvent[] }
  | { kind: "enemy"; enemyId: EnemyId; respawn: "rest" | "never"; behaviorLoop?: GameEvent[]; onDefeat?: GameEvent[] }
  | { kind: "oven"; ovenId: OvenId }
  | { kind: "chest"; rewardId: RewardId }
  | { kind: "harvest"; ingredientId: IngredientId; count: number; renew: "rest" | "never"; rewardId?: RewardId }
  | { kind: "sign"; textKey: string }
  | { kind: "door"; toMap: MapId; toEntrance: string }
  | { kind: "trigger"; once: boolean; events: GameEvent[] }   // ativado ao pisar
);

interface MapObjectBase {
  id: string;                            // ID local
  x: number;                             // tiles
  y: number;
  direction?: Direction;
  visibleIf?: Condition;                 // ex.: NPC bloqueando a ponte até a etapa 3
  solid?: boolean;                       // padrão: true para npc/enemy/oven/chest/sign
}
```

**Por que `collision` como linhas de texto:** o conversor gera a grade a partir da camada de colisão do Tiled. Em formato textual, uma mudança de colisão aparece legível no diff do `MapDef` gerado, o que facilita a revisão. Cada elemento de `lower` e `upper` é uma camada: um array achatado de `width × height` índices de tile (linha a linha), no mesmo formato do Tiled.

**Coletas:** `renew: "never"` exige `rewardId`, e o controle fica a cargo da flag da recompensa. `renew: "rest"` usa a lista `world.harvested` (4.6), que é zerada ao descansar.

### 3.15 Missão

```ts
type QuestStatus = "unavailable" | "available" | "active" | "completed" | "rewarded";

interface Quest {
  id: QuestId;
  kind: "main" | "side";
  availableWhen?: Condition;             // ausente = disponível desde o início
  steps: QuestStep[];
}

interface QuestStep {
  objectiveKey: string;                  // texto do HUD
  completeWhen: Condition;               // verificada após cada evento que altera estado
  rewardId?: RewardId;
}
```

O progresso avança de forma **declarativa**: após qualquer mudança de estado, o `QuestSystem` reavalia o `completeWhen` da etapa atual. Isso evita que uma missão avance "pulando" uma condição, como pede o GDD (seção 10.1). O evento `advanceQuest` existe só para cenas roteirizadas, e mesmo assim respeita a ordem das etapas.

Exemplo da etapa 3 da missão principal:

```json
{
  "objectiveKey": "quest.primeiro_desafio.etapa3",
  "completeWhen": { "flag": "flag.vespas_derrotadas", "atLeast": 3 },
  "rewardId": "rew.guardia_brasa"
}
```

O contador é alimentado pelo `onDefeat` das vespas: `{ "type": "incrementFlag", "flag": "flag.vespas_derrotadas" }`.

### 3.16 Personagem jogável

```ts
interface CharacterDef {
  id: CharacterId;
  sprite: AssetId;
  startingRecipes: RecipeId[];
  startingIngredients: { ingredientId: IngredientId; count: number }[];
}
```

Na demo existe só `char.aprendiz` (ADR-005).

---

## 4. Save (estado do jogador)

### 4.1 Princípios

- O save contém **somente estado que muda**. Tudo que pode ser derivado do conteúdo (PV máximo, efeitos de habilidades, receitas desbloqueadas por habilidade) é **recalculado**, não salvo.
- Exceção deliberada: a **pizza preparada** guarda seus atributos calculados (ADR-004). Assim, um rebalanceamento futuro não altera pizzas que o jogador já tem.
- **Não se salva no meio de uma batalha nem de uma cena.** Se o jogador fechar a página durante uma luta, ao voltar ele reaparece no último salvamento automático, que é sempre anterior à luta (o salvamento automático acontece em trocas de mapa e ao fim de batalhas, GDD 12).

### 4.2 Envelope

```ts
interface SaveFile {
  format: "pizzalegends-save";
  schemaVersion: 1;
  gameVersion: string;             // versão do jogo que gravou (ex.: "0.1.0")
  slotId: SlotId;
  createdAt: string;               // ISO 8601
  updatedAt: string;
  revision: number;                // incrementa a cada gravação; usado na sincronização futura
  summary: SaveSummary;            // exibido na tela de carregar sem processar o save inteiro
  checksum: string;                // hash do campo data; detecta corrupção (não é antitrapaça)
  data: SaveData;
}

type SlotId = "auto" | "slot1" | "slot2" | "slot3";

interface SaveSummary {
  characterName: string;
  level: number;
  mapId: MapId;
  objectiveKey: string | null;
  playTimeMs: number;
}
```

### 4.3 `SaveData`

```ts
interface SaveData {
  activeCharacterId: CharacterId;
  characters: CharacterState[];    // lista desde já (ADR-005)
  inventory: InventoryState;
  quests: Record<QuestId, QuestState>;
  flags: Record<FlagId, boolean | number>;
  world: WorldState;
  rng: { seed: number; state: number };
  counters: { nextPizzaSeq: number };
  stats: PlayStats;
}
```

### 4.4 Personagem e inventário

```ts
interface CharacterState {
  id: CharacterId;
  name: string;                    // máx. 12 caracteres
  level: number;
  xp: number;                      // acumulado
  skillPoints: number;             // não gastos
  skills: SkillId[];
  knownRecipes: RecipeId[];        // só receitas obtidas por recompensa; as de habilidade são derivadas
  cookedRecipes: RecipeId[];       // para o XP de primeiro preparo
}

interface InventoryState {
  ingredients: Record<IngredientId, number>;   // entradas com 0 são removidas
  pizzas: PizzaInstance[];                      // máx. balance.maxPizzas
  lastBasket: PizzaInstanceId[];                // cesta padrão (GDD 7.2)
}

interface PizzaInstance {
  id: PizzaInstanceId;             // "pz_<n>"
  recipeId: RecipeId;
  profile: Profile;
  quality: number;
  potency: number;
  maxSlices: number;
  slicesLeft: number;
  action: ResolvedSliceAction;     // efeito final de cada fatia, já com coberturas e habilidades
  lastSliceMultiplier: number;     // 1 ou 1.5 (Borda Recheada)
  ingredientsUsed: IngredientId[]; // histórico / exibição
}

interface ResolvedSliceAction {
  damage: number;
  heal: number;
  shield: number;
  applyStatus: { status: StatusId; target: "self" | "opponent"; duration: number; bonusDamage?: number }[];
  cleanseNegative: number;
}
```

PV **não** é salvo: fora da batalha, o personagem está sempre com o PV cheio (GDD 7.6).

### 4.5 Missões

```ts
interface QuestState {
  status: QuestStatus;
  step: number;                    // índice da etapa atual (0-based)
}
```

Missões ausentes do mapa estão `unavailable` ou `available`, o que é derivado do `availableWhen`.

### 4.6 Mundo

```ts
interface WorldState {
  mapId: MapId;
  position: { x: number; y: number; direction: Direction };   // tiles
  lastOvenId: OvenId;              // ponto de retorno após derrota
  defeatedEnemies: string[];       // IDs globais "<mapId>/<idLocal>" com respawn "rest"
  harvested: string[];             // coletas renováveis já feitas
}
```

Ao descansar em um forno: `defeatedEnemies = []` e `harvested = []`. Inimigos com `respawn: "never"` (chefes) são controlados por flags.

### 4.7 Aleatoriedade

- Gerador pseudoaleatório com semente (ex.: *mulberry32*, 32 bits). `seed` é sorteado em "Novo jogo"; `state` avança a cada uso e é salvo.
- Usado só em drops de batalha na demo. Recarregar o save e repetir a luta produz o mesmo resultado, o que elimina a tática de recarregar até vir o drop desejado e torna os testes reprodutíveis.

### 4.8 Estatísticas (métricas de playtest, GDD 16)

```ts
interface PlayStats {
  playTimeMs: number;
  battlesWon: number;
  battlesLost: number;
  fled: number;
  bossAttempts: Record<EnemyId, number>;
  pizzasCooked: Record<RecipeId, number>;
  slicesUsedByProfile: Record<Profile, number>;
  defendUsed: number;
  improviseUsed: number;
  firstVictoryAtMs: number | null;
  firstPizzaAtMs: number | null;
}
```

### 4.9 Configurações (fora do save)

Configurações valem para o navegador, não para a partida, e ficam em uma chave separada:

```ts
interface Settings {
  version: 1;
  textSpeed: "slow" | "normal" | "instant";
  musicVolume: number;   // 0..1
  sfxVolume: number;     // 0..1
}
```

### 4.10 Exemplo de save (resumido)

```json
{
  "format": "pizzalegends-save",
  "schemaVersion": 1,
  "gameVersion": "0.1.0",
  "slotId": "auto",
  "createdAt": "2026-11-10T14:02:11.000Z",
  "updatedAt": "2026-11-10T14:19:45.000Z",
  "revision": 23,
  "summary": { "characterName": "Nico", "level": 3, "mapId": "map.bosque", "objectiveKey": "quest.primeiro_desafio.etapa3", "playTimeMs": 1054000 },
  "checksum": "9f2c4a1e",
  "data": {
    "activeCharacterId": "char.aprendiz",
    "characters": [{
      "id": "char.aprendiz", "name": "Nico", "level": 3, "xp": 175, "skillPoints": 0,
      "skills": ["skill.fogo_controlado", "skill.sova_firme"],
      "knownRecipes": ["rec.margherita", "rec.quatro_queijos"],
      "cookedRecipes": ["rec.margherita", "rec.quatro_queijos"]
    }],
    "inventory": {
      "ingredients": { "ing.farinha": 3, "ing.molho_tomate": 2, "ing.mussarela": 2, "ing.manjericao": 4 },
      "pizzas": [{
        "id": "pz_7", "recipeId": "rec.margherita", "profile": "fresco",
        "quality": 3, "potency": 10, "maxSlices": 5, "slicesLeft": 2,
        "action": { "damage": 7, "heal": 8, "shield": 0, "applyStatus": [], "cleanseNegative": 1 },
        "lastSliceMultiplier": 1,
        "ingredientsUsed": ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.manjericao"]
      }],
      "lastBasket": ["pz_7"]
    },
    "quests": { "quest.primeiro_desafio": { "status": "active", "step": 2 } },
    "flags": { "rew.mestre_inicio": true, "rew.despensa_ratos": true, "flag.vespas_derrotadas": 1 },
    "world": {
      "mapId": "map.bosque", "position": { "x": 12, "y": 8, "direction": "left" },
      "lastOvenId": "oven.acampamento", "defeatedEnemies": ["map.bosque/vespa_1"], "harvested": []
    },
    "rng": { "seed": 1849201, "state": 3920118734 },
    "counters": { "nextPizzaSeq": 8 },
    "stats": { "playTimeMs": 1054000, "battlesWon": 4, "battlesLost": 0, "fled": 0, "bossAttempts": {}, "pizzasCooked": { "rec.margherita": 4, "rec.quatro_queijos": 2 }, "slicesUsedByProfile": { "fresco": 9, "cremoso": 3, "picante": 0, "defumado": 0 }, "defendUsed": 1, "improviseUsed": 0, "firstVictoryAtMs": 302000, "firstPizzaAtMs": 95000 }
  }
}
```

(No exemplo, a cura da Margherita é `floor(0,6 × 10) = 6`, mais 2 do Manjericão = 8.)

---

## 5. Estado em tempo de execução (não salvo)

### 5.1 Batalha

```ts
interface BattleState {
  turn: number;
  phase: "basket" | "intent" | "playerChoice" | "resolving" | "victory" | "defeat" | "fled";
  player: Combatant & { basket: PizzaInstanceId[] };
  enemy: Combatant & { enemyId: EnemyId; phaseIndex: number; patternIndex: number; usesLeft: Record<ActionId, number> };
  log: BattleLogEntry[];           // para a interface e para depuração/testes
}

interface Combatant {
  hp: number;
  maxHp: number;
  profile: Profile | null;
  statuses: { status: StatusId; remaining: number | null; value?: number }[];
}
```

As pizzas da cesta são **cópias** durante a batalha. As fatias gastas só são gravadas no inventário quando a batalha termina (vitória, derrota ou fuga). Se a página fechar no meio da luta, nada é perdido além da própria luta.

### 5.2 Ação resolvida

```ts
interface ResolvedAction {
  source: "player" | "enemy";
  origin: { kind: "slice"; pizzaId: PizzaInstanceId } | { kind: "natural"; actionId: ActionId } | { kind: "defend" } | { kind: "improvise" };
  profile: Profile | null;
  damage: number; heal: number; shield: number;
  applyStatus: ResolvedSliceAction["applyStatus"];
  cleanseNegative: number;
  stealSlice: boolean;
  skipTurn: boolean;
}
```

---

## 6. Funções puras (regras de jogo)

Toda regra que altera progresso é uma função **pura**: recebe o estado e o conteúdo e devolve um **novo** estado ou um resultado, sem acessar canvas, relógio, `localStorage` ou `Math.random`. Assim as regras são testáveis em unidade e poderão rodar no servidor quando a nuvem chegar (ADR-001, regra 5).

| Função | Assinatura | Regras-chave |
|---|---|---|
| Disponibilidade | `getAvailableRecipes(char, content) -> RecipeId[]` | `knownRecipes` + receitas liberadas por habilidades |
| Pré-visualização | `previewPizza(recipeId, ingredientIds, char, content) -> PizzaPreview \| PreparationError` | Mesma conta do preparo, sem gastar nada (GDD 5.4) |
| Preparo | `cookPizza(save, recipeId, ingredientIds, content) -> { save, pizza } \| PreparationError` | Valida requisitos e estoque, consome ingredientes, cria `pz_<n>`, concede XP de primeiro preparo, respeita `maxPizzas` |
| Conversão | `convertIngredients(save, conversionId, times, content) -> save \| Error` | Exige habilidade e estoque; respeita pilha máxima |
| Habilidade | `learnSkill(save, skillId, content) -> save \| Error` | Pontos, `requires`, `minLevel`, não repetido |
| XP | `grantXp(save, amount, content) -> { save, levelsGained }` | Sobe de nível pela `xpTable` (começa no nível 1), +1 ponto por nível, teto `maxLevel` |
| Recompensa | `claimReward(save, rewardId, content) -> { save, granted: boolean }` | Se a flag `rew.<id>` existe, `granted: false` e nada muda |
| Condição | `evaluateCondition(cond, save, content) -> boolean` | — |
| Missões | `updateQuests(save, content) -> { save, events }` | Reavalia etapas, aplica recompensas, emite avisos para a interface |
| Batalha: início | `createBattle(save, enemyId, basket, content) -> BattleState` | Copia pizzas, define iniciativa |
| Batalha: turno | `resolveTurn(battle, playerChoice, rng, content) -> { battle, rng }` | Ordem do GDD 7.3, fórmula 7.4, status 7.5 |
| Batalha: fim | `applyBattleResult(save, battle, rng, content) -> save` | Fatias, drops (com rng), XP, estatísticas, flags de derrota |
| Descanso | `restAtOven(save, ovenId) -> save` | Zera `defeatedEnemies`/`harvested`, atualiza `lastOvenId` |

`PreparationError` é uma união de motivos legíveis pela interface (`"missingIngredient"`, `"tooManyToppings"`, `"inventoryFull"`, `"recipeUnknown"`…), para a mensagem "Falta Mussarela" do GDD 11.3.

### 6.1 Algoritmo de `cookPizza` (referência)

```text
1. receita conhecida ou liberada por habilidade?                senão → recipeUnknown
2. separar ingredientes informados em obrigatórios e coberturas
3. obrigatórios satisfazem receita.requirements (ingredient antes de category)?   senão → missingIngredient
4. coberturas ≤ receita.toppingSlots + Σ addToppingSlots?        senão → tooManyToppings
5. estoque suficiente?                                            senão → missingIngredient
6. inventário de pizzas < maxPizzas?                              senão → inventoryFull
7. mediaRaridade = média(rarityValue de todos os ingredientes usados)
8. quality = baseQuality + floor(mediaRaridade) + Σ addQuality
            + (harmonyBonus se todo ingrediente com perfil ≠ null tiver o perfil da receita)
            + Σ qualityBonus das coberturas (× toppingIntensity, arredondado para baixo)
9. potency = potency.base + potency.perQuality × quality
10. maxSlices = clamp(baseSlices + Σ addSlices, slices.min, slices.max)
11. action = sliceAction da receita aplicada a potency (arredondado para baixo)
             + modificadores das coberturas (× toppingIntensity, arredondado para baixo)
12. consumir ingredientes; criar PizzaInstance com id "pz_" + nextPizzaSeq; nextPizzaSeq++
13. se receita ∉ cookedRecipes → grantXp(firstCookXp) e registrar
```

O preparo em lote do *Forno a Lenha* é `cookPizza` chamado duas vezes, sendo que na segunda os ingredientes da categoria `massa` não são consumidos. A interface oferece a opção "preparar 2".

---

## 7. Validação

### 7.1 Conteúdo (na carga e nos testes)

Executada em todo carregamento em ambiente de desenvolvimento e em um teste automatizado obrigatório:

- Todo ID tem o prefixo correto e é único no seu tipo.
- **Integridade referencial:** todo ID citado (em receitas, habilidades, drops, recompensas, condições, eventos, portas, entradas) existe no registro.
- Toda porta aponta para um mapa e uma entrada existentes.
- Objetos de mapa estão dentro dos limites e não ficam sobre `#` da colisão (exceto `door`, `trigger` e `oven`, que pode ser parte da arte, como um balcão).
- `collision` tem exatamente `height` linhas de `width` caracteres.
- Coletas `renew: "never"` têm `rewardId`.
- Fases de inimigo têm limiares de PV decrescentes, e a última termina em 0.
- Toda entidade tem a chave de idioma `.name`, e toda `textKey` existe em `pt-BR.json`.
- Toda habilidade de tier N > 1 exige alguma habilidade do mesmo ramo.

### 7.2 Save (ao carregar)

```text
1. JSON válido e format === "pizzalegends-save"?          senão → corrompido
2. checksum confere?                                      senão → corrompido
3. schemaVersion > versão suportada pelo jogo?           se sim → "save de versão mais nova", não carrega
4. aplicar migrações de schemaVersion até a atual (7.3)
5. validar estrutura (tipos, faixas: level 1..maxLevel, contagens ≥ 0, slicesLeft ≤ maxSlices…)
6. IDs desconhecidos (conteúdo removido): remover e registrar aviso no console; nunca travar
```

Save corrompido ou ilegível: o jogo **não sobrescreve** o arquivo original. Ele é copiado para `pizzalegends:backup:<slot>:<timestamp>` e o jogador é avisado (ADR-001, regra 7).

Ferramenta: **Zod** (ADR-006). Os mesmos esquemas validam conteúdo e saves.

### 7.3 Migrações

```ts
type Migration = (data: unknown) => unknown;
const migrations: Record<number, Migration> = {
  // 1: (v1) => v2,   // exemplo futuro: adicionar equipe
};
```

- Cada mudança de formato **incrementa** `schemaVersion` e adiciona a migração `N -> N+1`.
- Para cada versão publicada, existe um save de exemplo em `tests/fixtures/saves/v<N>.json`, e um teste garante que ele migra até a versão atual e passa na validação.
- Migrações nunca são removidas.

---

## 8. Persistência local

### 8.1 Interface (ADR-001)

```ts
interface SaveRepository {
  list(): Promise<SaveSummaryWithSlot[]>;
  load(slotId: SlotId): Promise<SaveFile | null>;
  save(slotId: SlotId, data: SaveData): Promise<SaveFile>;   // monta o envelope, revision++, checksum
  delete(slotId: SlotId): Promise<void>;
}
```

A interface é **assíncrona** mesmo que o armazenamento local seja síncrono, para que a versão com Supabase a implemente sem mudar quem a usa.

### 8.2 Implementação da demo: `LocalSaveRepository`

| Chave em `localStorage` | Conteúdo |
|---|---|
| `pizzalegends:save:auto` | Salvamento automático |
| `pizzalegends:save:slot1..3` | Salvamentos manuais |
| `pizzalegends:backup:<slot>:<timestamp>` | Cópias de saves corrompidos (máx. 3; as mais antigas são removidas) |
| `pizzalegends:settings` | `Settings` |

- `localStorage` é suficiente: um save completo da demo tem poucos KB.
- Toda leitura e escrita fica em `try/catch`. Em navegação privada ou com armazenamento bloqueado, o jogo funciona sem salvar e avisa o jogador uma vez.
- Escrita segura: grava primeiro em `pizzalegends:save:<slot>:tmp`, valida a leitura e só então substitui a chave final. Uma queda de energia no meio da gravação não destrói o save anterior.

---

## 9. Preparação para o banco de dados

Resumo do que será detalhado no `DATABASE.md` quando a nuvem entrar em escopo (gatilhos da ADR-001):

| Dado | Destino futuro | Observação |
|---|---|---|
| Conteúdo estático (`src/data`) | Continua como arquivos estáticos | Pode ir para o banco se houver eventos ao vivo; não é necessário |
| `SaveFile` | Tabela `save_slots` (`user_id`, `slot_id`, `schema_version`, `revision`, `data jsonb`, `updated_at`) | O envelope já tem `revision`, base para resolver conflitos entre dispositivos |
| `Settings` | Tabela `profiles` ou continua local | — |
| Recompensas competitivas (se houver ranking) | Validadas no servidor com as **mesmas funções puras** da seção 6 | Motivo da regra 5 da ADR-001 |
| `PlayStats` | Possível tabela de telemetria opcional | Só com consentimento |

O save já foi desenhado como um documento JSON único e versionado. A primeira versão na nuvem pode guardá-lo inteiro em `jsonb`, sem normalizar. A normalização em tabelas só se justifica se algum recurso precisar consultar partes do save no servidor (ex.: ranking por nível).

---

## 10. Do código atual para os novos modelos

| Código atual | Modelo novo | Mudança |
|---|---|---|
| `window.OverworldMap.DemoRoom` (objeto JS com instâncias `new Person`) | `MapDef` em `src/data/maps/cozinha_mestre.json` | Dados puros; as instâncias são criadas pelo `WorldManager` ao entrar no mapa |
| `walls: { "112,96": true }` (pixels) | `collision: string[]` (tiles) | Conversão na carga; fim da mistura pixel/tile |
| `gameObjects.hero` dentro do mapa | Jogador fora do mapa; `world.position` + `entrances` | O herói não é mais redefinido em cada mapa (corrige o `Kitchen`, que criava o herói como `GameObject`) |
| `behaviorLoop: [{ type: "stand", ... }]` | `behaviorLoop: GameEvent[]` | Mesmo formato, agora executado pelo `EventSystem` (substitui o `OverworldEvent` inexistente) |
| `isPlayerControlled` | Entidade `Player` separada | — |
| `src: "images/npc1.png"` | `sprite: AssetId` | Caminhos resolvidos por um manifesto de assets |

---

## 11. Questões em aberto

1. ~~Formato dos mapas~~ **Resolvida (ADR-007):** Tiled, convertido para `MapDef` em tempo de build.
2. ~~Validadores~~ **Resolvida (ADR-006):** Zod.
3. ~~Algoritmo do `checksum`~~ **Definido no `ARCHITECTURE.md`:** FNV-1a de 32 bits.
4. ~~Manifesto de assets~~ **Definido no `ARCHITECTURE.md`**, seção 12.
