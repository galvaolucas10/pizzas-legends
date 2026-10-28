import type { ContentRegistry } from "../content/registry";
import { grantXp } from "./progression";
import { addCoins } from "./shop";
import type { SaveData } from "./types";

/** Total de clientes que já pagaram (estatística). */
export const CUSTOMERS_SERVED_FLAG = "flag.clientes_total";

/**
 * Cliente pagou (restaurante): moedas, XP e +1 no contador da etapa de "atender clientes"
 * que estiver ativa agora (só ela, para uma etapa futura não começar já cumprida).
 */
export function payCustomer(
  save: SaveData,
  content: ContentRegistry,
  byEmployee = false,
): SaveData {
  const r = content.balance.restaurant;
  if (!r) return save;
  let next = addCoins(save, customerCoins(content, byEmployee), content);
  const flags = { ...next.flags };
  flags[CUSTOMERS_SERVED_FLAG] = Number(flags[CUSTOMERS_SERVED_FLAG] ?? 0) + 1;
  for (const quest of Object.values(content.quests)) {
    const state = next.quests[quest.id];
    if (state?.status !== "active") continue;
    const cond = quest.steps[state.step]?.completeWhen;
    if (cond && "flag" in cond && r.countFlags.includes(cond.flag)) {
      flags[cond.flag] = Number(flags[cond.flag] ?? 0) + 1;
    }
  }
  next = { ...next, flags };
  // XP é de quem atende: atendido pela funcionária, só as moedas.
  return byEmployee ? next : grantXp(next, r.payXp, content).save;
}

/** Pedidos online entregues pelo motoboy (estatística). */
export const ONLINE_DELIVERED_FLAG = "flag.pedidos_online";

/** O motoboy voltou da entrega: moedas e XP do pedido online. */
export function payOnlineOrder(
  save: SaveData,
  content: ContentRegistry,
  byHelper = false,
): SaveData {
  const a = content.balance.avenue;
  if (!a) return save;
  const cut = byHelper ? (a.helper?.cut ?? 0) : 0;
  let next = addCoins(save, Math.max(0, a.pay - cut), content);
  next = {
    ...next,
    flags: {
      ...next.flags,
      [ONLINE_DELIVERED_FLAG]: Number(next.flags[ONLINE_DELIVERED_FLAG] ?? 0) + 1,
    },
  };
  // XP é de quem fez a pizza: feita pelo garçom, só as moedas.
  return byHelper ? next : grantXp(next, a.xp, content).save;
}

/** A funcionária do restaurante está trabalhando (existe e não está de folga). */
export function isEmployeeWorking(save: SaveData, content: ContentRegistry): boolean {
  const e = content.balance.restaurant?.employee;
  return Boolean(e && !save.flags[e.offFlag]);
}

/** Moedas que o jogador recebe por cliente (a funcionária fica com a parte dela). */
export function customerCoins(content: ContentRegistry, byEmployee: boolean): number {
  const r = content.balance.restaurant;
  if (!r) return 0;
  return Math.max(0, r.payCoins - (byEmployee ? (r.employee?.cut ?? 0) : 0));
}
