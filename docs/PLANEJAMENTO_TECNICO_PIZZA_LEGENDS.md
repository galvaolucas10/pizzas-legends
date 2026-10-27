# Pizza Legends — Planejamento de Evolução e Base para Documentação Técnica

> **Status:** Documento inicial de planejamento (não é ainda uma especificação técnica definitiva).  
> **Data:** 27/10/2026  
> **Repositório:** https://github.com/galvaolucas10/pizzas-legends  
> **Referência didática:** https://www.youtube.com/watch?v=fyi4vfbKEeo&list=PLcjhmZ8oLT0r9dSiIK6RB_PuBWlG1KSq_&index=2  
> **Branch analisada:** `main`, conforme conteúdo consultado em 27/10/2026.

## 1. Objetivo deste documento

Transformar a implementação inicial de um tutorial de RPG 2D em uma proposta de jogo original, jogável e publicável na web. Este documento registra o diagnóstico do estado atual, a visão de produto, as mecânicas propostas, requisitos preliminares, a arquitetura de referência, riscos e prioridades. Deve servir de base para uma futura documentação técnica detalhada (`GAME_DESIGN_DOCUMENT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DATABASE.md` quando pertinente).

**Princípio:** construir primeiro uma demo vertical de aproximadamente 20–30 minutos, testar com jogadores e expandir apenas após validar o núcleo da experiência.

## 2. Estado atual do projeto — diagnóstico do repositório

### 2.1 Stack atual

- JavaScript puro, HTML e CSS.
- Renderização em **Canvas 2D** com resolução interna de **352 × 198 pixels**.
- Sprites e mapas em PNG, pixel art e grade lógica de 16 px.
- Código orientado a objetos, organizado em scripts globais carregados por `index.html`.
- Ainda não há `package.json`, infraestrutura de backend, banco de dados, testes automatizados ou pipeline de build no repositório analisado.

### 2.2 Arquivos existentes e responsabilidades

| Arquivo | Função observada |
|---|---|
| `index.html` | Canvas e carregamento dos scripts |
| `init.js` | Inicialização do `Overworld` |
| `Overworld.js` | Loop de atualização/desenho, inicialização do mapa e controles |
| `OverworldMap.js` | Definição de mapas, objetos, paredes e desenho de camadas |
| `GameObject.js` | Entidade base, montagem e tentativa de execução de comportamentos |
| `Person.js` | Movimento em grade, colisões, direção e animação |
| `Sprite.js` | Carregamento/desenho de sprites, sombras e quadros de animação |
| `Directionput.js` | Leitura das setas e WASD via `DirectionInput` |
| `utils.js` | Conversão de coordenadas e posição adjacente |
| `styles.css` | Layout e escala fixa do Canvas |
| `images/` | Cenários, protagonista, NPCs e sombras |

### 2.3 Funcionalidades identificadas

| Recurso | Status do código | Observação |
|---|---|---|
| Desenho em Canvas | Implementado | Há loop de renderização |
| Camadas inferior/superior do cenário | Implementado | `lowerImage` e `upperImage` |
| Movimento por setas/WASD | Implementado | Controle via `DirectionInput` |
| Movimento em grade e colisões | Base implementada | Verificar em testes reais |
| Câmera seguindo protagonista | Implementado | Deslocamento relativo ao `hero` |
| Sprites e animações direcionais | Implementado | Dependem de atualização por frame |
| NPCs e ciclos de comportamento | Incompleto | Dependem de sistema de eventos ausente |
| Segundo mapa (`Kitchen`) | Configurado parcialmente | Sem transição e com coordenadas inconsistentes |
| Diálogo/interação | Não implementado | Planejado |
| Batalhas | Não implementado | Planejado |
| Inventário/receitas/missões | Não implementado | Planejado |
| Salvamento | Não implementado | Planejado |
| Suporte a celular | Não implementado | Planejado |
| Autenticação, ranking e nuvem | Não implementado | Opcional para etapa futura |

**Importante:** o diagnóstico é de **leitura estática do código**, sem homologação da execução no navegador. “Implementado” significa que o código correspondente existe, não que tenha sido testado integralmente.

