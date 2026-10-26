import bank from "../../content/personas/bank-fraud-department.json";
import benefits from "../../content/personas/benefits-suspension.json";
import government from "../../content/personas/gov-consumer-safety.json";
import grandchild from "../../content/personas/grandchild-emergency.json";
import prize from "../../content/personas/prize-sweepstakes.json";
import tech from "../../content/personas/tech-support.json";
import { PersonaCardSchema } from "@/lib/engine/schema";

export const personas = [bank, benefits, government, grandchild, prize, tech].map((value) => PersonaCardSchema.parse(value));
