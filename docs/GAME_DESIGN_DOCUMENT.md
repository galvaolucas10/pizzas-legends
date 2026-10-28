# Pizza Legends — Game Design Document (GDD)

> **Versão:** 0.1 (rascunho para demo vertical) · **Data:** 27/10/2026
> **Escopo:** demo *O Primeiro Desafio* (20–30 min). Conteúdo pós-demo aparece apenas como direção.
> **Documentos relacionados:** [`DECISOES_TECNICAS.md`](DECISOES_TECNICAS.md) · [`PLANEJAMENTO_TECNICO_PIZZA_LEGENDS.md`](PLANEJAMENTO_TECNICO_PIZZA_LEGENDS.md)

### Convenções deste documento

- **[Decidido]**: vem de uma ADR. Só muda com uma nova ADR.
- **[Proposta]**: decisão de design deste GDD. Pode mudar com revisão do GDD.
- **[Balancear]**: valor numérico inicial, a ajustar em playtest. Os números existem para que o jogo seja implementável e testável desde o início, não como valores finais.
- IDs entre crases (ex.: `ing.mussarela`) são os **IDs estáveis** usados em código, dados e saves (ADR-001, regra 3).

---

## 1. Visão geral

### 1.1 Resumo

*Pizza Legends* é um RPG 2D em pixel art para navegador. O jogador é um aprendiz de pizzaiolo que explora o mundo, coleta ingredientes, evolui suas habilidades culinárias e enfrenta criaturas e rivais em batalhas por turnos travadas **fatia a fatia**. Quanto mais o personagem evolui, melhores as pizzas que ele prepara, e melhores pizzas vencem desafios maiores.

### 1.2 Premissa (provisória)

Em um mundo onde as pizzas têm poder, os mestres pizzaiolos protegem vilas e receitas lendárias. O protagonista é o aprendiz mais novo do **Mestre Basílio**, na Vila do Forno. Para provar seu valor, precisa superar *O Primeiro Desafio*: enfrentar a rival **Ravena Fumê** na Clareira do Desafio.

### 1.3 Pilares de design

| Pilar | Na prática |
|---|---|
| **Evolução que se vê** | Cada habilidade nova muda as pizzas que o jogador consegue fazer, e o resultado aparece no preparo e na batalha. |
| **Batalhas legíveis e estratégicas** | Poucas regras, intenção do inimigo visível, decisões em três momentos: preparar, escolher a cesta, ordenar as fatias. |
| **Exploração com propósito** | Todo desvio no mapa pode render ingrediente, segredo ou atalho. |
| **Respeito ao tempo do jogador** | Sessões curtas, salvamento automático, derrota sem punição pesada, sem *grinding* obrigatório. |

### 1.4 Público e plataforma

- **Público:** jogadores casuais e fãs de RPG 2D, pixel art e progressão curta. Classificação livre.
- **Plataforma da demo:** navegadores desktop (Chrome, Edge, Firefox; versões atuais). Teclado obrigatório; gamepad e touch ficam para depois da demo.
- **Tom:** aventura leve com humor. Conflitos são duelos culinários, não violência real. Criaturas são "derrotadas" (fogem, desmaiam de sono, são domadas), nunca mortas.

### 1.5 Decisões fundadoras

| Tema | Decisão | Fonte |
|---|---|---|
| Persistência | Salvamento local, preparado para nuvem | ADR-001 |
| Stack | Canvas 2D com motor próprio; Next.js + Supabase depois | ADR-002 |
| Modelo de jogo | Ingredientes = recursos; habilidades = evolução do personagem; pizzas = itens de combate usados por fatias | ADR-004 |
| Protagonista | Um único personagem controlável | ADR-005 |

---

## 2. Loops de jogo

### 2.1 Loop macro (sessões e progressão)

```text
Nova região → missões → batalhas e coleta → sobe de nível → novas habilidades
     ↑                                                             ↓
     └──────── pizzas melhores vencem o desafio que abre a região ←┘
```

### 2.2 Loop médio (o ciclo de 3 a 5 minutos)

```text
Explorar mapa → coletar ingredientes / encontrar inimigo → batalhar
      ↑                                                         ↓
 escolher cesta ← preparar pizzas no forno ← receber XP e ingredientes
```

### 2.3 Loop micro (o turno de batalha)

```text
Ler a intenção do inimigo → escolher fatia (ou Defender) → ver o resultado → inimigo age
```

**Regra de ouro:** cada ciclo médio deve render pelo menos uma recompensa significativa: ingrediente novo, nível, habilidade, receita, acesso ou trecho de história.

---

## 3. O personagem (protagonista)

### 3.1 Identidade

- **ID:** `char.aprendiz`. Nome padrão: **Nico**, editável no início do jogo (máx. 12 caracteres). **[Proposta]**
- Visual neutro e autoral (substitui o `hero.png` do tutorial).

### 3.2 Atributos **[Balancear]**