### 2.4 Problemas técnicos prioritários

**P0 — Fluxo de comportamento dos objetos pode causar erro:**

- `GameObject.mount()` dispara `doBehaviorEvent()` para todos os objetos após um `setTimeout`, inclusive objetos cujo `behaviorLoop` está vazio.
- `doBehaviorEvent()` tenta executar `eventConfig.who = this.id`; se não houver comportamento, `eventConfig` é `undefined`.
- A classe `OverworldEvent` é instanciada, mas não existe definição nem import no repositório analisado.
- **Ação:** criar um sistema de eventos ou, temporariamente, condicionar a chamada à existência de comportamentos válidos; definir execução, conclusão e repetição do loop de NPCs.

**P0/P1 — Regularidade da execução:**

- Movimento e duração das animações estão vinculados ao número de frames e, portanto, podem variar conforme o FPS do dispositivo.
- **Ação:** adotar um `GameLoop` com passo fixo ou atualização por `deltaTime`, mantendo velocidade estável e renderização desacoplada.

**P1 — Assets e mapa:**

- `OverworldMap.drawLowerImage()` e `drawUpperImage()` usam `drawImage()` sem verificação explícita de carregamento.
- O mapa `Kitchen` define posições numéricas como `x: 3`, enquanto `DemoRoom` utiliza `utils.withGrid()`.
- `Overworld.init()` inicializa apenas `DemoRoom`; não há sistema de transição funcional.
- **Ação:** tratamento de `onload`/`decode`, padronização de coordenadas, `WorldManager` e gatilhos de transição.

**P1 — Interface e manutenção:**

- CSS aplica `transform: scale(3)` fixo: pouco adaptável a diferentes telas.
- Scripts são carregados no escopo global; isso dificulta modularidade e testes conforme o projeto cresce.
- **Ação:** introduzir módulos ES, organização de assets e controles responsivos de maneira incremental.

### 2.5 Critérios de encerramento da fase de estabilização

- [ ] Aplicação abre sem erros no console.
- [ ] Protagonista anda nas quatro direções e respeita paredes.
- [ ] NPCs parados e com comportamento funcionam sem interrupções.
- [ ] Movimento mantém velocidade coerente em FPS diferentes.
- [ ] Carregamento dos mapas não causa erro de renderização.
- [ ] Transições entre `DemoRoom` e `Kitchen` funcionam e preservam controle do protagonista.
- [ ] Ao menos um NPC pode ser abordado para abrir e fechar diálogo.

## 3. Visão de produto

### 3.1 Conceito provisório

**Nome de trabalho:** *Pizza Legends: A Jornada dos Mestres*.

**Premissa:** o protagonista é aprendiz em um mundo de mestres pizzaiolos, receitas lendárias, ingredientes raros e rivais. Explora regiões, ajuda personagens, coleta ingredientes, aprende receitas e participa de batalhas estratégicas para conquistar o título de Mestre Lendário.

Este universo e seu enredo são **propostas**, ainda não decisões finais. Antes de produzir arte final, nomes, personagens ou narrativa, definir uma identidade que diferencie a obra do tutorial e verificar direitos de uso dos assets.

### 3.2 Público e plataforma

- Público inicial: jogadores casuais que gostam de RPGs 2D, pixel art, exploração e progressão curta.
- Plataforma inicial: navegadores desktop.
- Plataforma posterior: navegador mobile, com botões/touch e UI adaptada.
- Modelo inicial: demo gratuita compartilhável por link.

### 3.3 Pilares de design

1. **Exploração recompensadora:** cada cenário pode oferecer rotas, segredos ou desafios.
2. **Batalhas compreensíveis, mas estratégicas:** poucas mecânicas inicialmente, com escolhas significativas.
3. **Receitas com função no jogo:** ingredientes e pizzas interferem em combate e progressão.
4. **Evolução perceptível:** jogadores desbloqueiam possibilidades, não apenas números maiores.
5. **Sessões curtas e conclusão clara:** a demo deve ter começo, meio e fim.
6. **Retenção saudável:** curiosidade, domínio e conteúdo, sem pressão artificial ou loops compulsivos.

