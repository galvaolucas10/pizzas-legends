# Pizza Legends — Roadmap

> **Versão:** 0.1 · **Data:** 27/10/2026
> **Base:** [`PLANEJAMENTO_TECNICO_PIZZA_LEGENDS.md`](PLANEJAMENTO_TECNICO_PIZZA_LEGENDS.md) (seções 7 e 8) · [`GAME_DESIGN_DOCUMENT.md`](GAME_DESIGN_DOCUMENT.md) · [`DATA_MODELS.md`](DATA_MODELS.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`DECISOES_TECNICAS.md`](DECISOES_TECNICAS.md)

Este roadmap transforma as fases do planejamento em **tarefas verificáveis**, com dependências, critérios de aceite e marcos. É a referência para organizar o trabalho e os commits.

---

## 1. Como usar este documento

### 1.1 Identificação das tarefas

`F<fase>-<nn>`, ex.: `F1-07`. O ID vai na mensagem do commit, ex.: `feat(F1-07): tela de cesta`. O trabalho é feito direto na `main` (ver 1.5).

### 1.2 Tamanho relativo

Estimativas relativas, não prazos. O calendário só é definido após medir a velocidade real nas primeiras tarefas da Fase 0.

| Tamanho | Referência |
|---|---|
| **P** | Até ~1 dia de trabalho focado |
| **M** | ~2 a 4 dias |
| **G** | ~1 a 2 semanas; dividir em P/M se possível ao começar |

### 1.3 Definição de pronto (vale para toda tarefa)

- [ ] `typecheck`, `lint`, `validate` e `test` verdes na CI (a partir de F0-01).
- [ ] Regras novas do `core` têm testes unitários.
- [ ] O jogo roda na `main` após o merge, sem erros no console.
- [ ] Contratos alterados (formato de dados, API, regras) atualizados no documento correspondente (`DATA_MODELS`, `ARCHITECTURE`, `GDD`). Uma mudança de decisão gera uma nova ADR.
- [ ] Mudança no formato do save: `schemaVersion` incrementado, migração e fixture criados (DATA_MODELS 7.3).
- [ ] Assets novos registrados no `ASSETS_AND_LICENSES.md`.

### 1.4 Mudança em relação ao planejamento original

O planejamento colocava receitas e crafting na Fase 2. Com a ADR-004, **a batalha depende de pizzas**, então um preparo mínimo (Margherita) passou para a **Fase 1**. A Fase 2 concentra o que diferencia o jogo: perfis completos, árvore de habilidades, conversões e o conteúdo restante da demo.

### 1.5 Fluxo de trabalho no git

- Commits e pushs **direto na `main`**, sem branches nem PRs, para manter o processo simples.
- Antes de cada push, rodar localmente `typecheck`, `lint`, `test` e `build`. A `main` precisa estar sempre jogável.
- Uma tarefa por commit, sempre que possível, com o ID na mensagem: `feat(F0-04): escala inteira responsiva`.

---

## 2. Visão geral

```text
Fase 0  Estabilização e fundação ─────────▶ M0: motor explorável, sem erros
Fase 1  Primeira aventura jogável ────────▶ M1: cozinha → despensa → 1ª batalha → save   ◀ playtest interno
Fase 2  Identidade e demo completa ───────▶ M2: demo inteira jogável do início ao fim   ◀ playtest externo fechado
Fase 3  Polimento, testes e publicação ───▶ M3: demo pública
Fase 4  Expansão orientada por feedback   (direções, não planejada em tarefas)
```

| Marco | Resumo do critério de saída | Prioridade (planejamento 8) |
|---|---|---|
| **M0** | Critérios da seção 2.5 do planejamento, sobre a nova arquitetura | P0 |
| **M1** | Etapas 1 e 2 da missão principal jogáveis, com batalha, preparo e save | P1 |
| **M2** | *O Primeiro Desafio* completo, com conteúdo da seção 15 do GDD | P1/P2 |
| **M3** | Critérios de lançamento da seção 5.1 do planejamento | P2 |

---

## 3. Fase 0 — Estabilização e fundação [P0]

