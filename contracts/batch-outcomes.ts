// Captured by actual framework execution and checked by Tron's SQLite replay tests.
import { readFileSync } from "node:fs";
import local from "./batch-outcomes.json";

export const outcomeFixture: typeof local = process.env.FRAMEWORK_BATCH_OUTCOMES_FIXTURE
  ? JSON.parse(readFileSync(process.env.FRAMEWORK_BATCH_OUTCOMES_FIXTURE, "utf8")) : local;
export const vendoredOutcomeFixture = local;
