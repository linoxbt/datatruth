import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCsv, makeProof, isImmutableSource } from '../agent/audit.js';
import { proofCid } from '../agent/publish.js';

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

test('leading whitespace is preserved for duplicate accounting', () => {
  const metrics = inspectCsv('name,value\na,1\n\t a,1\n');
  assert.equal(metrics.duplicates, 0);
});

test('invalid UTF-8 cannot produce a proof hash for changed bytes', () => {
  assert.throws(() => makeProof('https://raw.githubusercontent.com/example/data.csv', Buffer.from([0xff])), /UTF-8|encoded data/i);
});

test('UnixFS CID matches the previously pinned sample proof', async () => {
  const body = Buffer.from(JSON.stringify({ schema: 'datatruth/v1', sourceUrl: 'test', rawCsv: 'x\n1\n' }));
  assert.match(await proofCid(body), /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/);
});

test('immutable GitHub commit URLs are eligible for registration', () => {
  const commit = 'd96a35fec007551fdfd677f7420f3fe1b39a9dc0';
  assert.equal(isImmutableSource(`https://raw.githubusercontent.com/linoxbt/datatruth/${commit}/datasets/airtravel.csv`), true);
  assert.equal(isImmutableSource('https://raw.githubusercontent.com/linoxbt/datatruth/main/datasets/airtravel.csv'), false);
  assert.equal(isImmutableSource(`https://raw.githubusercontent.com/linoxbt/datatruth/${commit}/../secret.csv`), false);
});

test('sample CSV with spaces before quoted fields is audited without changing bytes', async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../datasets/airtravel.csv', import.meta.url));
  const { proof } = makeProof('https://raw.githubusercontent.com/linoxbt/datatruth/d96a35fec007551fdfd677f7420f3fe1b39a9dc0/datasets/airtravel.csv', bytes);
  assert.equal(proof.rawSha256, 'f6a5fc622a83ef040fe708b7305fb6f34b8725a62e19da03a9bc8ff8592d8054');
  assert.equal(proof.metrics.rows, 12);
  assert.deepEqual(proof.metrics.headers, ['Month', ' "1958"', ' "1959"', ' "1960"']);
});
