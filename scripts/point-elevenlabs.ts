import { config } from "dotenv";
import { z } from "zod";
config({ path: ".env.local", quiet: true });

async function main() {
  const url = z.url().parse(process.argv[2]).replace(/\/+$/, "");
  if (!url.startsWith("https://") || !url.endsWith("/api/llm")) throw new Error("Use the deployed HTTPS /api/llm base URL.");
  const key = process.env.ELEVENLABS_API_KEY;
  const id = process.env.ELEVENLABS_AGENT_ID;
  const secret = process.env.HANGUP_LLM_SECRET;
  if (!key || !id || !secret) throw new Error("Missing agent settings.");
  const probe = await fetch(`${url}/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }), signal: AbortSignal.timeout(15_000),
  });
  console.log(`Endpoint probe: HTTP ${probe.status}`);
  if (!probe.ok || !(await probe.text()).includes("data: [DONE]")) throw new Error("Endpoint preflight failed.");
  const headers = { "xi-api-key": key, "content-type": "application/json" };
  const endpoint = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(id)}`;
  const before = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
  console.log(`Agent lookup: HTTP ${before.status}`);
  if (!before.ok) throw new Error("Agent lookup failed.");
  const agent = z.object({ conversation_config: z.object({ agent: z.object({ prompt: z.object({ custom_llm: z.object({ url: z.string() }).passthrough() }) }) }) }).parse(await before.json());
  if (!process.argv.includes("--apply")) { console.log("Endpoint authenticated. Dry run: agent would use the deployed app instead of the local tunnel."); return; }
  const response = await fetch(endpoint, {
    method: "PATCH", headers,
    body: JSON.stringify({ conversation_config: { agent: { prompt: { llm: "custom-llm", custom_llm: { ...agent.conversation_config.agent.prompt.custom_llm, url } } } } }),
    signal: AbortSignal.timeout(15_000),
  });
  console.log(`Agent update: HTTP ${response.status}`);
  if (!response.ok) {
    const failure: unknown = await response.json();
    const detail = z.object({ detail: z.object({ status: z.string().optional(), message: z.string().optional() }) }).safeParse(failure);
    if (detail.success) console.error((detail.data.detail.message ?? detail.data.detail.status ?? "Update rejected").replaceAll(key, "[redacted]").replaceAll(secret, "[redacted]").slice(0, 400));
    throw new Error("Agent update rejected.");
  }
  console.log(`Agent Custom LLM now uses ${url}. No tunnel or paid conversation required.`);
}
main().catch(() => { console.error("Agent URL update failed. No secrets printed."); process.exitCode = 1; });