### 3.4 Loop central

`Explorar -> encontrar NPCs/desafios -> batalhar ou completar missões -> coletar recursos -> preparar/desbloquear receitas -> fortalecer a equipe -> acessar novas áreas -> explorar`.

Cada ciclo deve conceder ao menos um destes resultados: descoberta narrativa, recurso significativo, habilidade, receita, acesso ou desafio superado.

## 4. Mecânicas planejadas

### 4.1 Exploração e mundo

- Mapa inicial de vila, região de floresta e área de chefe (escopo demo).
- Transição entre ambientes e pontos de entrada.
- Colisão com obstáculos, NPCs e objetos.
- Baús, itens coletáveis e pelo menos um segredo opcional.
- Bloqueios leves baseados na progressão da missão.

**Aceitação demo:** o jogador percorre três mapas, coleta um recurso e encontra a arena do chefe sem ficar bloqueado.

### 4.2 Diálogos e interações

- Tecla de interação com NPC/objeto adjacente.
- Caixa de texto com nome, falas sequenciais e opção de fechar.
- Eventos ativados por aproximação, interação e conclusão de missão.
- Regras simples condicionais para falas diferentes após a missão.

**Aceitação demo:** um NPC apresenta objetivo; após cumpri-lo, entrega recompensa com diálogo alterado.

### 4.3 Batalhas por turnos

- Encontro com inimigos e transição para tela de combate.
- Ações iniciais: ataque, habilidade e item.
- Vida, dano, defesa ou efeito simplificado e condição de vitória/derrota.
- Ao menos três tipos de inimigos, cada qual com padrão reconhecível, e um chefe.
- Vitória concede recursos/experiência; derrota permite tentar novamente sem perder o progresso já salvo.

**Aceitação demo:** o jogador vence ou perde uma batalha sem quebrar o estado do mapa, recebe recompensa corretamente e consegue enfrentar o chefe.

### 4.4 Receitas e fabricação (*crafting*)

- Ingredientes obtidos por exploração e recompensas.
- Receitas compostas por combinação explícita de ingredientes.
- Cada receita produz item/habilidade com efeito compreensível.
- Quatro a seis receitas no protótipo; apenas três são necessárias na demo.
- Exemplos **ilustrativos, sujeitos a balanceamento**:
  - **Margherita (comum):** ataque básico e recuperação leve.
  - **Infernal (rara):** dano de fogo e chance de queimadura.
  - **Quatro Queijos (épica):** cura e escudo.
  - **Cósmica (lendária):** dano/efeito em área, para conteúdo posterior.

> **Superado:** estes exemplos são anteriores à ADR-004. As receitas da demo, com perfis de sabor e qualidade calculada no preparo, estão no [`GAME_DESIGN_DOCUMENT.md`](GAME_DESIGN_DOCUMENT.md), seção 5.2.

**Aceitação demo:** jogador coleta um ingrediente, descobre/prepara uma receita e percebe seu efeito em combate.

### 4.5 Missões e narrativa

- Uma missão principal: receber orientação do mestre, explorar, reunir recurso, enfrentar rival e voltar.
- Uma missão secundária opcional com recompensa específica.
- Estado de missão: `available`, `active`, `completed`, `claimed`, conforme necessidade.
- Indicador simples de objetivo atual e feedback de conclusão.

**Aceitação demo:** missão não pode duplicar recompensas nem avançar sem cumprir condições.

### 4.6 Inventário e progressão

- Inventário com quantidade de ingredientes e consumíveis.
- Experiência/nível ou desbloqueio de habilidades (escolher modelo na especificação final).
- Progressão dos efeitos das receitas e abertura de novas áreas.
- Interface simples com recursos, objetivo e estado de combate.

**Aceitação demo:** recursos persistem entre mapas, são gastos corretamente e constam no salvamento.

### 4.7 Salvamento