| Atributo | Descrição | Valor inicial | Crescimento |
|---|---|---:|---|
| `nivel` | Nível do personagem | 1 | até 5 na demo |
| `xp` | Experiência acumulada | 0 | ver tabela 3.3 |
| `pvMax` | Pontos de vida máximos | 50 | +10 por nível |
| `pontosHabilidade` | Pontos disponíveis para a árvore | 0 | +1 por nível; recompensas de missão |
| `tamanhoCesta` | Pizzas levadas para a batalha | 4 | fixo na demo |

**Decisão de design:** o personagem cresce pouco em atributos próprios (só PV). **A maior parte do poder vem das pizzas**, como determina a ADR-004. O nível existe para dar pontos de habilidade e um pouco de resistência.

### 3.3 Curva de experiência **[Balancear]**

| Nível | XP acumulado necessário | PV máx. |
|---:|---:|---:|
| 1 (início) | 0 | 50 |
| 2 | 60 | 60 |
| 3 | 150 | 70 |
| 4 | 280 | 80 |
| 5 (máx. demo) | 450 | 90 |

PV aumentado em 28/10/2026 (era 40 + 8 por nível) após o playtest: as lutas puniam demais quem ainda está aprendendo os perfis.

Expectativa: o jogador termina a demo no nível 4 ou 5, com 4 a 6 pontos gastos.

### 3.4 Fontes de XP **[Balancear]**

| Fonte | XP |
|---|---:|
| Rato de Despensa | 15 |
| Vespa-Pimenta | 20 |
| Fungo Rabugento | 25 |
| Rival Ravena Fumê | 120 |
| Etapa de missão principal | 30–50 |
| Missão secundária | 60 |
| Primeiro preparo de cada receita | 10 |
| Encontrar um segredo | 15 |

---

## 4. Ingredientes

**[Decidido – ADR-004]** Ingredientes são recursos coletáveis, **consumidos** no preparo.

### 4.1 Categorias

Cada receita exige ingredientes por **categoria**:

| Categoria | Função na pizza |
|---|---|
| `massa` | Base obrigatória de toda pizza |
| `molho` | Define parte da identidade da receita |
| `queijo` | Define parte da identidade da receita |
| `cobertura` | Opcional; cada uma adiciona um **modificador** às fatias |

### 4.2 Raridade

| Raridade | Valor | Cor/ícone |
|---|---:|---|
| Comum | 1 | cinza / ● |
| Incomum | 2 | verde / ◆ |
| Raro | 3 | azul / ★ |
| Lendário | 4 | dourado / ✦ (pós-demo) |

Cor nunca é a única pista: cada raridade também tem um ícone (acessibilidade para daltonismo).

### 4.3 Perfis de sabor

Todo ingrediente e toda receita têm um **perfil**. Os perfis definem o tipo de ação das fatias e formam um ciclo de vantagens:

```text
        Fresco ──apaga──▶ Picante
          ▲                  │
       abafa               corta
          │                  ▼
       Defumado ◀─suaviza── Cremoso
```

| Perfil | Ícone | Vence | Sentido temático |
|---|---|---|---|
| **Picante** 🌶 | chama | Cremoso | o ardor corta a gordura |
| **Cremoso** 🧀 | gota | Defumado | a cremosidade suaviza a fumaça |
| **Defumado** 🔥 | nuvem | Fresco | a fumaça abafa o frescor |
| **Fresco** 🌿 | folha | Picante | o frescor apaga o ardor |

**Multiplicadores [Balancear]:** ataque com perfil que vence o perfil do alvo: **×1,5**; ataque contra alvo do **mesmo** perfil: **×0,75**; demais casos: ×1.

### 4.4 Ingredientes da demo **[Proposta]**

| ID | Nome | Categoria | Raridade | Perfil | Efeito como cobertura | Origem principal |
|---|---|---|---|---|---|---|
| `ing.farinha` | Farinha Simples | massa | Comum | — | — | Mestre, baús da vila |
| `ing.massa_fermentada` | Massa Fermentada | massa | Incomum | — | — | Habilidade *Fermentação Natural* |
| `ing.molho_tomate` | Molho de Tomate | molho | Comum | Fresco | — | Mestre, feirante |
| `ing.molho_apimentado` | Molho Apimentado | molho | Incomum | Picante | — | Guardiã Sálvia, Vespas |
| `ing.mussarela` | Mussarela | queijo | Comum | Cremoso | — | Mestre, feirante |
| `ing.queijo_cabra` | Queijo de Cabra | queijo | Incomum | Cremoso | — | Missão da despensa |
| `ing.queijo_defumado` | Queijo Defumado | queijo | Incomum | Defumado | — | Habilidade *Defumação* |
| `ing.manjericao` | Manjericão | cobertura | Comum | Fresco | +2 de cura por fatia | Coleta no bosque |
| `ing.cogumelo` | Cogumelo do Bosque | cobertura | Comum | Defumado | Aplica Enfraquecido por 1 turno (+1 turno se a pizza já aplica) | Coleta no bosque, Fungos |
| `ing.linguica` | Linguiça Curada | cobertura | Incomum | Defumado | +2 de dano por fatia | Baús, Ratos |
| `ing.pimenta_dragao` | Pimenta-Dragão | cobertura | Raro | Picante | Aplica Queimadura por 1 turno com +1 de dano (+1 turno e +1 de dano se a pizza já aplica) | Segredo do bosque |
| `ing.azeite_dourado` | Azeite Dourado | cobertura | Raro | — (neutro) | +1 de qualidade na pizza | Missão secundária |

