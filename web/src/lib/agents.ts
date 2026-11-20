// How the four AI agents are presented in the UI ("Warsztat Wulkanizacyjny Marek").
// The ids and logic come from shared/types.ts (Pair 2); here we only choose display names and roles.
// Note: the shop owner is Marek, so the tax agent (id "marek") is shown as Zofia.
import type { CfoId } from '@cfo/shared';

export const AGENT_ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia'];

export const AGENT: Record<CfoId, { name: string; rolePl: string; role: string }> = {
  marek: { name: 'Zofia', rolePl: 'Podatki i KSeF', role: 'Tax & KSeF' },
  anna: { name: 'Anna', rolePl: 'Płynność', role: 'Liquidity' },
  tomasz: { name: 'Tomasz', rolePl: 'Koszty i magazyn', role: 'Costs & stock' },
  kasia: { name: 'Kasia', rolePl: 'Inwestycje i waluty', role: 'Investments & FX' },
};

export const agentName = (id: CfoId) => AGENT[id].name;
export const agentRole = (id: CfoId, lang: 'pl' | 'en') => (lang === 'pl' ? AGENT[id].rolePl : AGENT[id].role);
export const initials = (id: CfoId) => AGENT[id].name.slice(0, 2).toUpperCase();