**Objetivo:** motor básico explorável, sem erros críticos, já na arquitetura definida (ARCHITECTURE 24).
**Saída:** M0.

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F0-01 | Projeto Vite + TypeScript (`strict`), ESLint, Prettier, Vitest; código atual convertido em módulos `.ts` com mínimo de mudança; arquivos de imagem renomeados (`snake_case`) | M | — | `npm run dev` abre o jogo como hoje; CI roda `typecheck`, `lint`, `test`, `build` |
| F0-02 | Correção emergencial do `behaviorLoop`: não chamar `doBehaviorEvent` sem comportamento | P | F0-01 | Console sem erros ao abrir o jogo |
| F0-03 | `GameLoop` de passo fixo (60 Hz), `GameClock`, animação por ms, interpolação com arredondamento | M | F0-01 | Velocidade de caminhada idêntica a 60 Hz e a 120/144 Hz (verificado com limitação de FPS no DevTools) |
| F0-04 | Medir e decidir a resolução interna (352×198 vs 384×216); escala inteira responsiva no lugar do `scale(3)` | P | F0-03 | Decisão registrada (atualizar GDD 13.1); jogo nítido em 1366×768, 1920×1080 e 2560×1440 |
| F0-05 | `InputManager` com ações, contextos, buffer por tick e liberação em `blur` | M | F0-03 | Movimento igual ao atual; Alt+Tab não deixa o personagem andando |
| F0-06 | `content/`: esquemas Zod iniciais (mapa, NPC, condições, eventos), `ContentRegistry`, `validate.ts`, script `validate` | M | F0-01 | Conteúdo inválido de propósito gera erro claro; teste `content.test.ts` na CI |
| F0-07 | Tiled: tileset provisório, convenções (ARCHITECTURE 17.1), conversor `build-maps.ts` com testes | G | F0-06 | `.tmj` de exemplo vira `MapDef` válido; conversor recusa tile ≠ 16 px e objeto fora da grade |
| F0-08 | Recriar `map.cozinha_mestre` e `map.despensa` no Tiled (assets provisórios) | M | F0-07 | Mapas carregam com colisão correta; nenhum uso de `withGrid` em dados |
| F0-09 | Manifesto de assets, `AssetLoader` com pacotes e `decode()`, placeholder para asset ausente | M | F0-01 | Nenhum `drawImage` antes do carregamento; asset ausente não quebra o jogo |
| F0-10 | `WorldManager`, `GridOccupancy` com reservas, entidades (`Player`, `Npc`), câmera limitada às bordas, ordenação por Y, cache de camadas | G | F0-03, F0-05, F0-08, F0-09 | Andar nas 4 direções respeitando paredes e NPCs; personagens sobrepostos desenhados na ordem certa |
| F0-11 | `EventSystem`: `EventRunner` por ticks, modos blocking/background, handlers `walk`, `stand`, `face`, `wait` | G | F0-10 | NPCs dos mapas executam `behaviorLoop` sem interrupções; testes com relógio falso; troca de mapa cancela os loops |
| F0-12 | Portas e transições (`door`, `entrances`, fade, `SceneStack` básica) | M | F0-10 | Ida e volta cozinha ↔ despensa preservando controle e direção do jogador |
| F0-13 | Camada `ui/` (DOM sobre o canvas, `--px`), caixa de diálogo, handler `message`, interação com o tile à frente | M | F0-11 | Falar com um NPC abre, avança e fecha o diálogo; jogador não anda com o diálogo aberto |
| F0-14 | Ferramentas de depuração (F1): grade de colisão, IDs, FPS, teleporte | P | F0-10 | Disponível só em dev; ausente no build |
| F0-15 | Criar `ASSETS_AND_LICENSES.md` com inventário dos assets atuais e plano de substituição | P | — | Todo arquivo em `public/assets` listado com origem e licença ou "a substituir" |

### M0 — critérios de saída

