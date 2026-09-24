import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCsv, makeProof } from '../agent/audit.js';

test('counts quoted fields, missing cells and duplicate rows', () => {
  const metrics = inspectCsv('name,group,score\n"Ada, A",A,5\nBob,B,\n"Ada, A",A,5\n');
  assert.deepEqual(metrics, { rows: 3, columns: 3, headers: ['name', 'group', 'score'], missing: [0, 0, 1], duplicates: 1 });
});

test('rejects malformed row widths', () => {
  assert.throws(() => inspectCsv('a,b\n1\n'), /Invalid Record Length/);
});

test('proof bytes and hashes are stable', () => {
  const first = makeProof('https://raw.githubusercontent.com/example/data.csv', 'a,b\n1,2\n');
  const second = makeProof('https://raw.githubusercontent.com/example/data.csv', 'a,b\n1,2\n');
  assert.equal(first.proofSha256, second.proofSha256);
  assert.equal(first.proof.rawSha256.length, 64);
  assert.equal(first.proof.metrics.rows, 1);
});
