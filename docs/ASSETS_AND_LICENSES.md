# Pizza Legends — Assets e licenças

> **Versão:** 0.1 · **Data:** 27/10/2026
> **Base:** [`GAME_DESIGN_DOCUMENT.md`](GAME_DESIGN_DOCUMENT.md) 13.1 · [`ROADMAP.md`](ROADMAP.md) (F0-15, F2-16) · [`ARCHITECTURE.md`](ARCHITECTURE.md) 12

Inventário de todo arquivo de arte, áudio e fonte do jogo: de onde veio, sob qual licença e o que acontece com ele. **Nenhum asset entra no repositório sem uma linha aqui** (ROADMAP 1.3), e o teste `tests/content/assets-doc.test.ts` falha se algum arquivo de `public/assets` ou `content/tilesets` faltar nesta lista.

---

## 1. Situação atual

Todos os sprites e cenários vieram do **tutorial** usado como ponto de partida do projeto ([série no YouTube](https://www.youtube.com/watch?v=fyi4vfbKEeo&list=PLcjhmZ8oLT0r9dSiIK6RB_PuBWlG1KSq_&index=2)). A licença desses arquivos **não foi verificada**: o tutorial é material de estudo, e não há registro de permissão para redistribuí-los num jogo publicado.

Por isso, a regra é a do GDD 13.1: **todos os assets do tutorial serão substituídos** antes da demo pública. Até lá, servem apenas como **arte provisória** em desenvolvimento.

### Legenda

| Status | Significado |
|---|---|
| **A substituir** | Origem externa, licença não verificada. Não pode ir para a demo pública. |
| **Autoral** | Feito no próprio projeto. Licença do projeto. |
| **Licenciado** | Terceiros com licença compatível verificada (CC0, CC-BY etc.); créditos obrigatórios listados. |

---

## 2. Inventário

### 2.1 `public/assets/images`

| Arquivo | AssetId | Uso no jogo | Origem | Licença | Status |
|---|---|---|---|---|---|
| `images/hero.png` | `img.hero` | Protagonista (folha 4×4 de 32×32) | Tutorial | Não verificada | **A substituir** |
| `images/npc1.png` | `img.npc1` | Mestre Basílio (provisório) | Tutorial | Não verificada | **A substituir** |
| `images/npc2.png` | `img.npc2` | Lenhador Bento (provisório) | Tutorial | Não verificada | **A substituir** |
| `images/npc3.png` | `img.npc3` | Feirante Lia (provisório) | Tutorial | Não verificada | **A substituir** |
| `images/npc4.png` | `img.npc4` | Sem uso no momento | Tutorial | Não verificada | **A substituir** (ou remover) |
| `images/npc5.png` | `img.npc5` | Sem uso no momento | Tutorial | Não verificada | **A substituir** (ou remover) |
| `images/shadow.png` | `img.shadow` | Sombra sob os personagens | Tutorial | Não verificada | **A substituir** |
| `images/demo_lower.png` | `ts.cozinha_mestre_lower` | Chão e paredes da `map.cozinha_mestre` (tileset provisório) | Tutorial (`DemoRoom`) | Não verificada | **A substituir** |
| `images/demo_upper.png` | `ts.cozinha_mestre_upper` | Camada de cima da `map.cozinha_mestre` | Tutorial (`DemoRoom`) | Não verificada | **A substituir** |
| `images/kitchen_lower.png` | `ts.despensa_lower` | Chão, móveis e paredes da `map.despensa` (tileset provisório) | Tutorial (`Kitchen`) | Não verificada | **A substituir** |
| `images/kitchen_upper.png` | `ts.despensa_upper` | Camada de cima da `map.despensa` (vazia) | Tutorial (`Kitchen`) | Não verificada | **A substituir** |

### 2.2 `content/tilesets` (só no editor Tiled)

| Arquivo | Uso | Origem | Licença | Status |
|---|---|---|---|---|
| `tilesets/colisao.png` | Tile vermelho para pintar a camada `collision` no Tiled; não vai para o jogo (`editorOnly`) | Gerado no projeto (F0-08) | Do projeto | **Autoral** |

Os `.tsj` de `content/tilesets` são descrições dos tilesets (texto), não imagens; apontam para os PNGs da seção 2.1.

### 2.3 Outros

| Arquivo | Uso | Origem | Licença | Status |
|---|---|---|---|---|
| `public/favicon.ico` | Ícone da aba | — | — | **Vazio (0 bytes):** criar um ícone autoral |
| Fonte da UI | Caixa de diálogo | Fonte do sistema (`Courier New`/monospace) | Do sistema, não distribuída | Provisória: escolher fonte pixel art com licença aberta (ARCHITECTURE 25.3) |

Áudio: nenhum arquivo ainda.

---

## 3. Plano de substituição

| Etapa | Quando | O que | Tarefa |
|---|---|---|---|
| 1 | Fase 1 | Fonte pixel art com licença aberta (ex.: OFL) para a UI; favicon autoral | F1 (UI) |
| 2 | Fase 2 | Tileset autoral de interiores 16×16 (cozinha, despensa) e redesenho dos dois mapas no Tiled sobre ele | F2-16 |
| 3 | Fase 2 | Protagonista autoral (32×32, 4 direções, idle + walk, mesma grade de `anim.character_32`) e sombra | F2-16 |
| 4 | Fase 2 | NPCs da demo (Basílio, Lia, Bento, Sálvia, Ravena) com identidade própria (GDD 10.4) | F2-16 |
| 5 | Fase 3 | Revisão final: nenhuma linha "A substituir" na seção 2; créditos na tela de créditos | F3 |

Regras para assets novos:

- Preferir **autoral** ou **CC0**. CC-BY é aceito com crédito na tela de créditos e nesta tabela. Licenças "não comercial" ou sem licença explícita **não** são aceitas.
- Registrar aqui, no mesmo commit: arquivo, `AssetId`, origem (link), autor, licença e status.
- Seguir as convenções do manifesto (`src/data/assets.json`) e os nomes em `snake_case` (ARCHITECTURE 12.1).
- Como os mapas usam `AssetId`, trocar a arte de um tileset ou sprite não exige mudar código, só o arquivo e o manifesto (desde que a grade de tiles/quadros seja mantida).
