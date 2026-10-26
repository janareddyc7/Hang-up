import { ClientEnvironmentSchema } from "@/env-schema";

/** Explicit allowlist of values safe to expose to browser code. Never add secrets here. */
export const clientEnv = ClientEnvironmentSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