- [ ] Aplicação abre sem erros no console.
- [ ] Protagonista anda nas quatro direções e respeita paredes e NPCs.
- [ ] NPCs parados e com comportamento funcionam sem interrupções.
- [ ] Movimento com velocidade igual em 60 Hz e 144 Hz.
- [ ] Mapas carregam sem erros de renderização.
- [ ] Transição entre os dois mapas funciona nos dois sentidos.
- [ ] Ao menos um NPC abre e fecha diálogo.
- [ ] CI verde; mapas vindos do Tiled.

---

## 4. Fase 1 — Primeira aventura jogável [P1]

**Objetivo:** o ciclo completo em miniatura: preparar uma pizza, enfrentar um inimigo, ganhar recompensa e salvar.
**Escopo de conteúdo:** etapas 1 e 2 da missão principal (GDD 10.2), Margherita, Quatro Queijos e o Rato de Despensa.
**Saída:** M1 + playtest interno.

### 4.1 Estado e regras

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F1-01 | Esquemas Zod de todo o conteúdo do DATA_MODELS 3 (ingrediente, receita, habilidade, status, ação, inimigo, recompensa, missão, `balance.json`) + integridade referencial completa | M | F0-06 | Todas as regras da DATA_MODELS 7.1 testadas |
| F1-02 | `core/rng.ts` (mulberry32), `core/newGame.ts` | P | F1-01 | Mesma semente → mesma sequência (teste) |
| F1-03 | `GameSession`: comandos, transações, sinais; `updateQuests` automático após cada comando | M | F1-02 | Comando inválido não altera estado (teste) |
| F1-04 | `core`: `claimReward`, `grantXp`, `evaluateCondition` | M | F1-01 | Recompensa nunca duplica; curva de XP do GDD 3.3; todas as variantes de `Condition` testadas |
| F1-05 | `core/quests.ts` + handlers `claimReward`, `setFlag`, `incrementFlag`, `advanceQuest`, `if` | M | F1-03, F1-04, F0-11 | Etapa não avança sem a condição; HUD mostra o objetivo |
| F1-06 | Diálogos condicionais (`talking` com condições) | P | F1-05 | Mestre fala diferente antes e depois da etapa 1 |

### 4.2 Preparo

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F1-07 | `core/cooking.ts`: `getAvailableRecipes`, `previewPizza`, `cookPizza` (sem habilidades ainda) | M | F1-04 | Exemplos do GDD 5.4 reproduzidos em teste; todos os `PreparationError` cobertos |
| F1-08 | Forno no mapa (`oven`), handler `openOven`, tela do forno com **pré-visualização** | G | F1-07, F0-13 | Preparar Margherita gasta ingredientes certos; erro "Falta X" visível |
| F1-09 | Tela de mochila (ingredientes e pizzas) | M | F1-03 | Quantidades corretas após preparo e recompensas |

### 4.3 Batalha

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F1-10 | `core/battle`: `createBattle`, `resolveTurn` (fatias, Defender, Improvisar, Fugir, iniciativa, multiplicadores, Escudo, Enfraquecido, Queimadura), log | G | F1-07 | Testes cobrindo cada regra do GDD 7.3–7.5 |
| F1-11 | `core/battle`: `applyBattleResult` (fatias gastas, drops com RNG, XP, estatísticas) | M | F1-10 | Derrota mantém progresso e perde só fatias (GDD 7.6) |
| F1-12 | `EnemyActor` no mapa (patrulha, contato → batalha, atordoamento após fuga, `defeatedEnemies`) | M | F0-11, F1-03 | Inimigo derrotado não reaparece até descansar |
| F1-13 | `BattleScene` + `BattlePresenter` + UI de batalha (PV, intenção, efeitos, fatias restantes, dano previsto) | G | F1-10, F0-13 | Batalha completa contra o Rato jogável com teclado |
| F1-14 | Tela de cesta (seleção, cesta padrão, perfil do inimigo) | M | F1-13 | Cesta respeita `basketSize`; padrão = última usada + reposição |
| F1-15 | Derrota: retorno ao `lastOvenId`; descanso no forno (`restAtOven`) | P | F1-11, F1-08 | Ciclo derrota → forno → nova tentativa sem erro |

