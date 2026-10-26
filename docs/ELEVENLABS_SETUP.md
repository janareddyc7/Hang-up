# ElevenLabs setup checklist

The agent can be configured through the dashboard or authenticated API. `scripts/configure-elevenlabs.ts` validates six premade voices and prints a dry run; `--apply` enables private sessions, the required overrides, End call, no audio recording, and one-day provider retention. It does not generate audio. Use separate agents and databases when adding a separate preview environment.

## 1. Agent

- [ ] **Agents → New agent → Blank.** Name it per environment.
- [ ] **First message:** set exactly `{{first_message}}`. Add a `first_message` dynamic variable placeholder with a generic practice disclosure for dashboard previews. The app supplies the selected Director opening as `dynamicVariables.first_message`, matching the first stored turn. Do not send an `agent.firstMessage` session override: the provider rejected that field on live sessions even when its configuration reported the override enabled.
- [ ] **System prompt:** one line, e.g. "Responses come from a custom server." (Our route ignores it and builds its own prompt.)
- [ ] **Language:** English.

## 2. LLM: point it at our route

- [ ] **LLM → Custom LLM.**
- [ ] **Server URL:** `https://<your-host>/api/llm` (ElevenLabs appends `/chat/completions` itself). API type: Chat Completions.
- [ ] **Model ID:** `hang-up-director` (any string; it comes back to us as `model`).
- [ ] **API key:** create a secret with a long random value and put the same value in `HANGUP_LLM_SECRET`. ElevenLabs sends it as `Authorization: Bearer ...`.
- [ ] Use **Test connection**. Expect a streamed reply ("Sorry, wrong number." is correct without a drill).
- [ ] Turn **backup LLM cascading off**, so turns never bypass our route.

Local development: ElevenLabs must reach your laptop. Run a tunnel (`pnpm dlx cloudflared tunnel --url http://localhost:3000` or ngrok) and use the tunnel URL in the dev agent.

## 3. Tools

- [ ] Enable the **End call** system tool. Our route triggers it with an OpenAI-format `end_call` tool call.
- [ ] Leave every other tool off (no language detection, transfers, knowledge base).

## 4. Voice

- [ ] Pick a **premade library voice** as the agent's default voice. The app overrides it with the persona's premade voice role. Never clone a voice.
- [ ] Put the IDs in `ELEVENLABS_VOICE_IDS` as JSON.
- [ ] Choose a low-latency conversational TTS model.

## 5. Security

- [ ] **Enable authentication** (private agent), so sessions need a server-issued conversation token or signed URL.
- [ ] **Overrides:** allow Voice ID, Speed, and Custom LLM extra body. The app sends these fields and they must be enabled. The opening uses a dynamic variable. Leave system prompt, model, and tool overrides off.
- [ ] Add your app domains to the **allowlist**.
- [ ] Set **maximum conversation duration** to 5 minutes.

## 6. Events for captions

- [ ] In **Advanced → Client events**, enable user transcripts and agent responses so `onMessage` delivers live captions. Enable `agent_chat_response_part` if you want streaming captions in voice mode.

## 7. Privacy

- [ ] Set conversation **retention** to the shortest period you can work with; turn **audio saving off**.

## 8. Post-call webhook

- Optional for browser calls. For scheduled Practice Calls, configure **Agents settings → Post-call webhook:** `https://<your-host>/api/webhooks/elevenlabs`, transcription webhook on, audio webhook off. The app uses the signed event only to finish its own drill; it does not save the provider transcript or audio.
- When configured, copy the HMAC secret into `ELEVENLABS_WEBHOOK_SECRET`. The route validates the raw body signature and timestamp.

## 9. Phone (phase 4 only)

- [ ] Buy a Twilio number; import it into ElevenLabs (**Phone numbers → Import**); assign the agent.
- [ ] Put its ID in `ELEVENLABS_PHONE_NUMBER_ID`.
- [ ] Read `docs/SAFETY.md` → Practice Calls before placing any call, and describe the use case to ElevenLabs first.

## 10. Policy

Read the ElevenLabs Prohibited Use Policy (elevenlabs.io/use-policy). Our design keeps clear of it: fictional organizations, no cloning, every drill started by or consented to by the person in it, phone drills identify themselves.

## Testing the agent

`pnpm check:elevenlabs` is read-only: it checks the saved agent settings, each premade voice, and an authenticated no-drill SSE probe at the configured URL. It creates no drill, invokes no model, and uses no voice minutes. To change the endpoint, use `pnpm exec tsx scripts/point-elevenlabs.ts https://<host>/api/llm --apply`; it probes the endpoint before changing it.

The configured app agent uses `https://hang-up-theta.vercel.app/api/llm`. Browser calls no longer depend on a laptop tunnel. The old six voice IDs returned `voice_not_found`; the current mapping was verified as `premade`. On 26 October 2026, a production browser voice check connected, showed the Director's opening, and played unmuted audio with playback time advancing. The check was ended after four seconds and reached a saved replay. This verifies startup and playback; a full spoken exchange was outside that limited check.

ElevenLabs' `simulate-conversation` endpoint is deprecated (removal announced for 31 Oct 2026). Use our local bot harness (`pnpm bots`), which calls `runTurn()` directly, or the newer agent-testing endpoints (`/v1/convai/agent-testing/create`, `/v1/convai/agents/:agent_id/run-tests`) if you want ElevenLabs-side tests.