- Inicialmente via armazenamento local do navegador (por exemplo, `localStorage`, com serialização/versionamento e validação dos dados).
- Salvar: localização, mapa, estado de missões, inventário, progressão e flags relevantes.
- Restaurar estado consistente; criar estratégia de migração caso o formato mude.
- Em etapa posterior: Supabase para sincronizar saves entre dispositivos, caso haja contas.

**Aceitação demo:** fechar/reabrir a página mantém progresso e não duplica recompensas.

### 4.8 Conquistas e conteúdo posterior

- Coleção de receitas, chefes secretos e desafios opcionais.
- Conquistas locais na primeira expansão; eventual ranking apenas quando houver valor real para o jogo.
- Evitar desenvolver rankings, multiplayer ou economia sofisticada antes da demo validada.

## 5. Escopo da demo vertical

**Nome de trabalho:** *O Primeiro Desafio*.

**Duração-alvo:** 20–30 minutos (hipótese a validar com jogadores).

| Conteúdo | Meta |
|---|---:|
| Regiões/mapas | 3 |
| NPCs | 5 |
| Receitas utilizáveis | 3 |
| Tipos de inimigos comuns | 3 |
| Chefe | 1 |
| Missão principal | 1 |
| Missão secundária | 1 |
| Salvamento local | 1 fluxo testado |

**Roteiro proposto:** iniciar na vila → conversar com mestre → obter primeira receita → explorar floresta → enfrentar inimigos → descobrir ingrediente → aprimorar/preparar receita → derrotar rival → retornar à vila e encerrar demo.

**Fora do escopo da primeira demo:** multiplayer, ranking global, economia online, dezenas de receitas, mapa aberto extenso, autenticação obrigatória e monetização.

### 5.1 Critérios gerais de lançamento da demo

- [ ] Possui tela inicial e instruções de controles.
- [ ] Jogador completa toda a missão principal sem bloqueios ou erros críticos.
- [ ] Batalhas, itens, recompensas e salvamento funcionam.
- [ ] Há efeitos visuais e sonoros suficientes para dar feedback.
- [ ] Desempenho é aceitável nos navegadores desktop definidos para suporte.
- [ ] Há mecanismo acessível de reiniciar/continuar.
- [ ] Créditos e licenças dos assets utilizados estão documentados.
- [ ] A demo está publicada em URL pública com instruções e canal de feedback.

## 6. Arquitetura técnica de referência

### 6.1 Estratégia de evolução

**Curto prazo:** manter JavaScript + Canvas 2D e organizar progressivamente os arquivos existentes em módulos. Não introduzir um framework só para resolver funcionalidades básicas de engine.

**Quando houver necessidade real de site/contas/saves na nuvem:** priorizar **Next.js na versão estável vigente** para o contêiner web e **Supabase** para autenticação, dados e sincronização. O motor do jogo deve permanecer desacoplado da camada React/Next.js.

~~**Decisão pendente:** manter engine própria ou migrar a uma engine web como Phaser.~~ **Resolvida (ADR-002):** Canvas 2D com motor próprio.

### 6.2 Árvore sugerida

```text
pizzas-legends/
├── public/
│   ├── sprites/
│   ├── maps/
│   ├── audio/
│   └── ui/
├── src/
│   ├── engine/
│   │   ├── GameLoop.js
│   │   ├── InputManager.js
│   │   ├── Camera.js
│   │   ├── Sprite.js
│   │   └── CollisionSystem.js
│   ├── world/
│   │   ├── WorldManager.js
│   │   ├── GameMap.js
│   │   └── MapTransition.js
│   ├── entities/
│   │   ├── GameObject.js
│   │   ├── Player.js
│   │   └── NPC.js
│   ├── systems/
│   │   ├── EventSystem.js
│   │   ├── DialogueSystem.js
│   │   ├── QuestSystem.js
│   │   ├── BattleSystem.js
│   │   ├── InventorySystem.js
│   │   ├── CraftingSystem.js
│   │   └── SaveSystem.js
│   ├── data/
│   │   ├── maps/
│   │   ├── characters/
│   │   ├── recipes/
│   │   └── quests/
│   └── main.js
├── index.html
└── package.json
```