### 4.4 Save

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F1-16 | `persistence`: `LocalSaveRepository`, escrita segura, checksum FNV-1a, backups, `migrations.ts`, fixture `v1.json` | M | F1-02 | Save corrompido vai para backup e não trava; testes da DATA_MODELS 7.2 |
| F1-17 | `SaveSystem`: gatilhos de autosave, fila de escrita, salvar manual no forno | M | F1-16, F1-03 | Fechar e reabrir a página restaura mapa, posição, inventário e missões |
| F1-18 | `TitleScene` mínima: Novo jogo (com nome) / Continuar | P | F1-17 | Continuar desabilitado sem save |

### 4.5 Conteúdo

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F1-19 | Conteúdo das etapas 1–2: Mestre, Lia, ingredientes iniciais, Margherita, Quatro Queijos, Rato de Despensa, recompensas, textos em `pt-BR.json` | M | F1-05, F1-08, F1-13 | Etapas 1 e 2 completas do início ao fim |
| F1-20 | Teste de simulação: "nível 1 com 2 Margheritas vence o Rato em ≥ 90% das sementes" | P | F1-10, F1-19 | Teste na CI |

### M1 — critérios de saída

- [ ] Novo jogo → primeira pizza → despensa → vitória contra o Rato → recompensa da etapa 2, sem bloqueios.
- [ ] Derrota e nova tentativa funcionam.
- [ ] Recompensas não duplicam com reload em nenhum ponto.
- [ ] Save restaura o estado após fechar a página.
- [ ] **Playtest interno** (2–3 pessoas): registrar tempo até a 1ª pizza e a 1ª vitória e onde houve dúvida.

---

## 5. Fase 2 — Identidade e demo completa [P1/P2]

**Objetivo:** todo o conteúdo da demo (GDD 15) e os sistemas que diferenciam o jogo.
**Saída:** M2 + playtest externo fechado.

### 5.1 Sistemas

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F2-01 | Habilidades no `core`: `learnSkill` e todos os `SkillEffect` aplicados em `cookPizza` (incluindo Harmonia, Toque Final, Borda Recheada, lote) | G | F1-07 | Teste para cada efeito; valores do GDD 6.1 |
| F2-02 | `convertIngredients` + interface de conversão no forno | M | F2-01 | Fermentação e Defumação funcionam e exigem a habilidade |
| F2-03 | Tela da árvore de habilidades (pré-requisitos, nível mínimo, custo, efeito antes de confirmar) | M | F2-01 | Pontos e pré-requisitos respeitados |
| F2-04 | Modificadores de cobertura completos e espaços de cobertura | M | F2-01 | Manjericão, Cogumelo, Linguiça, Pimenta-Dragão e Azeite conforme GDD 4.4 |
| F2-05 | Inimigos com fases, traços (Ágil, Resistente), ações especiais (Belisco, Preparando, Respiro) e cesta visível do rival | M | F1-10 | Testes por inimigo do GDD 8 |
| F2-06 | Coletas (`harvest`, únicas e renováveis), baús, placas, `visibleIf` | M | F1-05 | Coleta única nunca se repete; renovável volta ao descansar |
| F2-07 | Evento `takePizza` com filtro (entrega de pizza a NPC) | P | F1-09 | Lenhador aceita só pizza de qualidade ≥ 4 |
| F2-08 | Tela de missões e indicador de objetivo refinado | P | F1-05 | Principal e secundária listadas com etapa atual |

### 5.2 Conteúdo

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F2-09 | Mapas `map.vila`, `map.bosque`, `map.clareira` no Tiled (tilesets definitivos ou próximos disso) | G | F0-07 | Mapas validados; segredos posicionados (GDD 9.4) |
| F2-10 | Etapa 3: Guardiã Sálvia, Vespas-Pimenta, Fungos, acampamento com forno, Brasa | M | F2-05, F2-06, F2-09 | Etapa completável; ponte abre |
| F2-11 | Etapa 4: retorno ao Mestre, explicação das habilidades, ponto extra | P | F2-03 | — |
| F2-12 | Etapas 5–6: Ravena Fumê (2 fases), cena final, `endDemo`, resumo da partida | M | F2-05 | Demo termina com créditos e estatísticas |
| F2-13 | Missão secundária *Pedido do Lenhador* | P | F2-07 | Recompensa com Azeite e ponto de habilidade |
| F2-14 | Receita Defumada e Pimenta-Dragão secreta | P | F2-02, F2-09 | Acessíveis só pelos caminhos previstos |

