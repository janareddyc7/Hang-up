import type { Tactic } from "@/lib/engine/taxonomy";

/** CSS custom-property names; the palette itself stays in theme.css. */
export const TACTIC_COLOR_TOKEN = {
  authority: "--tactic-authority",
  urgency: "--tactic-time",
  fear: "--tactic-fear",
  secrecy: "--signal",
  move_money: "--signal",
  unusual_payment: "--signal",
  credential_request: "--signal",
  remote_access: "--signal",
  family_emergency: "--tactic-kindness",
  prize: "--tactic-greed",
  social_proof: "--tactic-herd",
  complicity: "--tactic-complicity",
} satisfies Record<Tactic, string>;