A árvore representa um **estado futuro**, não os arquivos que existem hoje. **Superada** pela estrutura de diretórios do [`ARCHITECTURE.md`](ARCHITECTURE.md), seção 4. No cenário Next.js, o projeto será adaptado à convenção `app/` e componentes client-side para o jogo.

### 6.3 Limites entre componentes

| Componente | Responsabilidade | Não deve assumir |
|---|---|---|
| `GameLoop` | Temporização e atualização | Regras específicas de missão |
| `InputManager` | Teclado/touch e ações | Manipular inventário diretamente |
| `WorldManager` | Mapa ativo e transições | UI de batalha |
| `EventSystem` | Sequência de eventos/cutscenes | Regras de persistência remota |
| `BattleSystem` | Estados, turnos, resultados | Desenhar o mapa principal |
| `QuestSystem` | Objetivos, condições e recompensas | Controlar o loop principal |
| `CraftingSystem` | Validação das receitas/ingredientes | Renderização de animações |
| `SaveSystem` | Serialização e restauração | Lógica de vitória/derrota |

### 6.4 Regras de engenharia

- Distinguir **estado do jogo** de **renderização**.
- Modelar mapas, NPCs, missões e receitas como dados configuráveis sempre que viável.
- Definir IDs estáveis para entidades, mapas, itens e missões.
- Manter interfaces entre sistemas simples e explicitamente documentadas.
- Adicionar testes de regras puras (inventário, dano, crafting, missões, serialização) conforme cada sistema for criado.
- Não usar `setTimeout` isolados como mecanismo central de controle dos eventos sem política de cancelamento, retomada e mudanças de mapa.
- Revisar restrições de segurança e autorização antes de permitir sincronização de dados do jogador na nuvem.

## 7. Roadmap por fases

### Fase 0 — Estabilizar o projeto existente [P0]

1. Corrigir falha do `behaviorLoop` e implementar eventos/ações dos NPCs.
2. Corrigir ou validar fluxo de colisão, imagens e coordenadas.
3. Introduzir gerenciamento confiável do tempo de atualização.
4. Fazer transições de mapas.
5. Criar uma primeira interação/diálogo.

**Marco:** motor básico explorável sem erros críticos.

### Fase 1 — Primeira aventura jogável [P1]

1. Criar uma missão curta com começo e fim.
2. Implementar batalha por turnos mínima.
3. Adicionar três inimigos e um chefe.
4. Criar inventário simples e recompensas.
5. Implementar salvamento local.

**Marco:** demo funcional, mesmo com arte provisória.

### Fase 2 — Identidade própria [P1/P2]

1. Criar sistema de ingredientes e receitas.
2. Integrar efeitos das receitas às batalhas.
3. Adicionar progressão e uma missão opcional.
4. Melhorar feedback visual, música e efeitos sonoros.
5. Polir as três regiões da demo e o equilíbrio das batalhas.

**Marco:** experiência diferenciada do tutorial.

### Fase 3 — Testes e publicação [P2]

1. Criar tela inicial, instruções, configurações mínimas e créditos.
2. Testar controles, UX, desempenho e salvamento em navegadores-alvo.
3. Avaliar suporte mobile; implementar se couber no escopo.
4. Preparar build/hospedagem e publicar link público.
5. Obter feedback dos primeiros jogadores, corrigir bloqueios e medir conclusão.

**Marco:** versão pública de demonstração.

### Fase 4 — Expansão orientada por feedback [P3]

- Novas regiões, personagens, receitas e eventos.
- Conquistas e catálogo de receitas.
- Next.js + Supabase para perfis, saves na nuvem e rankings **apenas quando justificados**.
- Estudar mecanismos de distribuição, analytics respeitosos à privacidade e comunidade de jogadores.

## 8. Priorização consolidada