### 5.3 Balanceamento e audiovisual

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F2-15 | Suíte de simulações de balanceamento (cada inimigo × cestas esperadas × níveis; Ravena em ≤ 3 tentativas no nível 4 com a cesta certa) | M | F2-05, F2-12 | Testes na CI; relatório de taxas de vitória |
| F2-16 | Substituição dos assets do tutorial (protagonista, NPCs, inimigos, tilesets, ícones de perfil e raridade) | G | F0-15 | Nenhum asset do tutorial no build; licenças registradas |
| F2-17 | `AudioManager`: música por mapa, batalha, efeitos por sinal; desbloqueio pela tela de título | M | F0-09 | Volumes separados funcionando |
| F2-18 | Efeitos de feedback: transição "tampa de forno", números de dano, tremor, brilho de coleta, subida de nível | M | F1-13 | Toda ação de batalha tem retorno visual e sonoro |

### M2 — critérios de saída

- [ ] *O Primeiro Desafio* completo do início ao fim, com todo o conteúdo do GDD 15.
- [ ] Nenhum bloqueio de progressão em nenhuma ordem razoável de ações (testar: pular a secundária, ignorar habilidades, perder para a Ravena 3×).
- [ ] Simulações de balanceamento verdes.
- [ ] Nenhum asset do tutorial restante.
- [ ] **Playtest externo fechado** (5–8 pessoas que não viram o tutorial), com as métricas do GDD 16. Ajustes de `balance.json` registrados.

---

## 6. Fase 3 — Polimento, testes e publicação [P2]

**Objetivo:** versão pública da demo.
**Saída:** M3.

| ID | Tarefa | Tam. | Depende de | Critério de aceite |
|---|---|:-:|---|---|
| F3-01 | Correções e ajustes a partir do playtest da M2 | G | M2 | Itens críticos do relatório resolvidos |
| F3-02 | Tela de título final, opções (velocidade do texto, volumes), créditos, tela de controles | M | F2-17 | Opções persistem em `Settings` |
| F3-03 | Gerenciar saves: 3 slots + automático, carregar e apagar com confirmação | M | F1-17 | — |
| F3-04 | Acessibilidade: ícones além de cor, `aria-live` nos diálogos, foco visível, sem informação só por som | M | F3-02 | Checklist do GDD 11.3 cumprido |
| F3-05 | `TEST_PLAN.md` + smoke e2e com Playwright (novo jogo, andar, diálogo, batalha, salvar, recarregar) | M | M2 | e2e na CI |
| F3-06 | Teste em navegadores-alvo (Chrome, Edge, Firefox) e resoluções; orçamento de desempenho (ARCHITECTURE 22) | M | F3-01 | Metas atingidas ou desvios registrados |
| F3-07 | Decidir hospedagem e configurar deploy automático da `main` | P | F3-06 | URL pública funcionando |
| F3-08 | Canal de feedback (formulário ou link) dentro do jogo e na página | P | F3-07 | — |
| F3-09 | Revisão final do `ASSETS_AND_LICENSES.md` e créditos | P | F2-16 | Todos os itens com licença compatível |
| F3-10 | Avaliar suporte mobile/touch (decisão, não implementação obrigatória) | P | F3-06 | Decisão registrada como ADR |

### M3 — critérios de saída (planejamento 5.1)

- [ ] Tela inicial e instruções de controles.
- [ ] Missão principal completável sem bloqueios ou erros críticos.
- [ ] Batalhas, itens, recompensas e salvamento funcionando.
- [ ] Feedback visual e sonoro suficiente.
- [ ] Desempenho aceitável nos navegadores-alvo.
- [ ] Reiniciar/continuar acessível.
- [ ] Créditos e licenças documentados.
- [ ] Publicada em URL pública com instruções e canal de feedback.

---

## 7. Fase 4 — Expansão orientada por feedback [P3]

