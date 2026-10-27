# Pizza Legends — Registro de Decisões Técnicas

> Registro das decisões de arquitetura e design (formato ADR simplificado).
> Cada decisão tem contexto, decisão, consequências e questões em aberto.
> Decisões só mudam por meio de uma nova entrada que substitua a anterior. Não editar o histórico.
>
> **Documento de origem:** [`PLANEJAMENTO_TECNICO_PIZZA_LEGENDS.md`](PLANEJAMENTO_TECNICO_PIZZA_LEGENDS.md)

| ID | Título | Status | Data |
|---|---|---|---|
| ADR-001 | Salvamento local primeiro, preparado para nuvem | Aceita | 27/10/2026 |
| ADR-002 | Stack: Canvas 2D com motor próprio + Next.js/Supabase | Aceita | 27/10/2026 |
| ADR-003 | Modelo de jogo: personagens combatem, pizzas são itens, ingredientes são habilidades | Substituída pela ADR-004 | 27/10/2026 |
| ADR-004 | Modelo de jogo: ingredientes como recursos, habilidades culinárias e batalha por fatias | Aceita | 27/10/2026 |
| ADR-005 | Protagonista único na demo | Aceita | 27/10/2026 |
| ADR-006 | Ferramental: Vite + TypeScript, Vitest e Zod | Aceita | 27/10/2026 |
| ADR-007 | Mapas produzidos no Tiled | Aceita | 27/10/2026 |

---

## ADR-001 — Salvamento local primeiro, preparado para nuvem

**Status:** Aceita · **Data:** 27/10/2026

### Contexto

O objetivo de longo prazo inclui banco de dados, contas e progressão persistente. Porém o motor ainda não está estável e as regras de combate, missões e receitas ainda não foram validadas com jogadores. Adotar banco desde o início traria um custo fixo alto: autenticação, RLS, validação no servidor, modo offline, conflitos de sincronização e ambientes separados. Também levaria a migrações frequentes de schema enquanto o design ainda muda, e exigir conta reduziria o número de pessoas dispostas a testar.

### Decisão

A primeira versão (demo) usa **salvamento local no navegador**. O sistema de salvamento é projetado desde já para que a nuvem seja só uma nova implementação, sem reescrever a lógica do jogo.

Regras obrigatórias:

1. **Interface única de persistência:** `SaveRepository` com operações `list()`, `load(slotId)`, `save(slotId, data)` e `delete(slotId)`. A implementação inicial é `LocalSaveRepository` (IndexedDB ou `localStorage`). A futura `SupabaseSaveRepository` implementa o mesmo contrato.
2. **Save versionado:** todo save contém `schemaVersion`. Cada alteração de formato vem acompanhada de uma função de migração `vN -> vN+1`, com teste.
3. **IDs estáveis em string**, com namespace (ex.: `map.vila`, `char.aprendiz`, `item.pizza.margherita`, `skill.ing.manjericao`, `quest.primeiro_desafio`). Nunca usar índices de array como identidade.
   > **Nota (errata, 27/10/2026):** os exemplos `item.pizza.margherita` e `skill.ing.manjericao` seguiam o modelo da ADR-003, já substituída. Os prefixos válidos estão no `DATA_MODELS.md` (seção 1.3), ex.: `rec.margherita`, `ing.manjericao`, `skill.fogo_controlado`. A regra em si não muda.
4. **Estado do jogo separado da renderização:** o save contém apenas dados serializáveis (sem referências a `Image`, canvas, timers ou instâncias de classe).
5. **Regras de progressão como funções puras** (recompensas, dano, crafting, conclusão de missão, ganho de XP). Elas são testáveis e poderão rodar no servidor para validação quando a nuvem existir.
6. **Conteúdo orientado a dados:** personagens, inimigos, itens, habilidades, receitas e missões ficam em arquivos de dados versionados no repositório, não espalhados pelo código.
7. **Validação ao carregar:** saves corrompidos ou de versão desconhecida não quebram o jogo. O jogador é avisado e o save original é preservado.

### Consequências

