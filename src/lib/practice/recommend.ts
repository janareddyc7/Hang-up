import { chooseNextDrill, DIFFICULTY_BASE, type DrillChoice, type ItemDifficulty, type ScenarioOption, type SkillRow } from "@/lib/engine/skills";
import { personaTactics } from "@/lib/engine/personas";
import type { PersonaCard } from "@/lib/engine/schema";

export const PLACEMENT_SCENARIOS = [
  "gov-consumer-safety",
  "grandchild-emergency",
  "tech-support",
] as const;

/** Three short, realistic placement calls ensure a new trainee sees varied costumes before adaptation starts. */
export function recommendPractice(input: {
  completedDrills: number;
  personas: readonly PersonaCard[];
  skills: SkillRow[];
  nowMs: number;
  itemDifficulty?: ItemDifficulty;
  excludedPersonaIds?: ReadonlySet<string>;
}): DrillChoice | null {
  if (input.excludedPersonaIds?.size) {
    const available = input.personas.filter((p) => !input.excludedPersonaIds!.has(p.id));
    const placements = PLACEMENT_SCENARIOS.filter((id) => available.some((p) => p.id === id));
    const placement = input.completedDrills < placements.length ? placements[input.completedDrills] : undefined;
    const persona = available.find((p) => p.id === placement);
    const tactic = persona ? personaTactics(persona)[0] : undefined;
    if (persona && tactic) return { personaId: persona.id, tactic, difficulty: "realistic", predictedSuccess: 0.75 };
    return chooseNextDrill(input.skills, available.map((p) => ({ personaId: p.id, tactics: personaTactics(p) })), input.nowMs, input.itemDifficulty ?? ((_p, _t, difficulty) => DIFFICULTY_BASE[difficulty]));
  }
  if (input.completedDrills < PLACEMENT_SCENARIOS.length) {
    const personaId = PLACEMENT_SCENARIOS[input.completedDrills];
    if (!personaId) return null;
    const persona = input.personas.find((candidate) => candidate.id === personaId);
    const tactic = persona ? personaTactics(persona)[0] : undefined;
    if (!persona || !tactic) return null;
    return { personaId, tactic, difficulty: "realistic", predictedSuccess: 0.75 };
  }

  const scenarios: ScenarioOption[] = input.personas.map((persona) => ({
    personaId: persona.id,
    tactics: personaTactics(persona),
  }));
  return chooseNextDrill(input.skills, scenarios, input.nowMs, input.itemDifficulty ?? ((_persona, _tactic, difficulty) => DIFFICULTY_BASE[difficulty]));
}