**Regras:**
- Pilha máxima por ingrediente: **99**.
- Ingrediente sem perfil (—) é neutro: não conta para nem contra *Harmonia* (seção 6).

---

## 5. Receitas e preparo

### 5.1 Estrutura de uma receita

Cada receita define:
- **perfil** e **ação principal** (o que cada fatia faz);
- **ingredientes exigidos** por categoria (alguns exigem ingrediente específico);
- **qualidade base** e **fatias base**;
- número de **espaços de cobertura** (base 1);
- **como é desbloqueada**.

### 5.2 Receitas da demo **[Proposta]**

| ID | Receita | Perfil | Exige | Qual. base | Fatias base | Desbloqueio |
|---|---|---|---|---:|---:|---|
| `rec.margherita` | Margherita | Fresco | massa + `ing.molho_tomate` + `ing.mussarela` | 1 | 4 | Início do jogo (Mestre) |
| `rec.quatro_queijos` | Quatro Queijos | Cremoso | massa + 2 queijos diferentes | 2 | 3 | Missão principal, etapa 2 |
| `rec.brasa` | Brasa | Picante | massa + `ing.molho_apimentado` + `ing.mussarela` | 1 | 4 | Missão principal, etapa 3 |
| `rec.defumada` | Defumada | Defumado | massa + `ing.molho_tomate` + `ing.queijo_defumado` | 1 | 4 | Habilidade *Defumação* (opcional) |

As três primeiras estão garantidas no caminho principal. A **Defumada** é a recompensa de quem investe no ramo Forno.

### 5.3 Ação principal por perfil **[Balancear]**

`P` = **potência da fatia** (seção 5.4).

| Perfil | Ação de cada fatia |
|---|---|
| **Fresco** | Cura `0,6×P`, remove 1 efeito negativo e causa `0,7×P` de dano |
| **Cremoso** | Concede Escudo de `P` e causa `0,7×P` de dano |
| **Picante** | Causa `P` de dano e aplica Queimadura |
| **Defumado** | Causa `0,8×P` de dano e aplica Enfraquecido |

Os multiplicadores de perfil (4.3) se aplicam **só ao dano**. Valores fracionários são arredondados para baixo.

**Verificação de equilíbrio:** com P = 10, uma fatia Cremosa contra alvo Defumado causa `floor(7 × 1,5) = 10` de dano e ainda gera Escudo. Isso supera uma fatia Picante neutra (10, sem escudo). Assim, explorar a fraqueza vale mais que usar sempre a pizza de maior dano, e nenhum perfil domina os demais.

### 5.4 Fórmula de preparo **[Decidido – determinística (ADR-004); valores: Balancear]**

```text
prepararPizza(receita, ingredientes, habilidades) -> Pizza

mediaRaridade = média do valor de raridade dos ingredientes usados (inclui coberturas)
qualidade     = receita.qualidadeBase + floor(mediaRaridade) + bônusHabilidades + bônusCoberturas
fatias        = receita.fatiasBase + bônusHabilidadesFatias          (mín. 1, máx. 8)
P (potência)  = 4 + 2 × qualidade
```

Exemplos:

| Pizza | Ingredientes | Habilidades | Qualidade | Fatias | P |
|---|---|---|---:|---:|---:|
| Margherita inicial | todos comuns | nenhuma | 1+1 = **2** | 4 | 8 |
| Margherita + Manjericão | todos comuns | Sova Firme | **2** | 5 | 8 (+2 cura) |
| Brasa caprichada | massa fermentada (2), molho apimentado (2), mussarela (1), pimenta-dragão (3) → média 2 | Fogo Controlado | 1+2+1 = **4** | 4 | 12 |

**Pré-visualização obrigatória:** a interface de preparo mostra a pizza resultante (qualidade, fatias, P e efeitos) **antes** de o jogador confirmar e gastar ingredientes.

### 5.5 Onde se prepara

- **Fornos** são pontos fixos no mapa: forno do Mestre (Cozinha do Mestre) e forno de pedra (acampamento do Bosque).
- Funções do forno: **preparar pizzas**, **salvar manualmente** e **descansar** (faz os inimigos comuns reaparecerem; ver 9.3).
- Preparar não gasta tempo de jogo nem tem minigame na demo. Um minigame de preparo fica como ideia para depois.

### 5.6 A pizza como item

