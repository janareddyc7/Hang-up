import { gateway } from "ai";
import { env } from "@/env";
import { db } from "@/db/client";
import { loadPersonas } from "@/lib/engine/personas";
import { DrizzleDrillStore } from "@/lib/drill/drizzle-store";
import type { LanguageModel } from "ai";
import { InMemoryDrillStore, type RuntimeDeps } from "@/lib/drill/runtime";
import bankFraudDepartment from "../../../content/personas/bank-fraud-department.json";
import benefitsSuspension from "../../../content/personas/benefits-suspension.json";
import govConsumerSafety from "../../../content/personas/gov-consumer-safety.json";
import grandchildEmergency from "../../../content/personas/grandchild-emergency.json";
import prizeSweepstakes from "../../../content/personas/prize-sweepstakes.json";
import techSupport from "../../../content/personas/tech-support.json";

const personas = loadPersonas([
  bankFraudDepartment,
  benefitsSuspension,
  govConsumerSafety,
  grandchildEmergency,
  prizeSweepstakes,
  techSupport,
]);

const DEFAULT_ACTOR_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_CLASSIFIER_MODEL = "openai/gpt-4.1-nano";

let runtimeDeps: RuntimeDeps | undefined;

/** Build the server-only runtime once per process so every turn shares its DB pool and models. */
export function getRuntimeDeps(): RuntimeDeps {
  if (runtimeDeps) return runtimeDeps;

  const llmSecret = env.HANGUP_LLM_SECRET;
  if (!llmSecret) {
    throw new Error("HANGUP_LLM_SECRET must be configured before the Custom LLM route can run.");
  }

  const e2eMode = process.env.HANGUP_E2E_MODE === "true" && process.env.NODE_ENV !== "production";
  runtimeDeps = {
    store: e2eMode ? new InMemoryDrillStore() : new DrizzleDrillStore(db),
    personas,
    actorModel: e2eMode ? {} as LanguageModel : gateway(env.ACTOR_MODEL ?? DEFAULT_ACTOR_MODEL),
    classifierModel: e2eMode ? {} as LanguageModel : gateway(env.CLASSIFIER_MODEL ?? DEFAULT_CLASSIFIER_MODEL),
    llmSecret,
    now: () => Date.now(),
    newId: () => `drl_${crypto.randomUUID()}`,
    onPracticeCallStop: async (userId) => {
      const { revokePracticeCallsForUser } = await import("@/lib/practice-calls/revoke");
      await revokePracticeCallsForUser(userId);
    },
  };

  return runtimeDeps;
}