Não detalhada em tarefas. As prioridades saem dos dados do playtest público. Direções já registradas:

- Novas regiões, receitas, ingredientes lendários e ramos Molho e Queijo (GDD 6.1, 17).
- Minigame de preparo, loja e moeda, redistribuição de habilidades (GDD 17).
- Equipe de personagens (ADR-005 já prepara o save).
- Mobile/touch e gamepad (`InputManager` já preparado).
- **Nuvem:** quando algum gatilho da ADR-001 for atingido → `DATABASE.md`, monorepo com Next.js + Supabase (ARCHITECTURE 23), `SupabaseSaveRepository`.

---

## 8. Caminho crítico

```text
F0-01 → F0-03 → F0-10 → F0-11 → F0-13 ──────────────────────┐
          F0-06 → F0-07 → F0-08 ──┘                          │
                                                              ▼
F1-01 → F1-04 → F1-07 → F1-10 → F1-13 → F1-19 ──▶ M1
                  │                        ▲
                  └→ F1-08 ────────────────┘
                                                              
F2-01 → F2-05 → F2-10 → F2-12 → F2-15 ──▶ M2 ──▶ F3-01 → F3-06 → F3-07 ──▶ M3
F2-09 (mapas) e F2-16 (assets) correm em paralelo desde o início da Fase 2
```

**Pode andar em paralelo** (útil se houver mais de uma pessoa ou para alternar tipo de trabalho):
- Arte e mapas (F0-15, F2-09, F2-16) em paralelo ao código desde a Fase 0.
- `persistence` (F1-16) em paralelo à batalha (F1-10).
- Áudio (F2-17) em qualquer momento após F0-09.

---

## 9. Documentação ao longo das fases

| Documento | Quando | Situação |
|---|---|---|
| `DECISOES_TECNICAS.md` | Contínuo | Ativo (ADR-001 a 007) |
| `GAME_DESIGN_DOCUMENT.md` | Atualizar após cada playtest | v0.1 |
| `DATA_MODELS.md` | Atualizar a cada mudança de contrato | v0.1 |
| `ARCHITECTURE.md` | Atualizar a cada mudança estrutural | v0.1 |
| `ROADMAP.md` | Revisar ao fim de cada marco | v0.1 |
| `ASSETS_AND_LICENSES.md` | F0-15, contínuo | A criar |
| `TEST_PLAN.md` | F3-05 (esboço já na Fase 1, se útil) | A criar |
| `DATABASE.md` | Fase 4, se a nuvem entrar em escopo | Futuro |
| `TECHNICAL_SPEC.md` | **Dispensado**: requisitos e critérios de aceite estão distribuídos entre GDD, DATA_MODELS, ARCHITECTURE e este roadmap | — |

---

## 10. Riscos por fase

| Fase | Risco | Sinal de alerta | Resposta |
|---|---|---|---|
| 0 | Fundação se estender demais (perfeccionismo de arquitetura) | Fase 0 com mais que o dobro do tempo da Fase 1 estimada | Cortar F0-14 e simplificar F0-07 (converter só o essencial) |
| 0 | Curva de TypeScript/Tiled | Tarefas P levando dias | Parear com tutoriais; manter `strict` mas permitir `// TODO(types)` pontuais |
| 1 | Batalha sem graça antes de existirem perfis e habilidades | Playtest interno chama a luta de "repetitiva" | Esperado nesta fase; registrar e reavaliar na M2, não antecipar sistemas |
| 2 | Arte atrasar o resto | Mapas prontos sem tilesets | Seguir com arte provisória; F2-16 não bloqueia o restante da M2 |
| 2 | Balanceamento frustrante no chefe | Playtest com > 3 tentativas médias | Ajustar `balance.json` e PV da Ravena; as simulações (F2-15) guiam |
| 3 | Escopo crescer com o feedback | Lista de pedidos vira tarefa da M3 | Só bloqueios e confusões entram na F3-01; o resto vai para a Fase 4 |

---

## 11. Próxima ação

F0-01, F0-02 e F0-03 concluídas (27/10/2026). Próxima: **F0-04** (resolução interna e escala inteira responsiva).