- Cada pizza preparada é uma **instância** com atributos já calculados (ADR-004): `receitaId`, `qualidade`, `P`, `fatiasMax`, `fatiasRestantes`, `modificadores`.
- Limite de **12 pizzas** no inventário. **[Balancear]**
- Pizzas **não estragam** na demo.
- Uma pizza com fatias restantes volta ao inventário depois da batalha como "pizza aberta", e pode ser levada de novo.
- Pizzas também servem fora da batalha: podem ser **entregues a NPCs** em missões (ver missão secundária, 10.3).

---

## 6. Habilidades culinárias

**[Decidido – ADR-004]** Habilidades pertencem ao personagem, são conquistadas ao evoluir e melhoram a produção de pizzas. Não são ataques.

### 6.1 Árvore da demo **[Proposta / Balancear]**

Três ramos com três níveis cada (9 habilidades). Os ramos **Molho** e **Queijo** ficam para depois da demo.

| Ramo | Nível 1 (custo 1) | Nível 2 (custo 1) | Nível 3 (custo 2, exige nível 4 do personagem) |
|---|---|---|---|
| **Massa** | **Sova Firme** `skill.sova_firme`: +1 fatia em todas as pizzas | **Fermentação Natural** `skill.fermentacao`: no forno, converte 2 Farinha → 1 Massa Fermentada | **Borda Recheada** `skill.borda_recheada`: a última fatia de cada pizza tem efeito ×1,5 |
| **Forno** | **Fogo Controlado** `skill.fogo_controlado`: +1 de qualidade em todas as pizzas | **Defumação** `skill.defumacao`: converte 1 Mussarela → 1 Queijo Defumado; desbloqueia a receita Defumada | **Forno a Lenha** `skill.forno_lenha`: permite preparar 2 pizzas da mesma receita de uma vez; a segunda não consome massa |
| **Coberturas** | **Mão Generosa** `skill.mao_generosa`: +1 espaço de cobertura | **Harmonia** `skill.harmonia`: +2 de qualidade se todos os ingredientes com perfil tiverem o perfil da receita | **Toque Final** `skill.toque_final`: cada cobertura aplica seu modificador com +50% de intensidade |

**Regras:**
- Para comprar o nível N de um ramo, é preciso ter o nível N−1 do mesmo ramo.
- **Pontos na demo:** 1 a cada nível ganho (do 2 ao 5, total 4) + 1 da etapa 4 da missão principal + 1 da missão secundária = **até 6 pontos**. A árvore completa custa 12, então o jogador **precisa escolher**.
- Redistribuir pontos ("esquecer receitas") é ideia para depois da demo. Na demo, as escolhas são definitivas, mas há pontos suficientes para cobrir os erros mais comuns.

### 6.2 Estilos que a árvore permite

| Estilo | Ramos | Sensação |
|---|---|---|
| Volume | Massa | Muitas fatias, lutas longas e seguras |
| Potência | Forno | Poucas fatias muito fortes, acesso à Defumada |
| Precisão | Coberturas | Pizzas ajustadas a cada inimigo |

---

## 7. Batalha

### 7.1 Visão geral

- **Por turnos, 1 contra 1** na demo (ADR-005).
- Transição: o mapa escurece em um efeito de "tampa de forno" e a tela de batalha aparece.
- **Regras unificadas:** toda ação, do jogador ou do inimigo, é uma `BattleAction` com a mesma estrutura (alvo, dano, cura, escudo, efeitos). As ações do jogador vêm de fatias. A rival também usa pizzas visíveis. Criaturas têm **ações naturais** com a mesma estrutura de dados. Isso cumpre o "mesmo sistema para os dois lados" da ADR-004.

### 7.2 Antes da batalha: a cesta

- Ao entrar em combate, o jogador confirma a **cesta**: até 4 pizzas do inventário.
- A cesta padrão é a última usada (com reposição automática pelas pizzas mais fortes disponíveis), para não interromper o ritmo. O jogador pode editar.
- O perfil do inimigo aparece já nessa tela, e escolher a cesta certa faz parte da estratégia.

### 7.3 Estrutura do turno

1. **Início do turno do jogador:** efeitos contínuos (ex.: Queimadura) são aplicados; o Escudo restante expira.
2. **O inimigo mostra sua intenção** (ícone + valor sobre a cabeça: atacar 6, enfraquecer, preparar golpe).
3. **O jogador escolhe uma ação:**
   - **Usar fatia** de uma pizza da cesta;
   - **Defender:** reduz em 50% o dano recebido neste turno e não gasta fatia;
   - **Improvisar** (só quando acabam todas as fatias): causa 3 de dano fixo;
   - **Fugir:** só contra inimigos comuns; sempre funciona.
4. **O inimigo executa** a intenção mostrada.
5. Verifica vitória ou derrota.

**Iniciativa:** o jogador age primeiro, exceto contra inimigos com o traço **Ágil**, que agem antes no primeiro turno.

### 7.4 Fórmula de dano **[Balancear]**

```text
dano = floor(valorBase × multiplicadorPerfil × modificadorEnfraquecido × modificadorDefender)
o Escudo absorve dano antes do PV
```

### 7.5 Efeitos de status

