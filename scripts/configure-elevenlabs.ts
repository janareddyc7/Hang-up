import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

config({ path: ".env.local", quiet: true });

// Only public, built-in library voices. No synthesis or conversation is started.
const voices = {
  official_male: "JBFqnCBsd6RMkjVDRZzb",
  official_female: "EXAVITQu4vr4xnSDxMaL",
  young_adult_male: "SOYHLrjzK2X1ezoPC6cr",
  young_adult_female: "hpp4J3VqNfWAUOO0d1Us",
  technician: "CwhRBWXzGAHq8TQ4Fs17",
  upbeat_host: "TX3LPaxmHKxFdv7VOQHJ",
};

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  const id = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !id) throw new Error("Configure the agent ID and API key first.");
  const headers = { "xi-api-key": key, "content-type": "application/json" };
  // Validate each voice against this account before changing anything.
  for (const [role, voiceId] of Object.entries(voices)) {
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Library voice for ${role} is unavailable (HTTP ${response.status}).`);
    const voice = z.object({ category: z.literal("premade") }).safeParse(await response.json());
    if (!voice.success) throw new Error(`The ${role} voice is not a premade voice.`);
  }
  const patch = {
    conversation_config: {
      agent: {
        first_message: "{{first_message}}",
        dynamic_variables: { dynamic_variable_placeholders: { first_message: "This is a fictional Hang Up practice call. Please start this call from the Hang Up app." } },
        prompt: {
          backup_llm_config: { preference: "disabled" },
          built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
        },
      },
      tts: { voice_id: voices.official_male },
      conversation: { max_duration_seconds: 300, client_events: ["audio", "interruption", "user_transcript", "agent_response", "agent_response_correction"] },
    },
    platform_settings: {
      auth: { enable_auth: true },
      privacy: { record_voice: false, retention_days: 1, delete_audio: true, delete_transcript_and_pii: true },
      overrides: {
        custom_llm_extra_body: true,
        conversation_config_override: { agent: { first_message: true }, tts: { voice_id: true, speed: true } },
      },
    },
  };
  console.log("Plan: private agent; Director-only responses; End call tool; 5-minute limit; no audio recording; 1-day provider retention; six verified premade voices.");
  if (!process.argv.includes("--apply")) { console.log("Dry run. Add --apply to update the configured agent and local voice mapping."); return; }
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(id)}`, { method: "PATCH", headers, body: JSON.stringify(patch), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Agent update rejected (HTTP ${response.status}). No environment values were changed.`);
  const raw: unknown = await response.json();
  const verified = z.object({
    conversation_config: z.object({ agent: z.object({ prompt: z.object({ backup_llm_config: z.object({ preference: z.literal("disabled") }), built_in_tools: z.object({ end_call: z.object({ name: z.literal("end_call") }) }) }) }), conversation: z.object({ max_duration_seconds: z.literal(300) }) }),
    platform_settings: z.object({ auth: z.object({ enable_auth: z.literal(true) }), privacy: z.object({ record_voice: z.literal(false), retention_days: z.literal(1) }) }),
  }).safeParse(raw);
  if (!verified.success) throw new Error("Agent returned unexpected settings. Run check:elevenlabs before starting a call.");
  const file = readFileSync(".env.local", "utf8");
  const entry = `ELEVENLABS_VOICE_IDS='${JSON.stringify(voices)}'`;
  writeFileSync(".env.local", /^ELEVENLABS_VOICE_IDS=.*$/m.test(file) ? file.replace(/^ELEVENLABS_VOICE_IDS=.*$/m, entry) : `${file}\n${entry}\n`);
  console.log("Agent updated and verified. Local premade voice mapping saved. No conversation or audio generated.");
}

main().catch(() => { console.error("Agent setup failed. Run without --apply to validate the voice configuration; no secrets are printed."); process.exitCode = 1; });
