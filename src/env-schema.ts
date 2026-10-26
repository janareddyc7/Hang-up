import { z } from "zod";
import { VoiceRoleSchema } from "@/lib/engine/schema";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().optional(),
);

const optionalPostgresUrl = z.preprocess(
  emptyToUndefined,
  z
    .url()
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "must be a PostgreSQL connection URL",
    )
    .optional(),
);

const VoiceIdsSchema = z.object(
  Object.fromEntries(
    VoiceRoleSchema.options.map((role) => [role, z.string().trim().min(1)]),
  ) as unknown as Record<z.infer<typeof VoiceRoleSchema>, z.ZodType<string>>,
).strict();

const optionalVoiceIds = optionalText.transform((value, context) => {
  if (value === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "must be valid JSON containing all six non-empty voice IDs",
    });
    return z.NEVER;
  }

  const result = VoiceIdsSchema.safeParse(parsed);
  if (!result.success) {
    context.addIssue({
      code: "custom",
      message: `must contain all six non-empty voice IDs (${result.error.issues
        .map((issue) => issue.path.join(".") || issue.message)
        .join(", ")})`,
    });
    return z.NEVER;
  }

  return result.data;
});

const optionalSender = optionalText.refine((value) => {
  if (value === undefined) return true;
  const wrappedAddress = value.match(/<([^<>]+)>/)?.[1];
  return z.email().safeParse(wrappedAddress ?? value).success;
}, "must be a valid email address, optionally with a display name");

const adminEmails = optionalText.transform((value, context) => {
  if (value === undefined) return [];
  const emails = value.split(",").map((email) => email.trim()).filter(Boolean);
  const invalid = emails.filter((email) => !z.email().safeParse(email).success);
  if (invalid.length > 0) {
    context.addIssue({
      code: "custom",
      message: `contains invalid email address(es): ${invalid.join(", ")}`,
    });
    return z.NEVER;
  }
  return emails;
});

const optionalPhoneEncryptionKey = optionalText.refine((value) => {
  if (value === undefined) return true;
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.byteLength === 32 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}, "must be a base64-encoded 32-byte key");

const ServerEnvironmentObjectSchema = z
  .object({
    APP_URL: z.preprocess(
      emptyToUndefined,
      z.url().default("http://localhost:3000"),
    ),
    DATABASE_URL: optionalPostgresUrl,
    DATABASE_URL_UNPOOLED: optionalPostgresUrl,
    TEST_DATABASE_URL: optionalPostgresUrl,
    BETTER_AUTH_SECRET: optionalText,
    BETTER_AUTH_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    RESEND_API_KEY: optionalText,
    EMAIL_FROM: optionalSender,
    ADMIN_EMAILS: adminEmails,
    ELEVENLABS_API_KEY: optionalText,
    ELEVENLABS_AGENT_ID: optionalText,
    ELEVENLABS_WEBHOOK_SECRET: optionalText,
    ELEVENLABS_VOICE_IDS: optionalVoiceIds,
    HANGUP_LLM_SECRET: optionalText,
    ACTOR_MODEL: optionalText,
    CLASSIFIER_MODEL: optionalText,
    AI_GATEWAY_API_KEY: optionalText,
    OPENAI_API_KEY: optionalText,
    ANTHROPIC_API_KEY: optionalText,
    CRON_SECRET: optionalText,
    PRACTICE_CALLS_ENABLED: z.preprocess(
      emptyToUndefined,
      z.stringbool().default(false),
    ),
    PRACTICE_CALLS_ADULT_REVIEWED: z.preprocess(
      emptyToUndefined,
      z.stringbool().default(false),
    ),
    ELEVENLABS_PHONE_NUMBER_ID: optionalText,
    TWILIO_ACCOUNT_SID: optionalText,
    TWILIO_AUTH_TOKEN: optionalText,
    TWILIO_VERIFY_SERVICE_SID: optionalText,
    PHONE_ENCRYPTION_KEY: optionalPhoneEncryptionKey,
    PILOT_ENABLED: z.preprocess(
      emptyToUndefined,
      z.stringbool().default(false),
    ),
  })
  .strict();