| Efeito | Regra | Acumula? |
|---|---|---|
| **Queimadura** | 2 de dano no início do turno do afetado, por 2 turnos | Não, renova a duração |
| **Enfraquecido** | Afetado causa −30% de dano, por 2 turnos | Não, renova a duração |
| **Escudo** | Absorve dano; expira no início do próximo turno de quem o recebeu | Soma, até no máximo 2×P |
| **Preparando** | Próxima ação do inimigo causa dano ×2 (sempre anunciado) | — |

Todos os efeitos aparecem com ícone e duração.

### 7.6 Vitória, derrota e recompensas

- **Vitória:** XP + ingredientes (tabela fixa + sorteio com semente salva, ADR-004). Recompensas de primeira vitória ou de missão são marcadas por flag e **nunca duplicam**.
- **Derrota:** o jogador volta ao último forno visitado com PV cheio. **Mantém** XP, ingredientes e progresso. **Perde** só as fatias que usou. O inimigo é restaurado. A derrota custa algum tempo e algumas pizzas, nunca o progresso.
- **Fora de batalha, o PV é restaurado por completo ao fim de cada luta.** O desgaste entre lutas vem do **consumo de pizzas**, não do PV. Isso simplifica a demo e mantém o foco no preparo.

---

## 8. Inimigos

### 8.1 Inimigos comuns da demo **[Proposta / Balancear]**

| ID | Nome | Perfil | PV | Traços | Padrão de ações (em ciclo) | Drops |
|---|---|---|---:|---|---|---|
| `enemy.rato_despensa` | Rato de Despensa | Fresco | 18 | Ágil | Mordida (4) → Mordida (4) → **Belisco** (rouba 1 fatia da pizza com mais fatias) | Linguiça (50%), Farinha (100%) |
| `enemy.vespa_pimenta` | Vespa-Pimenta | Picante | 22 | — | Ferroada (5 + Queimadura) → Zumbido (Preparando) → Ferroada (5 → 10) | Molho Apimentado (60%) |
| `enemy.fungo_rabugento` | Fungo Rabugento | Defumado | 26 | Resistente (−2 de dano recebido por golpe) | Esporos (Enfraquecido no jogador) → Pancada (6) → Pancada (6) | Cogumelo (100%), Cogumelo extra (40%) |

Leitura esperada pelo jogador:
- Rato (Fresco) é fraco contra **Defumado**: recompensa quem investiu no ramo Forno.
- Vespa (Picante) é fraca contra **Fresco**: a Margherita inicial funciona bem.
- Fungo (Defumado) é fraco contra **Cremoso**: ensina o uso da Quatro Queijos.

### 8.2 Chefe: Rival Ravena Fumê

- **ID:** `enemy.rival_ravena` · **PV:** 90 (duas fases de 45) · Não permite fuga.
- A rival usa **pizzas visíveis** (sua cesta aparece na interface), seguindo as regras unificadas.

| Fase | Perfil | Padrão | Fraqueza |
|---|---|---|---|
| **1 – Fumaça** (90→45 PV) | Defumado | Fatia de Fumaça (Enfraquecido) → Golpe de Pá (8) → Brasa Lenta (6 + Queimadura) | Cremoso |
| **Transição** | — | Em 45 PV: "Atiça o forno!" (turno perdido, aviso claro da mudança de perfil) | — |
| **2 – Labareda** (45→0 PV) | Picante | Labareda (10 + Queimadura) → Golpe de Pá (8) → Respiro (cura 8, uma única vez) | Fresco |

**Objetivo de design:** a luta testa se o jogador entendeu os perfis e montou a cesta com **Quatro Queijos e Margherita**. Com a cesta certa e nível 3–4, a vitória deve vir em 1 a 3 tentativas.

---

## 9. Mundo e exploração

### 9.1 Mapas da demo

| ID | Mapa | Tipo | Conteúdo |
|---|---|---|---|
| `map.cozinha_mestre` | Cozinha do Mestre | Interior | Início, forno do Mestre, tutorial (reaproveita a estrutura do `DemoRoom` atual) |
| `map.vila` | Vila do Forno | Região (hub) | Mestre Basílio, Feirante Lia, despensa, baús, saída para o bosque |
| `map.despensa` | Despensa da Lia | Interior | Primeira batalha (Ratos); reaproveita a estrutura do `Kitchen` atual |
| `map.bosque` | Bosque das Ervas | Região | Pontos de coleta, Vespas, Fungos, acampamento com forno, Guardiã Sálvia, Lenhador Bento, segredo |
| `map.clareira` | Clareira do Desafio | Região (arena) | Duelo contra Ravena Fumê |

Três regiões (Vila, Bosque, Clareira) + dois interiores, conforme a meta de 3 mapas da seção 5 do planejamento.

**Mapas implementados [versão provisória, com as imagens do tutorial]:**

