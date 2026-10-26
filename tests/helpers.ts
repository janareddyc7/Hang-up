import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPersonas } from "../src/lib/engine/personas";

export function readPersonaJson(): unknown[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "personas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

export const personas = loadPersonas(readPersonaJson());
export function persona(id: string) {
  const p = personas.get(id);
  if (!p) throw new Error(`missing persona ${id}`);
  return p;
}