- (+) A demo pode ser jogada por link, sem cadastro. O ciclo de iteração fica curto.
- (+) O formato do save serve de rascunho do schema do banco (`DATA_MODELS.md` → `DATABASE.md`).
- (+) A migração para a nuvem se limita a: nova implementação de `SaveRepository`, autenticação e validação das regras no servidor.
- (−) Na demo, o progresso fica preso ao navegador/dispositivo e pode ser perdido se o jogador limpar os dados do site.
- (−) Saves locais podem ser editados pelo jogador. Isso é aceitável enquanto não houver ranking, economia ou recompensas competitivas.

### Gatilhos para antecipar o banco de dados

Revisar esta decisão se algum destes itens entrar no escopo:

- ranking ou conquistas que precisem ser confiáveis contra trapaça;
- troca de itens, economia entre jogadores ou qualquer recurso multiplayer;
- requisito de continuar a partida em outro dispositivo;
- monetização vinculada à conta.

---

## ADR-002 — Stack: Canvas 2D com motor próprio + Next.js/Supabase

**Status:** Aceita · **Data:** 27/10/2026

### Contexto

O código existente é um motor próprio em JavaScript puro sobre Canvas 2D (movimento em grade, camadas de mapa, câmera, sprites). A alternativa considerada foi migrar para uma engine web como Phaser.

### Decisão

1. **Motor do jogo:** manter **Canvas 2D com motor próprio**, evoluindo o código atual de forma incremental (módulos ES, `GameLoop` com passo fixo, sistemas separados conforme a seção 6 do planejamento).
2. **Plataforma web e backend:** **Next.js** (versão estável vigente) como aplicação web e **Supabase** (Auth + Postgres + RLS) para contas e dados, quando a nuvem entrar no escopo (ver gatilhos da ADR-001).
3. **Desacoplamento:** o motor não depende de React/Next.js. Ele é um módulo isolado que recebe um elemento canvas e expõe uma API mínima (`start`, `stop`, `loadSave`, `onSaveRequested`, eventos de jogo). O Next.js apenas monta o jogo em um componente client-side e cuida de páginas, login e integração com o Supabase.

### Consequências

- (+) Reaproveita o código e o conhecimento já construídos e dá controle total sobre o motor.
- (+) O motor pode ser testado e publicado sozinho (demo estática) antes de existir backend.
- (−) Recursos que uma engine traria prontos (áudio, tweens, tilemaps, partículas, cenas, input touch) precisam ser implementados ou trazidos de bibliotecas pequenas.
- (−) O esforço de manutenção do motor fica com a equipe. É preciso documentar bem a arquitetura (`ARCHITECTURE.md`).

### Em aberto

- Adotar ferramenta de build (ex.: **Vite**) e/ou **TypeScript** já na Fase 0 ou mais tarde (decisão pendente nº 8 do planejamento).
- Formato dos mapas: imagens em camadas (como hoje) ou tilemaps (ex.: exportados do Tiled).

---

## ADR-003 — Modelo de jogo: personagens combatem, pizzas são itens, ingredientes são habilidades