| ID | Mapa | Imagem | Conteúdo |
|---|---|---|---|
| `map.vila` | Vila do Forno (Anchovy Avenue) | `Street` | Pizzaria do Mestre, mercadinho da Lia (SHOP), passagem para a praça, saída leste para o bosque; Erio e Dona Rita passeando |
| `map.salao` | Salão da Pizzaria do Mestre | `DiningRoom` | Mesas, bar, garçom Beto; porta do fundo para a cozinha |
| `map.cozinha_mestre` | Cozinha do Mestre | `DemoRoom` | Mestre Basílio; passagem do fundo para a despensa |
| `map.despensa` | Despensa da Lia | `Kitchen` | Saída pela seta no chão, para a avenida |
| `map.loja` | Mercadinho da Lia | `PizzaShop` | Feirante Lia no balcão |
| `map.praca` | Praça Neon | `StreetNorth` | Canteiros, Seu Tito passeando, entrada da Neon Greens |
| `map.estufa` | Neon Greens | `GreenKitchen` | Restaurante verde (sem NPC ainda) |
| `map.bosque` | Bosque das Ervas | arte autoral gerada | Sálvia, Bento, acampamento com forno |
| `map.clareira` | Clareira do Desafio | arte autoral gerada | Ravena Fumê |

```text
Cozinha ─porta de baixo─▶ Salão ─seta─▶ Avenida (Vila) ─SHOP─▶ Mercadinho da Lia
   │                       ▲              │  │  ▲
   └─passagem do fundo─▶ Despensa ─seta───┘  │  └──── Praça Neon ─porta─▶ Neon Greens
                                             │        (passagem do meio)
                                     borda leste
                                             ▼
                                   Bosque das Ervas ──ponte──▶ Clareira do Desafio
```

- Toda porta tem volta; nos interiores, a saída é a **seta no chão**.
- Poucos moradores andando por mapa (no máximo dois), para dar vida sem poluir.
- As imagens do tutorial continuam marcadas "a substituir" (`ASSETS_AND_LICENSES.md`). Bloqueios por missão (ponte) e segredos entram com as etapas (F2-10, F2-14).

### 9.2 Interações no mapa

- **Interagir** (tecla de ação) com o que estiver no quadrado à frente: NPC, baú, forno, ponto de coleta, placa.
- **Gatilhos de passagem:** portas e bordas de mapa levam a outros mapas, com ponto de entrada definido.
- **Pontos de coleta:** brilham levemente. Alguns são **únicos** (somem após a coleta, controlados por flag) e outros são **renováveis** (voltam ao descansar no forno).
- **Bloqueios leves:** NPCs ou obstáculos liberam o caminho conforme a missão avança (ex.: a ponte para a Clareira só abre depois da etapa 3).

### 9.3 Encontros

- **Inimigos visíveis no mapa**, sem encontros aleatórios. Eles patrulham com rotas simples (usando o `behaviorLoop` já existente no código) e a batalha começa ao encostar.
- Inimigos derrotados ficam fora do mapa até o jogador **descansar em um forno**. Assim, quem quiser juntar ingredientes pode, mas ninguém é obrigado a lutar de novo.
- Depois de uma fuga, o inimigo fica atordoado por 3 segundos, para o jogador se afastar.

### 9.4 Segredos

- **Pimenta-Dragão:** atrás de uma passagem escondida no Bosque, sugerida por uma placa ilegível e uma fileira de flores diferente.
- **Baú do sótão:** na Vila, acessível só depois de falar com uma criança NPC.

---

## 10. Missões e narrativa

### 10.1 Estados de missão

`indisponível → disponível → ativa → concluída → recompensada`

- Cada etapa tem **condições verificáveis** (flags, itens, vitórias) e **recompensas entregues uma única vez**.
- O HUD mostra sempre o **objetivo atual** em uma linha.

### 10.2 Missão principal: *O Primeiro Desafio* (`quest.primeiro_desafio`)

| Etapa | Objetivo | Ensina | Recompensa |
|---:|---|---|---|
| 1 | Acordar na Cozinha do Mestre e preparar a primeira Margherita | Movimento, interação, preparo | `rec.margherita`, ingredientes para 3 pizzas, 30 XP |
| 2 | Ajudar a Feirante Lia a expulsar os ratos da despensa | Batalha, cesta, intenção do inimigo | `rec.quatro_queijos`, Queijo de Cabra ×3, 40 XP |
| 3 | No Bosque, ajudar a Guardiã Sálvia contra o enxame de Vespas-Pimenta (3 vitórias) | Perfis e vantagem, coleta, forno do acampamento | `rec.brasa`, Molho Apimentado ×3, abertura da ponte, 50 XP |
| 4 | Voltar ao Mestre antes do duelo | Habilidades (o Mestre explica a árvore) | +1 ponto de habilidade, 30 XP |
| 5 | Vencer Ravena Fumê na Clareira | Leitura de fases, escolha da cesta | 120 XP (inimigo), fim da demo |
| 6 | Retornar à vila | Encerramento | Cena final, créditos, resumo da partida |

### 10.3 Missão secundária: *Pedido do Lenhador* (`quest.pedido_lenhador`)