| Prioridade | Entrega | Justificativa |
|---|---|---|
| P0 | Estabilidade do motor e eventos | Bloqueia o jogo atual |
| P0 | Movimento, colisões e temporização | Qualidade da experiência fundamental |
| P0 | Diálogo/interação e transição de mapas | Base para exploração e missões |
| P1 | Batalha por turnos | Desafio e tomada de decisão |
| P1 | Missões e recompensas | Propósito da exploração |
| P1 | Receitas e habilidades | Principal diferencial proposto |
| P1 | Inventário e salvamento | Continuidade da progressão |
| P2 | Polimento audiovisual/UI | Clareza e sensação de qualidade |
| P2 | Responsividade e touch | Alcance do público mobile |
| P3 | Contas, ranking e infraestrutura remota | Expandir após validação |

## 9. Qualidade, testes e validação do jogo

### 9.1 Checklist técnico mínimo

- [ ] Sem exceções JavaScript durante uma partida completa.
- [ ] Nenhuma transição deixa NPCs/paredes em estado inválido.
- [ ] Não há duplicação de itens ou recompensas.
- [ ] Inventário não permite quantidades negativas.
- [ ] Salvamento restaura estado válido mesmo após reload.
- [ ] UI informa claramente ação inválida, vitória, derrota e objetivo.
- [ ] Assets carregam sem erros e com créditos quando necessários.

### 9.2 Observações com jogadores

Realizar sessões de teste com pessoas que **não viram o tutorial**. Registrar:

- Tempo até entender movimentação e objetivo inicial.
- Onde jogadores ficam perdidos ou abandonam a demo.
- Quantas tentativas levam para vencer o chefe.
- Se o sistema de receitas é compreendido e utilizado.
- Percentual que conclui a missão principal.
- Se desejam jogar outra fase e por qual motivo.

Não adicionar mecânicas de retenção baseadas em fricção artificial, pressão para voltar ou recompensas manipulativas. Buscar engajamento por variedade, autonomia, descoberta e domínio.

## 10. Riscos, dependências e decisões em aberto

| Questão | Risco | Encaminhamento |
|---|---|---|
| Crescimento de escopo | Demo nunca ser concluída | Proteger escopo da seção 5 |
| Recriar tutorial sem identidade | Baixa diferenciação | Definir narrativa/receitas próprias |
| Reescrever toda a engine cedo | Retrabalho | Refatorar em incrementos verificáveis |
| Assets e músicas de terceiros | Problemas de licença/distribuição | Inventariar origem e permissões de cada asset |
| Balanceamento de combate | Lutas monótonas/frustrantes | Testes com poucas habilidades |
| Estado do jogo acoplado à UI | Bugs no salvamento e transições | Separar sistemas e dados |
| Ranking/saves online | Fraude e custos | Planejar validação no servidor, RLS e limites se implementados |
| Mobile antecipado | Escopo e UX complexos | Validar desktop primeiro |

### Decisões pendentes para a especificação técnica

> Decisões já tomadas estão registradas em [`DECISOES_TECNICAS.md`](DECISOES_TECNICAS.md):
> salvamento local primeiro, preparado para nuvem (ADR-001); Canvas 2D com motor próprio + Next.js/Supabase (ADR-002);
> modelo de jogo com ingredientes como recursos, habilidades culinárias do personagem e batalha por fatias de pizza (ADR-004, que substitui a ADR-003);
> protagonista único (ADR-005); Vite + TypeScript, Vitest e Zod (ADR-006); mapas no Tiled (ADR-007).
> Decisões de design estão no [`GAME_DESIGN_DOCUMENT.md`](GAME_DESIGN_DOCUMENT.md).