**Status:** Substituída pela [ADR-004](#adr-004--modelo-de-jogo-ingredientes-como-recursos-habilidades-culinárias-e-batalha-por-fatias) · **Data:** 27/10/2026

> **Motivo da substituição:** tratar ingredientes como habilidades e, ao mesmo tempo, como insumos de receita gerava conflito (cozinhar consumiria habilidades). A ADR-004 dá um papel único a cada conceito.

### Contexto

O planejamento apontava como a decisão de design mais importante definir se as pizzas seriam combatentes, habilidades ou itens. Essa escolha define o combate, a progressão e o modelo de dados.

### Decisão

| Conceito | Papel no jogo |
|---|---|
| **Personagens** | São os **combatentes**. Personagens autorais, criados para o jogo, com atributos, nível/progressão e espaços para habilidades. |
| **Ingredientes** | São as **habilidades**. Cada ingrediente concede uma ação ou efeito que um personagem pode usar em combate. |
| **Pizzas** | São **itens**. Produzidas por receitas a partir de ingredientes e usadas em combate e/ou exploração (cura, buffs, efeitos especiais). |

### Consequências

- O combate gira em torno de personagens (`Character`) que executam habilidades (`Skill` vindas de ingredientes) e usam itens (`Item` do tipo pizza).
- O crafting (`CraftingSystem`) liga as duas camadas: ingredientes → receita → pizza.
- Os exemplos da seção 4.4 do planejamento (ex.: "Margherita: ataque básico") precisam ser revistos: pizzas deixam de ser ataques e passam a ser efeitos de item.
- Entidades mínimas para o `DATA_MODELS.md`: `Character`, `Skill` (ingrediente), `Item` (pizza e outros consumíveis), `Recipe`, `Enemy`, `Quest`, `SaveGame`.

### Questões em aberto (resolver no `GAME_DESIGN_DOCUMENT.md`)

1. **Ingrediente como habilidade versus ingrediente como insumo de receita.** Se o ingrediente é uma habilidade, cozinhar uma pizza o consome? Opções a avaliar:
   - (a) o ingrediente é **desbloqueado** (habilidade permanente) e a receita exige apenas conhecê-lo, gastando outro recurso (ex.: massa, moedas, energia);
   - (b) o ingrediente tem **duas formas**: conhecimento (habilidade permanente) e unidades coletáveis (insumo consumido no crafting);
   - (c) ingredientes **equipados** viram habilidades e ingredientes **em estoque** viram insumos.
2. Toda habilidade vem de ingredientes ou os personagens também têm habilidades próprias (classe/arquétipo)?
3. Quantos ingredientes/habilidades cada personagem pode equipar ao mesmo tempo? Há restrições por personagem (afinidades)?
4. O jogador controla um personagem ou uma equipe? (decisão pendente nº 1 do planejamento)
5. Pizzas são só consumíveis de batalha ou também têm usos fora dela (desbloquear áreas, presentear NPCs, missões)?
6. Raridade das pizzas (comum → lendária) e regras de empilhamento no inventário.

---

## ADR-004 — Modelo de jogo: ingredientes como recursos, habilidades culinárias e batalha por fatias

**Status:** Aceita · **Data:** 27/10/2026 · **Substitui:** ADR-003

### Contexto

A ADR-003 tratava ingredientes como habilidades e também como insumos de receitas. Isso tornava ambíguo o efeito de cozinhar (consumiria habilidades?) e misturava evolução com recurso. A visão de produto pede que o jogador seja um personagem que evolui, que as batalhas girem em torno de pizzas e que a evolução apareça na prática: um personagem mais experiente faz pizzas melhores e, por isso, tem mais chance de vencer.

### Decisão

Cada conceito tem um papel único, organizado em três camadas:

```text
Ingredientes (recursos coletados)
        +
Habilidades do personagem (conquistadas ao evoluir)
        ↓
Pizzas (preparadas por receitas e usadas na batalha, fatia a fatia)
        ↓
Vitórias → XP + ingredientes → novas habilidades → pizzas melhores
```

| Conceito | Papel no jogo |
|---|---|
| **Personagem** | O jogador. Ganha XP (batalhas, missões, descobertas), sobe de nível e conquista **habilidades culinárias**. Personagens são autorais, criados para o jogo. |
| **Habilidades** | Pertencem ao personagem e são a forma de evolução. Ficam organizadas em uma **árvore com ramos** (ex.: Massa, Molho, Queijo, Forno, Coberturas). Não são ataques: melhoram a produção de pizzas. |
| **Ingredientes** | **Recursos** coletáveis (exploração, recompensas, baús), **consumidos** no preparo. Cada um tem raridade/qualidade e um **perfil** (ex.: picante, cremoso, fresco, defumado) que define o tipo de efeito que dá à pizza. |
| **Receitas** | Definem quais ingredientes são exigidos ou aceitos e o efeito base da pizza. Algumas são desbloqueadas por habilidades. |
| **Pizzas** | Itens de combate. Resultado de **receita + ingredientes + habilidades**. Cada pizza tem **fatias**, que são as ações usadas na batalha. |

#### Efeitos das habilidades na produção

Habilidades podem, entre outros efeitos:

- desbloquear receitas;
- aumentar a **qualidade** da pizza (força dos efeitos);
- aumentar o **número de fatias**;
- permitir mais coberturas por pizza;
- transformar ou realçar ingredientes (ex.: "Defumação" transforma queijo em queijo defumado, com outro efeito);
- reduzir o consumo de ingredientes ou o custo de preparo.

#### Cálculo da pizza

- O preparo é **determinístico**: `prepararPizza(receita, ingredientes, habilidades) -> Pizza`, uma função pura (ADR-001, regra 5). As mesmas entradas sempre produzem a mesma pizza.
- A pizza resultante guarda atributos já calculados (qualidade, nº de fatias, efeitos por fatia, perfil). Assim o combate não precisa recalcular nada e o save fica autocontido.
- Eventual aleatoriedade (ex.: chance de "pizza perfeita") só entra se for controlada por uma semente salva, para manter a reprodutibilidade dos testes.

#### Batalha por fatias

- Antes da batalha, o jogador escolhe um **conjunto de pizzas preparadas** para levar (limite inicial sugerido: 4, sujeito a balanceamento; pode aumentar com habilidades).
- Combate por turnos. Em cada turno, o jogador escolhe **uma fatia** de uma das pizzas levadas. Cada fatia executa uma ação: ataque, cura, defesa, efeito de status etc., conforme o perfil e a qualidade da pizza.
- Uma pizza acaba quando todas as suas fatias são usadas. Pizzas preparadas e não levadas, ou com fatias restantes, voltam ao inventário (regra a confirmar no GDD).
- Inimigos (pizzaiolos rivais e criaturas) seguem **as mesmas regras**: também lutam com pizzas e fatias. O `BattleSystem` é um só para os dois lados.
- A estratégia vem de três fontes: **preparo** (quais pizzas fazer), **escolha do conjunto** (o que levar para cada inimigo) e **ordem das fatias** durante a luta (qual usar e quando).

### Consequências

- (+) A evolução aparece no jogo: o jogador vê suas pizzas ficarem melhores.
- (+) A coleta de ingredientes tem propósito contínuo, porque eles são consumidos.
- (+) O modelo de dados fica simples e sem ambiguidade.
- (+) Regras iguais para jogador e inimigos reduzem código e casos especiais.
- (−) Risco de a batalha ficar decidida antes de começar se o poder vier apenas do preparo. Mitigação: inimigos com fraquezas e resistências por perfil, efeitos de status, escolha do conjunto e ordem das fatias.
- (−) Risco de *grinding* (repetição para juntar ingredientes). Mitigação: fontes de ingredientes ligadas à exploração e missões, e escolhas reais na árvore de habilidades.
- A seção 4.4 do planejamento (exemplos de receitas) deve ser reescrita no `GAME_DESIGN_DOCUMENT.md` segundo este modelo.

### Entidades para o `DATA_MODELS.md`

| Entidade | Natureza | Observação |
|---|---|---|
| `Character` | Estado salvo | Nível, XP, habilidades desbloqueadas, atributos (ex.: vida) |
| `Skill` | Conteúdo estático | Ramo, pré-requisitos, custo, modificadores de preparo |
| `Ingredient` | Conteúdo estático | Raridade, perfil, efeitos que concede |
| `Recipe` | Conteúdo estático | Ingredientes exigidos/aceitos, efeito base, desbloqueio |
| `Pizza` | Estado salvo (instância) | Atributos calculados no preparo, fatias restantes |
| `Enemy` | Conteúdo estático | Atributos, fraquezas/resistências, conjunto de pizzas |
| `Quest` | Conteúdo estático + estado salvo | Condições, recompensas, status |
| `SaveGame` | Estado salvo | `schemaVersion`, personagem, inventário, pizzas, missões, mapa/posição, flags |

### Questões em aberto (resolver no `GAME_DESIGN_DOCUMENT.md`)

1. O jogador controla um personagem ou uma equipe? (decisão pendente nº 1 do planejamento). Com equipe, cada personagem teria suas próprias pizzas ou o conjunto seria compartilhado?
2. O personagem tem alguma ação de batalha própria (ex.: defender, fugir) além das fatias? O que acontece se as fatias acabarem antes do fim da luta?
3. Pizzas preparadas estragam ou têm limite de estoque?
4. Atributos do personagem (vida, defesa) também crescem com o nível, ou toda a força vem das pizzas?
5. Lista inicial de perfis de ingredientes e a tabela de fraquezas/resistências.
6. Como se ganham pontos de habilidade (por nível, por missão, por descoberta de receitas)?
7. Escopo da demo: quantos ramos e habilidades, ingredientes e receitas (a seção 5 do planejamento prevê 3 receitas utilizáveis).

---

## ADR-005 — Protagonista único na demo

**Status:** Aceita · **Data:** 27/10/2026 · **Resolve:** questão em aberto nº 1 da ADR-004 e decisão pendente nº 1 do planejamento

### Decisão

O jogador controla **um único personagem**: o protagonista. Não há equipe nem troca de personagem em batalha.

### Consequências

- A batalha é 1 contra 1 (ou 1 contra grupo, em expansões). A cesta de pizzas, a árvore de habilidades e o nível pertencem a esse personagem.
- **Preparação para o futuro:** o save guarda o personagem dentro de uma lista (`characters: [ ... ]`, com `activeCharacterId`). Assim, uma equipe pode ser adicionada depois sem migração estrutural, só incrementando o `schemaVersion`.
- Companheiros podem aparecer como NPCs de história, sem participar do combate.

---

## ADR-006 — Ferramental: Vite + TypeScript, Vitest e Zod

**Status:** Aceita · **Data:** 27/10/2026 · **Resolve:** item "Em aberto" da ADR-002 e decisão pendente nº 8 do planejamento

### Contexto

O `DATA_MODELS.md` define contratos detalhados (conteúdo, save, funções puras) que precisam ser respeitados por todos os sistemas. O código atual é composto por scripts globais sem build, sem testes e sem verificação de tipos.

### Decisão

- **Vite** como servidor de desenvolvimento e ferramenta de build.
- **TypeScript** em modo `strict` para todo o código do jogo. Os arquivos atuais são migrados durante a Fase 0.
- **Vitest** para testes unitários e de integração.
- **Zod** para validar conteúdo e saves em tempo de execução. Os tipos TypeScript são inferidos dos esquemas Zod, que são a fonte única da verdade e evitam tipos e validadores divergentes.
- **ESLint + Prettier**, com regras de fronteira entre camadas (ver `ARCHITECTURE.md`).

### Consequências

- (+) Os contratos do `DATA_MODELS.md` passam a ser verificados pelo compilador e, na carga, pelo Zod.
- (+) Testes das regras puras desde a Fase 0. Build otimizado para publicação.
- (+) Integração direta com Next.js no futuro: o pacote do jogo é um módulo TypeScript comum.
- (−) Curva de aprendizado de TypeScript e uma migração inicial dos ~10 arquivos existentes.
- (−) O jogo deixa de abrir só com um servidor estático sobre os fontes: exige `npm run dev` ou o build.

---

## ADR-007 — Mapas produzidos no Tiled

**Status:** Aceita · **Data:** 27/10/2026 · **Resolve:** formato dos mapas (ADR-002 e `DATA_MODELS.md`)

### Contexto

A demo terá 5 mapas, com colisão, entradas, NPCs, inimigos, baús, coletas e gatilhos. No formato atual (imagens PNG em camadas + colisão escrita à mão), cada objeto e parede é posicionado digitando coordenadas, o que é lento e propenso a erro.

### Decisão

- Os mapas são editados no **Tiled** (editor gratuito) e salvos como `.tmj` (JSON do Tiled) em `content/maps/`.
- Um **conversor em tempo de build** (`scripts/build-maps.ts`) transforma cada `.tmj` no `MapDef` do `DATA_MODELS.md` e grava o resultado em `src/data/maps/`. **O jogo nunca lê o formato do Tiled diretamente**: só conhece o `MapDef`.
- Convenções de camadas e propriedades no Tiled são definidas no `ARCHITECTURE.md`.
- Roteiros longos (diálogos, eventos) **não** são escritos no Tiled. Objetos do mapa apenas referenciam scripts em `src/data/dialogues/`.

### Consequências

- (+) Edição visual de mapas, inclusive por quem não programa.
- (+) A validação do `MapDef` (Zod + integridade referencial) roda sobre a saída do conversor e acusa erros de mapa antes do jogo rodar.
- (+) Se o Tiled for substituído no futuro, só o conversor muda.
- (−) Os cenários atuais (PNG inteiros) precisam ser refeitos como tilesets, o que coincide com a substituição de assets do tutorial já prevista.
