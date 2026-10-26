import { config } from "dotenv";
import { z } from "zod";
config({ path: ".env.local", quiet: true });

const AgentSchema = z.object({
  conversation_config: z.object({
    agent: z.object({ first_message: z.string(), prompt: z.object({ llm: z.string(), custom_llm: z.object({ url: z.url(), api_key: z.unknown().optional() }).nullable(), backup_llm_config: z.object({ preference: z.string() }), built_in_tools: z.object({ end_call: z.unknown().nullable() }) }) }),
    conversation: z.object({ max_duration_seconds: z.number(), client_events: z.array(z.string()) }),
  }),
  platform_settings: z.object({ auth: z.object({ enable_auth: z.boolean() }), privacy: z.object({ record_voice: z.boolean(), retention_days: z.number() }), overrides: z.object({ custom_llm_extra_body: z.boolean(), conversation_config_override: z.object({ agent: z.object({ first_message: z.boolean() }), tts: z.object({ voice_id: z.boolean(), speed: z.boolean() }) }) }) }),
});

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  const id = process.env.ELEVENLABS_AGENT_ID;
  const secret = process.env.HANGUP_LLM_SECRET;
  if (!key || !id || !secret) throw new Error("Required server configuration is missing.");
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(id)}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Agent lookup failed (HTTP ${response.status}).`);
  const agent = AgentSchema.parse(await response.json());
  const prompt = agent.conversation_config.agent.prompt;
  const platform = agent.platform_settings;
  const overrides = platform.overrides.conversation_config_override;
  const checks = {
    "Custom LLM selected": prompt.llm === "custom-llm" && Boolean(prompt.custom_llm?.api_key),
    "Backup LLMs disabled": prompt.backup_llm_config.preference === "disabled",
    "End call tool enabled": Boolean(prompt.built_in_tools.end_call),
    "Agent is private": platform.auth.enable_auth,
    "Audio recording off": !platform.privacy.record_voice,
    "Provider retention at most one day": platform.privacy.retention_days >= 0 && platform.privacy.retention_days <= 1,
    "Director opening uses runtime variable": agent.conversation_config.agent.first_message === "{{first_message}}",
    "Required session overrides allowed": overrides.tts.voice_id && overrides.tts.speed && platform.overrides.custom_llm_extra_body,
    "Captions enabled": ["user_transcript", "agent_response"].every((event) => agent.conversation_config.conversation.client_events.includes(event)),
    "Five-minute provider limit": agent.conversation_config.conversation.max_duration_seconds <= 300,
  };
  let failed = false;
  for (const [label, pass] of Object.entries(checks)) { console.log(`${pass ? "PASS" : "FAIL"} ${label}`); if (!pass) failed = true; }
  const voices = z.record(z.string(), z.string()).parse(JSON.parse(process.env.ELEVENLABS_VOICE_IDS ?? "{}"));
  for (const [role, voice] of Object.entries(voices)) {
    const r = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voice)}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10_000) });
    const pass = r.ok && z.object({ category: z.literal("premade") }).safeParse(await r.json()).success;
    console.log(`${pass ? "PASS" : "FAIL"} Premade voice: ${role}`);
    if (!pass) failed = true;
  }
  const configuredUrl = prompt.custom_llm?.url;
  if (!configuredUrl) throw new Error("Agent Custom LLM URL missing.");
  const base = (process.argv[2] ?? configuredUrl).replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : base.endsWith("/api/llm") ? `${base}/chat/completions` : `${base}/api/llm/chat/completions`;
  try {
    // No drill ID: verifies authentication, tunnel, and SSE without database writes or model calls.
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "ngrok-skip-browser-warning": "1" }, body: JSON.stringify({ model: "hang-up-director", stream: true, messages: [] }), signal: AbortSignal.timeout(25_000) });
    const body = await r.text();
    const pass = r.ok && Boolean(r.headers.get("content-type")?.includes("text/event-stream")) && body.includes("data: [DONE]") && body.includes('"name":"end_call"');
    console.log(`${pass ? "PASS" : "FAIL"} Custom LLM reachability/authentication/SSE (HTTP ${r.status})`);
    if (!pass) failed = true;
  } catch { console.log("FAIL Custom LLM is unreachable. Start the app and tunnel, or deploy it."); failed = true; }
  console.log("No conversation, model generation, or audio session was started.");
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error("Preflight failed. Check the agent configuration and network; no secrets are printed."); process.exitCode = 1; });