- **NPC:** Lenhador Bento, no Bosque.
- **Pedido:** "Uma pizza de **qualidade 4 ou mais**, que eu tô com uma fome de lenhador!"
- **Ensina:** que habilidades e ingredientes melhores elevam a qualidade (Fogo Controlado, Harmonia, Azeite, ingredientes incomuns).
- **Recompensa:** Azeite Dourado ×2, +1 ponto de habilidade, 60 XP.
- A pizza é **entregue e consumida** (uso de pizza fora da batalha).

### 10.4 Personagens

| ID | Nome | Papel |
|---|---|---|
| `npc.mestre_basilio` | Mestre Basílio | Mentor, dá as receitas iniciais e explica as habilidades |
| `npc.feirante_lia` | Feirante Lia | Comércio da vila (troca ingredientes só pela história na demo), missão da despensa |
| `npc.guardia_salvia` | Guardiã Sálvia | Protetora do bosque, ensina a Brasa |
| `npc.lenhador_bento` | Lenhador Bento | Missão secundária |
| `npc.rival_ravena` | Ravena Fumê | Rival: confiante e teatral, respeita quem a vence |

Os nomes e o roteiro são **[Proposta]** e substituem por completo personagens e textos do tutorial.

### 10.5 Diálogos

- Caixa de texto com nome, retrato (pós-demo) e texto revelado letra a letra.
- Ação: completar o texto ou avançar. Velocidade configurável (lenta/normal/instantânea).
- Falas condicionais por estado de missão e flags (ex.: o Mestre diz coisas diferentes antes e depois do duelo).
- Escolhas de diálogo ficam fora da demo, exceto confirmações (sim/não).

---

## 11. Interface e controles

### 11.1 Controles da demo (teclado)

| Ação | Teclas |
|---|---|
| Mover | Setas / WASD |
| Interagir / confirmar | E · Enter · Espaço |
| Voltar / cancelar | Esc · Backspace |
| Menu | Tab · M |

Remapeamento de teclas, gamepad e touch ficam para depois da demo. Toda entrada passa pelo `InputManager` em forma de **ações** (`mover`, `confirmar`, `cancelar`, `menu`), nunca de teclas, para que esses recursos possam ser acrescentados sem refatoração.

### 11.2 Telas

| Tela | Conteúdo |
|---|---|
| Título | Novo jogo, Continuar, Opções, Créditos |
| HUD de exploração | PV, objetivo atual, indicador de salvamento automático |
| Menu | Mochila (ingredientes / pizzas), Habilidades, Missões, Opções, Salvar (só no forno) |
| Forno | Receitas conhecidas, seleção de ingredientes, **pré-visualização do resultado**, preparar |
| Cesta | Pizzas disponíveis, perfil do inimigo, confirmar |
| Batalha | PV dos dois lados, intenção do inimigo, efeitos ativos, cesta com fatias restantes, ações |
| Resultado | XP, nível, ingredientes obtidos |

### 11.3 Princípios de UX

- **Sempre mostrar o efeito antes de confirmar:** no preparo, nas habilidades e ao escolher uma fatia (dano previsto, já com o multiplicador de perfil).
- Ação inválida recebe um aviso curto e explica o motivo ("Falta Mussarela").
- Nenhuma informação depende só de cor.
- Nenhum tutorial em bloco de texto longo: cada mecânica é apresentada quando aparece pela primeira vez.

---

## 12. Salvamento (visão de design)

**[Decidido – ADR-001]** Local, versionado e preparado para nuvem. Detalhes técnicos no [`DATA_MODELS.md`](DATA_MODELS.md).

- **3 espaços de save** + 1 espaço de salvamento automático.
- **Salvamento automático:** ao trocar de mapa, ao fim de cada batalha e ao concluir uma etapa de missão.
- **Salvamento manual:** em qualquer forno.
- **Conteúdo do save:** personagem (dentro de `characters[]`, ADR-005), inventário (ingredientes e pizzas), receitas conhecidas, habilidades, missões, flags (coletas únicas, baús, segredos, recompensas recebidas), mapa e posição, semente de sorteio, opções do jogador, tempo de jogo e estatísticas.
- Recompensas de missão, baús e coletas únicas são controlados por **flag**, de modo que recarregar o save nunca as duplica.

---

## 13. Direção de arte e áudio

### 13.1 Arte

