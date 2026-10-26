type DrillLogEvent = {
  event: "drill.turn.completed";
  drillId: string;
  move: string;
  decidedBy: "rule" | "classifier" | "fallback";
  durationMs: number;
};

/** Structured allowlist logger. Transcript text, wallet details, and phone data cannot be passed. */
export function logDrillEvent(event: DrillLogEvent): void {
  console.info(JSON.stringify({
    ...event,
    durationMs: Math.max(0, Math.round(event.durationMs)),
    timestamp: new Date().toISOString(),
  }));
}

export function logRequestError(input: {
  errorType: string;
  method: string;
  route: string;
  routeType: string;
}): void {
  console.error(JSON.stringify({
    event: "request.error",
    ...input,
    timestamp: new Date().toISOString(),
  }));
}