1. ~~O protagonista controla apenas um personagem ou uma equipe?~~ **Resolvida (ADR-005):** um único personagem.
2. ~~As pizzas são **combatentes**, **habilidades** ou **itens consumíveis**?~~ **Resolvida (ADR-004):** o personagem evolui e conquista habilidades culinárias; ingredientes são recursos consumidos no preparo; pizzas são itens de combate usados fatia a fatia.
3. ~~Combate será sempre por turnos, com quais atributos e regras de iniciativa?~~ **Resolvida (GDD 7):** por turnos, 1 contra 1; o jogador age primeiro, exceto contra inimigos com o traço Ágil.
4. ~~Como ganhar ingredientes e como funcionam receitas repetidas?~~ **Resolvida (GDD 4 e 5):** ingredientes vêm de coleta, baús, drops e missões; cada preparo consome ingredientes e gera uma nova pizza, sem limite de repetição.
5. ~~Haverá nível/XP, desbloqueio de habilidades, ou ambos?~~ **Resolvida (GDD 3 e 6):** ambos. O nível dá PV e pontos para a árvore de habilidades.
6. ~~Qual estilo narrativo (humor, fantasia, aventura) e qual classificação etária desejada?~~ **Resolvida (GDD 1.4):** aventura leve com humor, classificação livre.
7. ~~Quais navegadores e tamanhos de tela terão suporte oficial na demo?~~ **Resolvida (GDD 1.4 e 13.1):** Chrome, Edge e Firefox desktop, com escala inteira responsiva. A resolução interna final é 384×216 (decidida na F0-04).
8. ~~A primeira release usará apenas JavaScript ou já terá build tool (ex.: Vite)?~~ **Resolvida (ADR-006):** Vite + TypeScript, Vitest e Zod.
9. ~~Quais elementos do tutorial serão mantidos, adaptados ou substituídos por materiais autorais?~~ **Resolvida (GDD 9.1, 10.4 e 13.1):** todos os assets, personagens e textos do tutorial serão substituídos; só a estrutura dos mapas `DemoRoom` e `Kitchen` é reaproveitada.
10. ~~Em que momento vale integrar Next.js e Supabase?~~ **Resolvida (ADR-001/ADR-002):** stack definida; a integração ocorre quando algum gatilho da ADR-001 entrar no escopo.

## 11. Documentos técnicos a elaborar depois

| Documento | Conteúdo esperado | Situação |
|---|---|---|
| `GAME_DESIGN_DOCUMENT.md` | Mecânicas, loop, mundo, personagens, balanceamento, UX e progressão | Criado (v0.1) |
| `ARCHITECTURE.md` | Componentes, ciclo de vida, estados, eventos, contratos e diagramas | Criado (v0.1) |
| `TECHNICAL_SPEC.md` | Requisitos funcionais/não funcionais e critérios de aceite | **Dispensado:** coberto por GDD, DATA_MODELS, ARCHITECTURE e ROADMAP |
| `DATA_MODELS.md` | Esquemas de mapas, personagens, missões, receitas e saves | Criado (v0.1) |
| `ROADMAP.md` | Marcos, entregas, dependências e checklists de desenvolvimento | Criado (v0.1) |
| `ASSETS_AND_LICENSES.md` | Fonte, licença, autoria e substituições de cada recurso | Criado (F0-15) |
| `TEST_PLAN.md` | Testes unitários, integração, regressão e playtest | A criar (F3-05) |
| `DATABASE.md` | **Somente quando Supabase entrar em escopo:** tabelas, RLS, políticas, sincronização | Futuro |

## 12. Próxima ação recomendada

> **Superada pelo [`ROADMAP.md`](ROADMAP.md):** a ordem de trabalho oficial agora é a do roadmap (Fase 0, começando pela F0-01). A lista abaixo fica como registro.

Antes de ampliar conteúdo ou migrar stack:

1. Criar branch de estabilização.
2. Implementar/corrigir sistema de eventos e `behaviorLoop`.
3. Adicionar teste manual de movimento/colisões/NPCs.
4. Implementar transição `DemoRoom <-> Kitchen`.
5. Implementar diálogo mínimo.
6. Só então especificar e construir a primeira batalha.

**Definição de pronto para iniciar a demo:** o protagonista se movimenta, interage com NPCs, atravessa dois ambientes, e o jogo executa sem erros críticos.

---

### Fontes de referência

- Repositório consultado: https://github.com/galvaolucas10/pizzas-legends
- Tutorial informado: https://www.youtube.com/watch?v=fyi4vfbKEeo&list=PLcjhmZ8oLT0r9dSiIK6RB_PuBWlG1KSq_&index=2

> Este planejamento deve ser revisado após as primeiras correções e playtests. Funcionalidades não implementadas são **propostas**, não descrições do estado real do projeto.