- Pixel art em grade de **16 px**. Personagens em quadros de **32×32** com 4 direções (padrão do `Sprite.js` atual).
- **Resolução interna [Decidida, F0-04]:** **384×216** (antes 352×198). A proporção continua 16:9, e a escala inteira ×5 preenche exatamente 1920×1080. Em outras telas, usa-se a maior escala inteira que couber, com bordas (ex.: ×3 = 1152×648 em 1366×768). A escala é calculada em pixels físicos, então o jogo continua nítido com o Windows em 125% ou 150%.
- **Medição (F0-04):** área da tela ocupada pelo jogo com escala inteira. "Janela" desconta ~120 px de navegador e barra de tarefas.

  | Tela | 352×198 | 384×216 |
  |---|---|---|
  | 1366×768, tela cheia | ×3, 60% | ×3, 71% |
  | 1366×768, janela | ×3, 71% | ×3, 84% |
  | 1920×1080, tela cheia | ×5, 84% | **×5, 100%** |
  | 1920×1080, janela | ×4, 61% | ×4, 72% |
  | 1920×1080 a 125%, janela | ×4, 62% | ×4, 74% |
  | 2560×1440, tela cheia | ×7, 93% | ×6, 81% |
  | 2560×1440, janela | ×6, 74% | ×6, 88% |
  | 2560×1440 a 150%, janela | ×6, 78% | ×5, 64% |

  A 384×216 ocupa mais a tela em 6 dos 8 casos, incluindo os mais comuns (1366×768 e 1920×1080), e mostra 24×13,5 tiles em vez de 22×12,4.
- Cada perfil tem uma cor e uma forma de ícone próprias, usadas de forma consistente em ingredientes, pizzas, inimigos e efeitos.
- **Todos os assets do tutorial serão substituídos** por assets autorais ou de licença compatível, registrados no `ASSETS_AND_LICENSES.md`.

### 13.2 Áudio

- Uma faixa por região, uma de batalha comum, uma do chefe e um tema de vitória.
- Efeitos para passos, interação, forno (preparar), cada perfil de ataque, cura, escudo, subir de nível e falha.
- Volume de música e de efeitos configuráveis separadamente.

---

## 14. Ritmo esperado da demo **[Balancear]**

| Minuto | Momento | Nível esperado |
|---:|---|---:|
| 0–3 | Cozinha do Mestre, primeira pizza | 1 |
| 3–8 | Vila, despensa, primeiras batalhas | 1→2 |
| 8–18 | Bosque: coleta, Vespas, Fungos, acampamento, missão secundária (opcional) | 2→3/4 |
| 18–22 | Volta ao Mestre, habilidades, preparo da cesta | 3–4 |
| 22–27 | Duelo contra Ravena (1–3 tentativas) | 4 |
| 27–30 | Encerramento e créditos | 4–5 |

---

## 15. Conteúdo da demo (resumo)

| Item | Quantidade |
|---|---:|
| Regiões + interiores | 3 + 2 |
| NPCs com diálogo | 5 (+ figurantes) |
| Receitas | 3 garantidas + 1 opcional |
| Ingredientes | 12 |
| Habilidades | 9 (3 ramos × 3 níveis) |
| Inimigos comuns | 3 |
| Chefe | 1 (2 fases) |
| Missões | 1 principal (6 etapas) + 1 secundária |
| Segredos | 2 |

### Fora do escopo da demo

Equipe e companheiros em combate, ramos Molho e Queijo, ingredientes lendários, economia/loja com moeda, minigame de preparo, redistribuição de habilidades, contas e saves na nuvem, ranking, multiplayer, mobile/touch, gamepad, remapeamento de teclas, monetização.

---

## 16. Métricas de playtest

Registradas localmente (estatísticas do save) e em observação direta:

- Tempo até a primeira pizza e até a primeira vitória.
- Porcentagem de jogadores que concluem a missão principal; onde abandonam.
- Tentativas contra a Ravena e composição da cesta usada.
- Uso de Defender e de Improvisar (se Improvisar aparece muito, faltam pizzas e o balanceamento precisa de ajuste).
- Habilidades escolhidas (há um ramo ignorado ou dominante?).
- Conclusão da missão secundária e descoberta dos segredos.
- Pergunta final: "Você jogaria a próxima região? Por quê?"

Sem telemetria remota na demo. Se houver no futuro, ela será opcional e respeitará a privacidade (planejamento, seção 9.2).

---

## 17. Questões em aberto

1. Nome definitivo do jogo, do protagonista e dos personagens.
2. ~~Resolução interna final (352×198 ou 384×216).~~ **Resolvida (13.1, F0-04):** 384×216.
3. Haverá moeda/loja depois da demo? Se sim, como evitar que ela substitua a exploração?
4. Formato do minigame de preparo (se houver) e se ele altera a qualidade.
5. Batalhas contra grupos e equipe após a demo: como a cesta funciona com vários personagens (ADR-005 prepara o save, não o design).
6. Pizzas lendárias: como se obtêm e o que as torna especiais além dos números.

---

## 18. Glossário

| Termo | Definição |
|---|---|
| **Cesta** | Conjunto de até 4 pizzas levadas para uma batalha |
| **Fatia** | Uma ação de batalha; cada pizza tem várias |
| **P (potência)** | Força de cada fatia, derivada da qualidade da pizza |
| **Perfil** | Picante, Cremoso, Defumado ou Fresco; define a ação e as vantagens |
| **Qualidade** | Nota da pizza calculada no preparo; determina P |
| **Forno** | Ponto do mapa para preparar, salvar e descansar |
| **Intenção** | Próxima ação do inimigo, sempre visível ao jogador |
| **Flag** | Marcador persistente de algo que já aconteceu (coleta, baú, recompensa) |
