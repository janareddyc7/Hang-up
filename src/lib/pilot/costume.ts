import { PersonaCardSchema, type PersonaCard } from "@/lib/engine/schema";

/** New fictional names and openings, with identical tactics, stages, goals, and scoring. */
export function assessmentPersona(persona: PersonaCard, seed: string): PersonaCard {
  const phase = seed.split(":")[1];
  if (!seed.startsWith("pilot:") || (phase !== "post" && phase !== "retention")) return persona;
  const later = phase === "retention";
  const names: Record<string, string> = {
    "gov-consumer-safety": later ? "Agent Taylor Lane" : "Agent Morgan Blair",
    "benefits-suspension": later ? "Officer Dana Cole" : "Officer Erin Woods",
    "bank-fraud-department": later ? "Melissa" : "Sarah",
    "tech-support": later ? "Chris" : "David",
    "prize-sweepstakes": later ? "Sam Jordan" : "Jordan Ellis",
    "grandchild-emergency": later ? "A frightened grandchild" : "Your grandchild",
  };
  const name = names[persona.id];
  if (!name) return persona;
  const renamed = PersonaCardSchema.parse(JSON.parse(JSON.stringify(persona).replaceAll(persona.callerName, name)));
  if (persona.id === "grandchild-emergency") renamed.firstMessage = later
    ? "It's me. I'm scared and I only have a minute. Please listen before you call anyone else."
    : "Please don't hang up. I'm in trouble and I need your help before anyone finds out.";
  return renamed;
}
