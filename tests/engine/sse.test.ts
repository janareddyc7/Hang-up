import { describe, expect, it } from "vitest";
import {
  bufferFrame,
  CustomLlmRequestSchema,
  DONE_FRAME,
  endCallFrames,
  hasEndCallTool,
  latestUserText,
  sseResponse,
  textFrames,
} from "../../src/lib/llm/sse";

const meta = { id: "abc", model: "hang-up-director", created: 1 };

function parse(frames: string[]) {
  return frames.filter((f) => f !== DONE_FRAME).map((f) => JSON.parse(f.replace(/^data: /, "")));
}

describe("custom LLM wire format", () => {
  it("parses an ElevenLabs request with extra body and tools", () => {
    const req = CustomLlmRequestSchema.parse({
      model: "x",
      stream: true,
      messages: [
        { role: "system", content: "sys" },
        { role: "assistant", content: "Hello, this is Agent Reyes." },
        { role: "user", content: "Who is this?" },
      ],
      tools: [{ type: "function", function: { name: "end_call", parameters: {} } }],
      elevenlabs_extra_body: { drill_id: "d1" },
    });
    expect(latestUserText(req)).toBe("Who is this?");
    expect(hasEndCallTool(req)).toBe(true);
    expect(req.elevenlabs_extra_body?.drill_id).toBe("d1");
  });

  it("streams text as chat.completion.chunk frames ending with stop and [DONE]", () => {
    const frames = textFrames(meta, "Stay on the line with me, this will only take a minute of your time.");
    expect(frames.at(-1)).toBe(DONE_FRAME);
    const chunks = parse(frames);
    const text = chunks.map((c) => c.choices[0].delta.content ?? "").join("");
    expect(text).toBe("Stay on the line with me, this will only take a minute of your time.");
    expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
    expect(chunks[0].object).toBe("chat.completion.chunk");
  });

  it("ends calls with an OpenAI-format end_call tool call", () => {
    const chunks = parse(endCallFrames(meta, "scammer_gave_up", "Goodbye."));
    const call = chunks[0].choices[0].delta.tool_calls[0];
    expect(call.function.name).toBe("end_call");
    expect(JSON.parse(call.function.arguments)).toEqual({ reason: "scammer_gave_up", message: "Goodbye." });
    expect(chunks.at(-1).choices[0].finish_reason).toBe("tool_calls");
  });

  it("buffer words end with an ellipsis and a space", () => {
    const chunk = JSON.parse(bufferFrame(meta, "Ma'am, listen").replace(/^data: /, ""));
    expect(chunk.choices[0].delta.content).toBe("Ma'am, listen... ");
  });

  it("returns an event-stream response", async () => {
    const res = sseResponse(textFrames(meta, "Hi."));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toContain("[DONE]");
  });
});
