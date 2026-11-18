import { writeFileSync } from 'node:fs';
import { formatReport, runReport } from './testing/report';

// Full measurement (minutes): MIC_EVAL=/tmp/report.md npx vitest run src/core/audio/micEval.test.ts
const out = process.env['MIC_EVAL'];

describe.skipIf(!out)('microphone detector, full measurement', () => {
  it('writes the report', () => {
    const report = runReport();
    writeFileSync(out ?? '', formatReport(report));
  }, 1_800_000);
});
