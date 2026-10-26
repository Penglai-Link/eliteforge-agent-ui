// Generated fixture owned by framework/core. Set FRAMEWORK_TOOL_BATCH_FIXTURE
// during cross-project regression to verify the vendored standalone fixture.
import { readFileSync } from "node:fs";
import local from "./tool-batch.json";
export const batchFixture = process.env.FRAMEWORK_TOOL_BATCH_FIXTURE
  ? JSON.parse(readFileSync(process.env.FRAMEWORK_TOOL_BATCH_FIXTURE, "utf8")) : local;
export const vendoredBatchFixture = local;
