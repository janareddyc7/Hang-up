import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { USER_MOVES, HARD_FAILS, type UserMove } from "../src/lib/engine/taxonomy";
import { UserMoveSchema } from "../src/lib/engine/schema";
import { cohensKappa, precisionRecall } from "../src/lib/eval/kappa";

async function main() {
  const envFile = existsSync(resolve(process.cwd(), ".env.local")) ? ".env.local" : ".env";
  loadEnv({ path: resolve(process.cwd(), envFile) });
  const [{ db }, { moveLabels, turns }] = await Promise.all([
    import("../src/db/client"),
    import("../src/db/schema"),
  ]);
  const rows = await db.select({ predicted: turns.move, gold: moveLabels.move })
    .from(moveLabels)
    .innerJoin(turns, eq(turns.id, moveLabels.turnId));
  if (rows.length === 0) {
    console.error("No human-reviewed turns are available yet.");
    process.exitCode = 1;
    return;
  }
  const parsed = rows.flatMap((row) => {
    const predicted = UserMoveSchema.safeParse(row.predicted);
    const gold = UserMoveSchema.safeParse(row.gold);
    return predicted.success && gold.success ? [{ predicted: predicted.data, gold: gold.data }] : [];
  });
  if (parsed.length === 0) throw new Error("No valid move-label pairs were found.");
  const predicted = parsed.map((row) => row.predicted);
  const gold = parsed.map((row) => row.gold);
  const kappa = cohensKappa(predicted, gold);
  let hardTruePositive = 0;
  let hardFalseNegative = 0;
  for (const row of parsed) {
    const isGoldHardFail = (HARD_FAILS as readonly string[]).includes(row.gold);
    const isPredictedHardFail = (HARD_FAILS as readonly string[]).includes(row.predicted);
    if (isGoldHardFail && isPredictedHardFail) hardTruePositive++;
    else if (isGoldHardFail) hardFalseNegative++;
  }
  const hardFailRecall = hardTruePositive + hardFalseNegative === 0 ? 1 : hardTruePositive / (hardTruePositive + hardFalseNegative);

  console.log(`Reviewed turns: ${parsed.length}`);
  console.log(`Cohen's kappa: ${kappa.toFixed(3)} (target >= 0.610)`);
  console.log(`Hard-fail recall: ${hardFailRecall.toFixed(3)} (target >= 0.950)`);
  console.log("\n| Move | Precision | Recall | Support |");
  console.log("|---|---:|---:|---:|");
  for (const move of USER_MOVES as readonly UserMove[]) {
    const metrics = precisionRecall(predicted, gold, move);
    console.log(`| ${move} | ${metrics.precision.toFixed(3)} | ${metrics.recall.toFixed(3)} | ${metrics.support} |`);
  }
  if (kappa < 0.61 || hardFailRecall < 0.95) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not calculate label agreement.");
  process.exitCode = 1;
});
