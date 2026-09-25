# Audit status — 2026-09-25

## Verified fixes

| Original finding | Change | Evidence |
|---|---|
| Provider proof was self-attested | V2.1 accepts only immutable GitHub commit URLs; a challenger must provide a proof that validators compare with GitHub before a dispute opens | Studio Next claim transaction `0x28100e8bb36b9b1f37ae6cf7da2635a493c1bc8a2bf084e04ed43aba7821fb08` finalized |
| No competing evidence | `file_claim(id, cid, hash)` stores a validated competing proof | Active audit 0 became Challenged, then Verified |
| Wrong verdict or payout risk | Added active V2.1 contract, checked finalized execution, and forwarded fee message allocations | Verified resolve `0x516ae2dfc621f141d345e07f8f4a63e0965da9e5dbaa0be475d5f441cb43307b`; Rejected resolve `0x94d78366033c58134a6035554488e252d3e712f8f4c76829923e45b8c899ba5f`; contract balance 0 |
| Unbounded challenge window | Claims must be filed before the seven-day deadline | V2.1 source and deployed schema |
| Indefinite missing-proof lock | Missing provider proof is retryable, then rejectable after 30 days | V2.1 source; timeout path has not been exercised on chain |
| JavaScript/Python CSV mismatch | Aligned quoted-field and whitespace parsing; added sample and adversarial tests | `npm test`; sample metrics match Python |
| Raw hash could differ from downloaded bytes | Audit accepts a byte buffer, rejects invalid UTF-8 and hashes exact input | Unit test and live sample hash |
| Finalized transaction could be reported as success on execution failure | UI and scripts call `isSuccessful`, retain submitted hash, and support status recheck | Successful and failed Studio Next transaction receipts inspected |
| Incorrect audit ID, stale record and floating-point GEN conversion | Safe ID validation, stale-record clearing and exact decimal-to-wei parsing | Build and local tests |
| Unknown Worker API route returned HTML 200 | Explicit JSON 404 for `/api/*`; streamed request limits and proper 413/429 responses | API tests and Wrangler dry run |
| Public pinning could be abused | Added Worker global and per-client rate limits plus a persistent 50-request daily publishing cap in a Durable Object | Cloudflare deployment `6de74c7b-5936-4cf3-8a13-61cad59fb404` showed all three bindings; unit tests cover quota rejection |
| Critical and high dependency advisories | Replaced `ipfs-only-hash`, updated Vite and csv-parse | `npm audit`: 0 critical, 0 high, 5 moderate |
| Keystore readable by other local users | Set DataTruth deployer keystore mode to 0600 | `stat` confirmed 0600 |

## Open items

| Severity | Item | State / required action |
|---|---|---|
| High | Hosted IPFS pinning absent from Cloudflare Worker | `npx wrangler secret list --name datatruth` returned `[]` on 2026-09-25. Add `PINATA_JWT` privately, then run a live `published:true` audit. Local Kubo was used for the on-chain proof tests. |
| High | Production network and durable service not established | Studio Next is a preview. Move to a supported production network and durable pinning before using valuable GEN or commercial datasets. |
| Medium | Public paid pinning can be exhausted by a bot | The Durable Object caps total publishing attempts at 50 per UTC day. Add Turnstile or an authenticated customer quota before a public commercial launch. |
| Medium | Solidity ERC-721 and adapter | Studio Next does not support the proposed EVM flow. V2.1 is a GenLayer-native registry and court, not an NFT. A separate EVM network and bridge design would be required. |
| Medium | Duplicate removal and bias scan | Duplicate counts work; cleaned CSV output and explicitly configured group/outcome fairness metrics remain unimplemented. |
| Medium | No automated re-audit or QR code | Optional hackathon extensions not yet built. |
| Low | Netlify deployment | Cloudflare is the active deployment. The Netlify configuration remains in the repo, but account credits prevent a separate live deployment. |
| Medium | Contract branch coverage | Verified and Rejected payouts passed live. Seven-day release and 30-day nonavailability cannot be time-advanced on Studio Next and need simulator tests. |
| Medium | Five npm advisories | All are moderate and reside in development tooling through the GenLayer CLI; no critical/high advisories remain. |
| Low | Frontend bundle | GenLayer SDK is lazy-loaded; initial JavaScript is about 152 KB minified / 50 KB gzip. The deployed browser flow passed after this change. Further tuning can follow measured Core Web Vitals. |

**Production readiness: No.** The live site remains a public prototype. Do not call Pending or Unchallenged records verified, and do not accept commercial data-quality guarantees until the open high-severity items and full contract testing are resolved.