const ServerEnvironmentSchema = ServerEnvironmentObjectSchema.superRefine(
  (environment, context) => {
    const requireValue = (key: keyof typeof environment, value: unknown) => {
      if (value === undefined || value === "") {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "is required when this feature is configured",
        });
      }
    };

    const databaseConfigured = Boolean(
      environment.DATABASE_URL || environment.DATABASE_URL_UNPOOLED,
    );
    if (databaseConfigured) {
      requireValue("DATABASE_URL", environment.DATABASE_URL);
      requireValue("DATABASE_URL_UNPOOLED", environment.DATABASE_URL_UNPOOLED);
    }

    const authConfigured = Boolean(
      environment.BETTER_AUTH_SECRET ||
        environment.RESEND_API_KEY ||
        environment.EMAIL_FROM,
    );
    if (authConfigured) {
      requireValue("BETTER_AUTH_SECRET", environment.BETTER_AUTH_SECRET);
      requireValue("BETTER_AUTH_URL", environment.BETTER_AUTH_URL);
      requireValue("RESEND_API_KEY", environment.RESEND_API_KEY);
      requireValue("EMAIL_FROM", environment.EMAIL_FROM);
      requireValue("DATABASE_URL", environment.DATABASE_URL);
    }

    const modelConfigured = Boolean(
      environment.ACTOR_MODEL || environment.CLASSIFIER_MODEL,
    );
    if (
      modelConfigured &&
      !environment.AI_GATEWAY_API_KEY &&
      !environment.OPENAI_API_KEY &&
      !environment.ANTHROPIC_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["AI_GATEWAY_API_KEY"],
        message:
          "configure AI_GATEWAY_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY when a model is selected",
      });
    }

    const voiceConfigured = Boolean(
      environment.ELEVENLABS_API_KEY ||
        environment.ELEVENLABS_AGENT_ID ||
        environment.ELEVENLABS_WEBHOOK_SECRET ||
        environment.ELEVENLABS_VOICE_IDS ||
        (environment.PRACTICE_CALLS_ENABLED && environment.PRACTICE_CALLS_ADULT_REVIEWED),
    );
    if (voiceConfigured) {
      requireValue("ELEVENLABS_API_KEY", environment.ELEVENLABS_API_KEY);
      requireValue("ELEVENLABS_AGENT_ID", environment.ELEVENLABS_AGENT_ID);
      requireValue("ELEVENLABS_VOICE_IDS", environment.ELEVENLABS_VOICE_IDS);
      requireValue("HANGUP_LLM_SECRET", environment.HANGUP_LLM_SECRET);
    }

    if (environment.PRACTICE_CALLS_ENABLED && environment.PRACTICE_CALLS_ADULT_REVIEWED) {
      requireValue("ELEVENLABS_WEBHOOK_SECRET", environment.ELEVENLABS_WEBHOOK_SECRET);
      requireValue(
        "ELEVENLABS_PHONE_NUMBER_ID",
        environment.ELEVENLABS_PHONE_NUMBER_ID,
      );
      requireValue("TWILIO_ACCOUNT_SID", environment.TWILIO_ACCOUNT_SID);
      requireValue("TWILIO_AUTH_TOKEN", environment.TWILIO_AUTH_TOKEN);
      requireValue(
        "TWILIO_VERIFY_SERVICE_SID",
        environment.TWILIO_VERIFY_SERVICE_SID,
      );
      requireValue("PHONE_ENCRYPTION_KEY", environment.PHONE_ENCRYPTION_KEY);
    }
  },
);

export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>;

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  // Vercel supplies the canonical production domain even on the first deployment.
  const productionOrigin = input.VERCEL_ENV === "production" && input.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${input.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
  const resolved: Record<string, string | undefined> = { ...input, APP_URL: input.APP_URL || productionOrigin, BETTER_AUTH_URL: input.BETTER_AUTH_URL || productionOrigin };
  const knownInput = Object.fromEntries(
    Object.keys(ServerEnvironmentObjectSchema.shape).map((key) => [key, resolved[key]]),
  );
  const result = ServerEnvironmentSchema.safeParse(knownInput);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .map((message) => `- ${message}`)
    .join("\n");

  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const ClientEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type ClientEnvironment = z.infer<typeof ClientEnvironmentSchema>;
