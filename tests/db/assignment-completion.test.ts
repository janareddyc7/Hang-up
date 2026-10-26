import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { DrizzleDrillStore } from "@/lib/drill/drizzle-store";
import { createDrill, finishDrill } from "@/lib/drill/runtime";
import { personas as sourcePersonas } from "../helpers";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const pool = testUrl ? new Pool({ connectionString: testUrl }) : null;
const database = pool ? drizzle(pool, { schema }) : null;

suite("assigned practice completion (TEST_DATABASE_URL)", () => {
  const userId = `assignment-user-${crypto.randomUUID()}`;
  const circleId = `assignment-circle-${crypto.randomUUID()}`;
  const assignmentId = `assignment-${crypto.randomUUID()}`;
  const drillId = `assignment-drill-${crypto.randomUUID()}`;
  const persona = sourcePersonas.get("tech-support")!;
  const deps = {
    store: database ? new DrizzleDrillStore(database) : null!,
    personas: new Map([[persona.id, persona]]),
    now: () => Date.UTC(2026, 0, 1),
    newId: () => drillId,
  };

  beforeAll(async () => {
    await database!.insert(schema.user).values({ id: userId, name: "Assignment test", email: `${userId}@example.test`, emailVerified: true });
    await database!.insert(schema.circles).values({ id: circleId, name: "Assignment test circle", createdBy: userId });
    await database!.insert(schema.assignments).values({ id: assignmentId, circleId, coachId: userId, traineeId: userId, personaId: persona.id, difficulty: "realistic" });
  });

  afterAll(async () => {
    if (!database) return;
    await database.delete(schema.user).where(eq(schema.user.id, userId));
    await pool?.end();
  });

  it("marks the originating assignment complete in the finish transaction", async () => {
    const drill = await createDrill(deps, { personaId: persona.id, difficulty: "realistic", userId, mode: "assigned", assignmentId, seed: "assigned-test" });
    await finishDrill(deps, drill.drillId);
    const [assignment] = await database!.select().from(schema.assignments).where(eq(schema.assignments.id, assignmentId));
    expect(assignment?.completedDrillId).toBe(drillId);
    await finishDrill(deps, drill.drillId);
    const [unchanged] = await database!.select().from(schema.assignments).where(eq(schema.assignments.id, assignmentId));
    expect(unchanged?.completedDrillId).toBe(drillId);
  });
});
