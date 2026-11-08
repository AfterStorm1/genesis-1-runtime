// A14：端到端最小链路（附件 A 8.2 十二步 + 附件 B）
import { describe, expect, it } from "vitest";
import { formatE2eLog, runMinimalE2e } from "../../main";
import { writeEvidenceLog } from "../helpers/evidence";

describe("A14 e2e minimal", () => {
  it(
    "12 步断言全绿并输出 e2e-minimal.log",
    async () => {
      const result = await runMinimalE2e({ doneDelayMs: 10 });
      const log = formatE2eLog(result);
      writeEvidenceLog("e2e-minimal", [log], result.passed);
      if (!result.passed) {
        for (const s of result.steps.filter((x) => !x.pass)) {
          // eslint-disable-next-line no-console
          console.error(`FAIL step ${s.id}: ${s.name} — ${s.detail}`);
        }
      }
      expect(result.passed).toBe(true);
      expect(result.steps).toHaveLength(12);
    },
    20_000,
  );
});
