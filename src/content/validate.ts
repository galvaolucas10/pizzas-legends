import type { ContentRegistry } from "./registry";
import { manifestIds } from "./schemas/assets";
import type { Condition } from "./schemas/conditions";
import { forEachEvent, type GameEvent } from "./schemas/events";
import { isSolid, type MapDef, type MapObject } from "./schemas/map";

/**
 * Integridade referencial (DATA_MODELS 7.1). O formato já foi validado pelo Zod;
 * aqui se confere se tudo o que é citado existe e se as regras entre entidades valem.
 * Devolve a lista de problemas (vazia = conteúdo válido).
 */
export function validateContent(content: ContentRegistry): string[] {
  const problems: string[] = [];
  const fail = (where: string, detail: string) => problems.push(`${where}: ${detail}`);
  const hasText = (key: string) => key in content.locale;
  const { assets } = content;

  /** Confere se `id` existe na tabela; `what` aparece na mensagem. */
  const ref = (
    table: Readonly<Record<string, unknown>>,
    id: string,
    what: string,
    where: string,
  ) => {
    if (!(id in table)) fail(where, `${what} inexistente "${id}"`);
  };
  const image = (id: string, where: string) => ref(assets.images, id, "imagem", where);

  // ---------- Assets ----------
  const allAssets = manifestIds(assets);
  for (const [id, img] of Object.entries(assets.images)) {
    if (img.animations && !assets.animationSets[img.animations]) {
      fail("assets.json", `"${id}" cita o conjunto de animação inexistente "${img.animations}"`);
    }
  }
  for (const [name, ids] of Object.entries(assets.bundles)) {
    for (const id of ids) {
      if (!allAssets.has(id))
        fail("assets.json", `pacote "${name}" cita o asset inexistente "${id}"`);
    }
  }

  // ---------- Nomes no arquivo de idioma ----------
  const named = [
    content.ingredients,
    content.recipes,
    content.conversions,
    content.branches,
    content.skills,
    content.statuses,
    content.actions,
    content.enemies,
    content.quests,
    content.characters,
    content.npcs,
    content.maps,
  ];
  for (const tableOf of named) {
    for (const id of Object.keys(tableOf)) {
      if (!hasText(`${id}.name`)) fail(id, `falta o texto "${id}.name"`);
    }
  }

  // ---------- Condições ----------
  const checkCondition = (condition: Condition, where: string): void => {
    if ("all" in condition) condition.all.forEach((c) => checkCondition(c, where));
    else if ("any" in condition) condition.any.forEach((c) => checkCondition(c, where));
    else if ("not" in condition) checkCondition(condition.not, where);
    else if ("quest" in condition) {
      const quest = content.quests[condition.quest];
      if (!quest) fail(where, `missão inexistente "${condition.quest}"`);
      else if ("stepAtLeast" in condition && condition.stepAtLeast > quest.steps.length) {
        fail(where, `"${condition.quest}" só tem ${quest.steps.length} etapa(s)`);
      }
    } else if ("hasIngredient" in condition) {
      ref(content.ingredients, condition.hasIngredient, "ingrediente", where);
    } else if ("hasPizza" in condition) {
      if (condition.hasPizza.recipeId)
        ref(content.recipes, condition.hasPizza.recipeId, "receita", where);
    } else if ("hasSkill" in condition)
      ref(content.skills, condition.hasSkill, "habilidade", where);
    else if ("knowsRecipe" in condition)
      ref(content.recipes, condition.knowsRecipe, "receita", where);
  };
  for (const [name, condition] of Object.entries(content.conditions)) {
    checkCondition(condition, `conditions.json#${name}`);
  }

  // ---------- Balanceamento ----------
  const b = content.balance;
  if (b.xpTable.length !== b.maxLevel) {
    fail(
      "balance.json",
      `xpTable tem ${b.xpTable.length} níveis; com maxLevel ${b.maxLevel} deveria ter ${b.maxLevel} (do 1 ao ${b.maxLevel})`,
    );
  }
  for (const item of b.restKit ?? []) {
    ref(content.ingredients, item.ingredientId, "ingrediente", "balance.json#restKit");
  }
  if (b.xpTable[0] !== 0) fail("balance.json", "xpTable deve começar em 0 (nível 1)");
  if (b.xpTable.some((xp, i) => i > 0 && xp <= b.xpTable[i - 1]!)) {
    fail("balance.json", "xpTable deve ser estritamente crescente");
  }
  if (b.slices.min > b.slices.max) fail("balance.json", "slices.min maior que slices.max");
  const beaten = Object.entries(b.profileBeats);
  if (
    new Set(beaten.map(([, loser]) => loser)).size !== beaten.length ||
    beaten.some(([w, l]) => w === l)
  ) {
    fail(
      "balance.json",
      "profileBeats deve formar um ciclo: cada perfil vence e perde para exatamente um",
    );
  }

  // ---------- Ingredientes ----------
  for (const ing of Object.values(content.ingredients)) {
    image(ing.icon, ing.id);
    for (const mod of ing.toppingModifiers) {
      if ("status" in mod) ref(content.statuses, mod.status, "status", ing.id);
    }
  }

  // ---------- Receitas ----------
  for (const recipe of Object.values(content.recipes)) {
    for (const req of recipe.requirements) {
      if (req.kind !== "ingredient") continue;
      const ing = content.ingredients[req.ingredientId];
      if (!ing) fail(recipe.id, `ingrediente inexistente "${req.ingredientId}"`);
      else if (ing.category === "cobertura") {
        fail(recipe.id, `"${req.ingredientId}" é cobertura e não pode ser obrigatório`);
      }
    }
    if (
      !recipe.requirements.some(
        (r) =>
          (r.kind === "category" ? r.category : content.ingredients[r.ingredientId]?.category) ===
          "massa",
      )
    ) {
      fail(recipe.id, "toda receita exige massa");
    }
    for (const app of recipe.sliceAction.applyStatus ?? [])
      ref(content.statuses, app.status, "status", recipe.id);

    const unlock = recipe.unlock;
    if (unlock.kind === "reward") {
      const reward = content.rewards[unlock.rewardId];
      if (!reward) fail(recipe.id, `recompensa inexistente "${unlock.rewardId}"`);
      else if (!reward.recipes?.includes(recipe.id)) {
        fail(recipe.id, `a recompensa "${unlock.rewardId}" não entrega esta receita`);
      }
    } else if (unlock.kind === "skill") {
      const skill = content.skills[unlock.skillId];
      if (!skill) fail(recipe.id, `habilidade inexistente "${unlock.skillId}"`);
      else if (!skill.effects.some((e) => e.type === "unlockRecipe" && e.recipeId === recipe.id)) {
        fail(recipe.id, `a habilidade "${unlock.skillId}" não desbloqueia esta receita`);
      }
    }
  }

  // ---------- Conversões ----------
  for (const conv of Object.values(content.conversions)) {
    for (const item of [...conv.inputs, conv.output])
      ref(content.ingredients, item.ingredientId, "ingrediente", conv.id);
    const skill = content.skills[conv.requiresSkill];
    if (!skill) fail(conv.id, `habilidade inexistente "${conv.requiresSkill}"`);
    else if (
      !skill.effects.some((e) => e.type === "unlockConversion" && e.conversionId === conv.id)
    ) {
      fail(conv.id, `a habilidade "${conv.requiresSkill}" não desbloqueia esta conversão`);
    }
  }

  // ---------- Habilidades ----------
  for (const branch of Object.values(content.branches)) image(branch.icon, branch.id);
  for (const skill of Object.values(content.skills)) {
    ref(content.branches, skill.branchId, "ramo", skill.id);
    if (!hasText(`${skill.id}.desc`)) fail(skill.id, `falta o texto "${skill.id}.desc"`);
    for (const reqId of skill.requires) {
      const req = content.skills[reqId];
      if (!req) fail(skill.id, `pré-requisito inexistente "${reqId}"`);
      else if (req.branchId !== skill.branchId)
        fail(skill.id, `pré-requisito "${reqId}" é de outro ramo`);
      else if (req.tier >= skill.tier)
        fail(skill.id, `pré-requisito "${reqId}" não é de um nível anterior`);
    }
    if (
      skill.tier > 1 &&
      !skill.requires.some((id) => content.skills[id]?.branchId === skill.branchId)
    ) {
      fail(skill.id, `nível ${skill.tier} precisa exigir uma habilidade do mesmo ramo`);
    }
    for (const effect of skill.effects) {
      if (effect.type === "unlockRecipe")
        ref(content.recipes, effect.recipeId, "receita", skill.id);
      if (effect.type === "unlockConversion")
        ref(content.conversions, effect.conversionId, "conversão", skill.id);
    }
  }

  // ---------- Ações e inimigos ----------
  for (const action of Object.values(content.actions)) {
    image(action.intentIcon, action.id);
    for (const app of action.applyStatus ?? [])
      ref(content.statuses, app.status, "status", action.id);
  }
  for (const enemy of Object.values(content.enemies)) {
    image(enemy.sprite, enemy.id);
    for (const drop of enemy.drops)
      ref(content.ingredients, drop.ingredientId, "ingrediente", enemy.id);
    let previous = enemy.maxHp;
    enemy.phases.forEach((phase, i) => {
      if (phase.untilHpAtOrBelow >= previous) {
        fail(
          enemy.id,
          `fase ${i + 1}: limiar de PV ${phase.untilHpAtOrBelow} deve ser menor que ${previous}`,
        );
      }
      previous = phase.untilHpAtOrBelow;
      for (const id of [...phase.pattern, ...(phase.onEnterAction ? [phase.onEnterAction] : [])]) {
        ref(content.actions, id, "ação", enemy.id);
      }
    });
    if (enemy.phases.at(-1)?.untilHpAtOrBelow !== 0)
      fail(enemy.id, "a última fase deve terminar em 0 PV");
    const patternActions = new Set(enemy.phases.flatMap((p) => p.pattern));
    for (const pizza of enemy.basket ?? []) {
      if (!hasText(pizza.label)) fail(enemy.id, `texto inexistente "${pizza.label}"`);
      if (!patternActions.has(pizza.actionId)) {
        fail(enemy.id, `pizza da cesta usa "${pizza.actionId}", que não aparece em nenhuma fase`);
      }
    }
  }

  // ---------- Recompensas, missões e personagem ----------
  for (const reward of Object.values(content.rewards)) {
    for (const item of reward.ingredients ?? [])
      ref(content.ingredients, item.ingredientId, "ingrediente", reward.id);
    for (const id of reward.recipes ?? []) ref(content.recipes, id, "receita", reward.id);
  }
  for (const quest of Object.values(content.quests)) {
    if (quest.availableWhen) checkCondition(quest.availableWhen, quest.id);
    quest.steps.forEach((step, i) => {
      const where = `${quest.id} (etapa ${i + 1})`;
      if (!hasText(step.objectiveKey)) fail(where, `texto inexistente "${step.objectiveKey}"`);
      checkCondition(step.completeWhen, where);
      if (step.rewardId) ref(content.rewards, step.rewardId, "recompensa", where);
    });
  }
  for (const char of Object.values(content.characters)) {
    image(char.sprite, char.id);
    for (const id of char.startingRecipes) ref(content.recipes, id, "receita", char.id);
    for (const item of char.startingIngredients)
      ref(content.ingredients, item.ingredientId, "ingrediente", char.id);
  }
  for (const recipe of Object.values(content.recipes)) {
    if (
      recipe.unlock.kind === "start" &&
      !Object.values(content.characters).some((c) => c.startingRecipes.includes(recipe.id))
    ) {
      fail(recipe.id, 'desbloqueio "start", mas nenhum personagem começa com ela');
    }
  }

  // ---------- NPCs ----------
  for (const npc of Object.values(content.npcs)) {
    image(npc.sprite, npc.id);
    if (npc.portrait) image(npc.portrait, npc.id);
  }

  // ---------- Mapas ----------
  const ovens = new Map<string, string>();
  for (const map of Object.values(content.maps)) {
    for (const object of map.objects) {
      if (object.kind !== "oven") continue;
      const other = ovens.get(object.ovenId);
      if (other) fail(map.id, `forno "${object.ovenId}" repetido (já existe em ${other})`);
      ovens.set(object.ovenId, map.id);
    }
  }

  for (const map of Object.values(content.maps)) {
    const where = (detail: string) => fail(map.id, detail);
    for (const tileset of map.tilesets) {
      if (!assets.tilesets[tileset.assetId]) where(`tileset inexistente "${tileset.assetId}"`);
    }
    if (map.music && !assets.audio[map.music]) where(`música inexistente "${map.music}"`);

    const localIds = new Set<string>();
    for (const object of map.objects) {
      if (localIds.has(object.id)) where(`objeto repetido "${object.id}"`);
      localIds.add(object.id);
    }

    for (const [name, entrance] of Object.entries(map.entrances)) {
      if (!isFree(map, entrance.x, entrance.y))
        where(`entrada "${name}" (${entrance.x},${entrance.y}) está numa parede`);
    }

    for (const object of map.objects) {
      const at = `objeto "${object.id}" (${object.x},${object.y})`;
      if (object.x >= map.width || object.y >= map.height) where(`${at} está fora do mapa`);
      else if (!WALL_ALLOWED.has(object.kind) && !isFree(map, object.x, object.y))
        where(`${at} está sobre uma parede`);
      if (
        isSolid(object) &&
        Object.values(map.entrances).some((e) => e.x === object.x && e.y === object.y)
      ) {
        where(`${at} é sólido e está sobre uma entrada`);
      }
      if (object.visibleIf) checkCondition(object.visibleIf, `${map.id} ${at}`);

      switch (object.kind) {
        case "npc":
          ref(content.npcs, object.npcId, "NPC", `${map.id} ${at}`);
          object.talking.forEach(
            (t) => t.condition && checkCondition(t.condition, `${map.id} ${at}`),
          );
          break;
        case "enemy":
          ref(content.enemies, object.enemyId, "inimigo", `${map.id} ${at}`);
          break;
        case "chest":
          ref(content.rewards, object.rewardId, "recompensa", `${map.id} ${at}`);
          break;
        case "harvest":
          ref(content.ingredients, object.ingredientId, "ingrediente", `${map.id} ${at}`);
          if (object.rewardId)
            ref(content.rewards, object.rewardId, "recompensa", `${map.id} ${at}`);
          if (object.renew === "never" && !object.rewardId)
            where(`${at}: coleta "never" exige rewardId`);
          if (!object.rewardId && !hasText(`obj.coleta.${object.ingredientId}`))
            where(`${at}: falta o texto "obj.coleta.${object.ingredientId}"`);
          break;
        case "sign":
          if (!hasText(object.textKey)) where(`${at} cita o texto inexistente "${object.textKey}"`);
          break;
        case "door": {
          const target = content.maps[object.toMap];
          if (!target) where(`${at} leva ao mapa inexistente "${object.toMap}"`);
          else if (!target.entrances[object.toEntrance]) {
            where(`${at} leva à entrada inexistente "${object.toMap}#${object.toEntrance}"`);
          }
          break;
        }
        default:
          break;
      }
      for (const events of eventListsOf(object)) checkEvents(events, at);
    }

    function checkEvents(events: GameEvent[], origin: string): void {
      forEachEvent(events, (event) => {
        const here = `${map.id} ${origin}, evento "${event.type}"`;
        const bad = (detail: string) => fail(here, detail);
        const localRef = (id: string) => {
          if (id !== "player" && !localIds.has(id)) bad(`objeto "${id}" não existe neste mapa`);
        };
        switch (event.type) {
          case "walk":
          case "stand":
          case "face":
            localRef(event.who);
            break;
          case "message":
            if (!hasText(event.textKey)) bad(`texto inexistente "${event.textKey}"`);
            if (event.speaker) ref(content.npcs, event.speaker, "NPC", here);
            break;
          case "choice":
            for (const key of [event.textKey, ...event.options.map((o) => o.textKey)]) {
              if (!hasText(key)) bad(`texto inexistente "${key}"`);
            }
            break;
          case "claimReward":
            ref(content.rewards, event.rewardId, "recompensa", here);
            break;
          case "takeIngredients":
            event.items.forEach((item) =>
              ref(content.ingredients, item.ingredientId, "ingrediente", here),
            );
            break;
          case "takePizza":
            if (event.filter.recipeId) ref(content.recipes, event.filter.recipeId, "receita", here);
            break;
          case "advanceQuest": {
            const quest = content.quests[event.questId];
            if (!quest) bad(`missão inexistente "${event.questId}"`);
            else if (event.toStep > quest.steps.length)
              bad(`"${event.questId}" só tem ${quest.steps.length} etapa(s)`);
            break;
          }
          case "if":
            checkCondition(event.condition, here);
            break;
          case "startBattle":
            ref(content.enemies, event.enemyId, "inimigo", here);
            if (event.source) localRef(event.source);
            break;
          case "changeMap": {
            const target = content.maps[event.mapId];
            if (!target) bad(`mapa inexistente "${event.mapId}"`);
            else if (!target.entrances[event.entrance])
              bad(`entrada inexistente "${event.entrance}"`);
            break;
          }
          case "openOven":
          case "rest":
            if (!ovens.has(event.ovenId)) bad(`forno inexistente "${event.ovenId}"`);
            break;
          default:
            break;
        }
      });
    }
  }

  return problems;
}

/** Objetos que podem ficar sobre um tile de colisão (DATA_MODELS 7.1). */
const WALL_ALLOWED: ReadonlySet<MapObject["kind"]> = new Set([
  "door",
  "trigger",
  // Fornos costumam ser parte da arte (balcão, fogão): ficam sobre a colisão e respondem ao lado.
  "oven",
]);

function isFree(map: MapDef, x: number, y: number): boolean {
  return map.collision[y]?.[x] === ".";
}

function eventListsOf(object: MapObject): GameEvent[][] {
  switch (object.kind) {
    case "npc":
      return [...object.talking.map((t) => t.events), object.behaviorLoop ?? []];
    case "enemy":
      return [object.behaviorLoop ?? [], object.onDefeat ?? []];
    case "trigger":
      return [object.events];
    default:
      return [];
  }
}
