import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { HttpError } from './http.js';

export const MAX_BYTES = 1_000_000;
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const isImmutableSource = (url) => typeof url === 'string' &&
  /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[0-9a-f]{40}\/[A-Za-z0-9_./-]+$/.test(url) &&
  !url.split('/').includes('..');

export function inspectCsv(raw) {
  const records = parse(raw, { bom: true, skip_empty_lines: true, relax_quotes: true, skip_records_with_empty_values: false });
  if (records.length < 2) throw new Error('CSV needs a header and at least one data row');
  const headers = records[0];
  if (headers.length === 0 || headers.some((h) => !h.trim())) throw new Error('CSV headers must be nonempty');
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique');
  const data = records.slice(1);
  if (data.some((row) => row.length !== headers.length)) throw new Error('CSV has rows with a different column count');
  const missing = headers.map((_, i) => data.filter((row) => row[i].trim() === '').length);
  const duplicates = data.length - new Set(data.map((row) => JSON.stringify(row))).size;
  return { rows: data.length, columns: headers.length, headers, missing, duplicates };
}

export function makeProof(url, input) {
  const rawBytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const bytes = rawBytes.length;
  if (bytes > MAX_BYTES) throw new Error('Dataset exceeds the 1 MB demo limit');
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  const metrics = inspectCsv(raw);
  const proof = { schema: 'datatruth/v1', sourceUrl: url, rawSha256: sha256(rawBytes), metrics, rawCsv: raw };
  const body = Buffer.from(JSON.stringify(proof));
  return { proof, body, proofSha256: sha256(body) };
}

export function validateDatasetUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) throw new HttpError(400, 'Provide a valid dataset URL');
  let parsed;
  try { parsed = new URL(url); } catch { throw new HttpError(400, 'Provide a valid dataset URL'); }
  if (parsed.protocol !== 'https:') throw new HttpError(400, 'Use an HTTPS dataset URL');
  if (!['raw.githubusercontent.com', 'gist.githubusercontent.com', 'people.sc.fsu.edu', 'data.gov'].includes(parsed.hostname)) {
    throw new HttpError(400, 'Dataset host is not on the demo allowlist');
  }
  return parsed.href;
}

export async function fetchCsv(url) {
  url = validateDatasetUrl(url);
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' }); }
  catch { throw new HttpError(502, 'Dataset source is unavailable'); }
  if (response.status >= 300 && response.status < 400) throw new HttpError(502, 'Dataset source redirected unexpectedly');
  if (!response.ok) throw new HttpError(502, `Dataset returned HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new HttpError(413, 'Dataset exceeds the 1 MB demo limit');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) { await response.body.cancel().catch(() => {}); throw new HttpError(413, 'Dataset exceeds the 1 MB demo limit'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
