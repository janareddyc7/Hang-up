/**
 * OpenAI Chat Completions compatibility for the ElevenLabs Custom LLM route.
 *
 * ElevenLabs POSTs to `<server URL>/chat/completions` with `stream: true` and
 * expects Server-Sent Events: `data: {chunk}\n\n` frames ending in `data: [DONE]\n\n`.
 * Extra values passed at conversation start arrive in `elevenlabs_extra_body`.
 * System tools (like end_call) are listed in `tools` and are invoked by
 * returning an OpenAI-format tool call.
 */
import { z } from "zod";

export const IncomingMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.null(), z.array(z.any())]).optional(),
  })
  .passthrough();

export const CustomLlmRequestSchema = z
  .object({
    model: z.string().default("hang-up-director"),
    messages: z.array(IncomingMessageSchema),
    stream: z.boolean().optional(),
    tools: z.array(z.any()).optional(),
    user_id: z.string().optional(),
    elevenlabs_extra_body: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type CustomLlmRequest = z.infer<typeof CustomLlmRequestSchema>;

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
      .join("");
  return "";
}

/** The latest thing the person said, or null if the conversation has no user turn yet. */
export function latestUserText(req: CustomLlmRequest): string | null {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]!;
    if (m.role === "user") return contentText(m.content);
  }
  return null;
}

/** True when ElevenLabs offered the end_call system tool in this request. */
export function hasEndCallTool(req: CustomLlmRequest): boolean {
  return (req.tools ?? []).some(
    (t) => t && typeof t === "object" && (t as { function?: { name?: string } }).function?.name === "end_call",
  );
}

interface ChunkMeta {
  id: string;
  model: string;
  created?: number;
}

function frame(meta: ChunkMeta, delta: Record<string, unknown>, finish: string | null): string {
  const chunk = {
    id: meta.id,
    object: "chat.completion.chunk",
    created: meta.created ?? Math.floor(Date.now() / 1000),
    model: meta.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export const DONE_FRAME = "data: [DONE]\n\n";

/**
 * A short opener that ends in "... " so ElevenLabs can start speaking while the
 * line is generated (ElevenLabs "buffer words"; the trailing space matters).
 */
export function bufferFrame(meta: ChunkMeta, words = "Okay... "): string {
  return frame(meta, { role: "assistant", content: words.endsWith("... ") ? words : `${words.trimEnd()}... ` }, null);
}

/** Splits a finished line into a few text frames plus the stop frame and [DONE]. */
export function textFrames(meta: ChunkMeta, text: string, wordsPerChunk = 6): string[] {
  const words = text.split(/(\s+)/);
  const frames: string[] = [];
  let buf = "";
  let count = 0;
  for (const w of words) {
    buf += w;
    if (w.trim()) count++;
    if (count >= wordsPerChunk) {
      frames.push(frame(meta, { content: buf }, null));
      buf = "";
      count = 0;
    }
  }
  if (buf) frames.push(frame(meta, { content: buf }, null));
  frames.push(frame(meta, {}, "stop"));
  frames.push(DONE_FRAME);
  return frames;
}

/** Ends the conversation through ElevenLabs' end_call system tool. */
export function endCallFrames(meta: ChunkMeta, reason: string, message?: string): string[] {
  const args = JSON.stringify(message ? { reason, message } : { reason });
  return [
    frame(
      meta,
      {
        role: "assistant",
        tool_calls: [{ index: 0, id: `call_${meta.id}`, type: "function", function: { name: "end_call", arguments: args } }],
      },
      null,
    ),
    frame(meta, {}, "tool_calls"),
    DONE_FRAME,
  ];
}

export function sseResponse(frames: string[] | AsyncIterable<string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const f of frames as AsyncIterable<string>) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
