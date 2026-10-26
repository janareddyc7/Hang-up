import { describe, expect, it } from "vitest";
import { loadPersonas } from "@/lib/engine/personas";
import { recommendPractice } from "@/lib/practice/recommend";
import { personas } from "../helpers";

const cards = [...personas.values()];

describe("practice recommendations", () => {
  it("never recommends the pilot holdout during placement or adaptive practice", () => {
    for (let completedDrills = 0; completedDrills < 8; completedDrills++) {
      const next = recommendPractice({ completedDrills, personas: cards, skills: [], nowMs: 0, excludedPersonaIds: new Set(["gov-consumer-safety"]) });
      expect(next).toBeTruthy();
      expect(next?.personaId).not.toBe("gov-consumer-safety");
    }
  });
  it("uses all three placement calls in order before personalizing", () => {
    expect(recommendPractice({ completedDrills: 0, personas: cards, skills: [], nowMs: 0 })?.personaId).toBe("gov-consumer-safety");
    expect(recommendPractice({ completedDrills: 1, personas: cards, skills: [], nowMs: 0 })?.personaId).toBe("grandchild-emergency");
    expect(recommendPractice({ completedDrills: 2, personas: cards, skills: [], nowMs: 0 })?.personaId).toBe("tech-support");
    const adapted = recommendPractice({ completedDrills: 3, personas: cards, skills: [], nowMs: 0 });
    expect(adapted).toBeTruthy();
    expect(["gov-consumer-safety", "grandchild-emergency", "tech-support"]).not.toContain(adapted?.personaId);
  });

  it("returns no recommendation when the placement catalog is incomplete", () => {
    const onePersona = loadPersonas([cards.find((persona) => persona.id === "gov-consumer-safety")!]);
    expect(recommendPractice({ completedDrills: 1, personas: [...onePersona.values()], skills: [], nowMs: 0 })).toBeNull();
  });
});
