import { handleCustomLlmRequest } from "@/lib/drill/runtime";
import { getRuntimeDeps } from "@/lib/drill/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  return handleCustomLlmRequest(request, getRuntimeDeps());
}
