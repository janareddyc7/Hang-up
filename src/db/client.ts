import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to use the database");

const pool = new Pool({ connectionString });
attachDatabasePool(pool);
export const db = drizzle(pool, { schema });
