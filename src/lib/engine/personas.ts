/**
 * Loads and validates persona cards. In the Next.js app, import the JSON files
 * statically (they are bundled) and call loadPersonas() once at module scope.
 */
import { PersonaCardSchema, type PersonaCard } from "./schema";

export function loadPersonas(raw: unknown[]): Map<string, PersonaCard> {
  const map = new Map<string, PersonaCard>();
  for (const r of raw) {
    const p = PersonaCardSchema.parse(r);
    if (map.has(p.id)) throw new Error(`duplicate persona id ${p.id}`);
    map.set(p.id, p);
  }
  return map;
}

/** Every tactic a persona can use, for the curriculum's scenario list. */
export function personaTactics(p: PersonaCard) {
  const set = new Set(Object.values(p.stages).flatMap((s) => s.allowedTactics));
  for (const c of p.counterObjections) set.add(c.tactic);
  return [...set];
}
