
import { parseServerEnvironment } from "@/env-schema";

/** Validated server configuration. Importing this module in a Client Component is blocked. */
export const env = parseServerEnvironment(process.env);
