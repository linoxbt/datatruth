# DataTruth

DataTruth is a Studio Next prototype for auditable public CSV snapshots. It counts rows, columns, missing cells and duplicate rows, hashes the exact downloaded UTF-8 bytes, and publishes a JSON proof to IPFS when a pinning service is configured. A GenLayer Intelligent Contract holds a native GEN bond. A challenger files an independently reproduced proof of an immutable GitHub commit URL. GenLayer validators check that proof against GitHub, compare the provider's proof, and send the bond to the provider (Verified) or challenger (Rejected).

## Current deployment

- Frontend and auditor: [Cloudflare Worker](https://datatruth.alemzdelight.workers.dev/). The Worker currently has **no `PINATA_JWT` secret**, so live audits are previews and cannot be registered from the UI.
- Active Studio Next contract: `0xCBC1Da22dB670Fd8E37B9E6738d2f8592C8a9f6e` on `studio-dev` (chain ID 61997). The full manifest is [`deployments/studio-dev-v2.json`](deployments/studio-dev-v2.json).
- Audit ID 0 finished **Verified**; audit ID 1 finished **Rejected**. Both 0.01 GEN bond payouts were observed, leaving the active contract balance at zero. Transaction hashes are in the manifest.
- The original contract and V2.0 test deployment remain accessible at the addresses in [`deployments/studio-dev.json`](deployments/studio-dev.json) and [`deployments/studio-dev-v2-legacy.json`](deployments/studio-dev-v2-legacy.json). Each has a Pending test audit with a 0.01 test GEN bond. Their deployer can call `release_unchallenged(0)` after seven days from registration, provided no challenge occurs. They are not the frontend's active contract.

Studio Next is a development preview, not a production network. Studio does not support the Solidity ERC-721 and EVM adapter flow proposed in the initial blueprint. This implementation uses a GenLayer-native registry and dispute method instead. It is **not an NFT** and should not be described as one.

## How the active flow works

1. `POST /api/audit` downloads a CSV from an allowlisted HTTPS host, refusing redirects and responses larger than 1 MB. It computes reproducible metrics and an exact raw-byte SHA-256.
2. The auditor serializes the CSV snapshot, source URL and metrics into a proof. It computes a CIDv0 using the maintained UnixFS importer. If `PINATA_JWT` or `IPFS_API_URL` is configured, it pins the same bytes and checks the returned CID. Otherwise it returns a clearly labeled preview.
3. Registration is enabled only for an IPFS-published proof of a `raw.githubusercontent.com` URL pinned to a full 40-character commit SHA. The provider sends the configured 0.01 GEN bond to `register_audit`.
4. Within seven days, a different account may call `file_claim(audit_id, competing_cid, competing_proof_sha256)`. Validators fetch the competing proof and independently fetch the immutable GitHub source. An invalid claim fails before a dispute is opened.
5. Anyone can call `resolve(audit_id)`. Validators check the provider's proof against the proven source hash, then set Verified or Rejected and emit the bond transfer to the provider or challenger. A missing provider proof can be retried; after 30 days from challenge it is rejected for nonavailability.
6. If nobody challenges within seven days, only the provider can call `release_unchallenged(audit_id)` and reclaim the bond. The status is Unchallenged, not Verified.

The UI shows the submitted transaction hash immediately and checks both finality and execution success. A timeout leaves the hash available for status checking; do not blindly resubmit the write. The claim panel accepts a competing proof CID and SHA-256. A published audit result can fill these fields. Challenged records poll for status changes.

## Development

Node 22 or later is required. Use `npm ci`, `npm test`, `npm run build`, then `npm run server` and `npm run dev` in separate terminals. Copy `.env.example` to `.env` for local settings. The local auditor uses `IPFS_API_URL=http://127.0.0.1:5001` by default; run a private Kubo API at that address to publish locally. The Cloudflare Worker cannot reach your machine's localhost.

The sample CSV is [`datasets/airtravel.csv`](datasets/airtravel.csv). Its immutable GitHub URL is prefilled in the UI. Local Kubo pinned the two proofs used in the on-chain tests, and the public Pinata gateway returned bytes matching their SHA-256 hashes. For durable hosted pinning, configure a pinning provider rather than relying on this workstation.

## Cloudflare deployment

`wrangler.jsonc` serves the Vite `dist` assets and routes `/api/audit` to the Worker. It includes global and per-client rate limits plus a Durable Object that caps publishing attempts at 50 per UTC day across Cloudflare locations. The short-term limits are permissive and local to each Cloudflare location. The Worker has logs and traces enabled.

```bash
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
npx wrangler secret put PINATA_JWT
npx wrangler deploy
```

Enter the JWT only at Wrangler's private prompt. Never place it in a `VITE_` variable, Git, or chat. Verify `npx wrangler secret list --name datatruth` lists `PINATA_JWT`, then run a live audit and confirm `published: true` before registering. The sample proof can be viewed without a new pin.

## Netlify

`netlify.toml` and `netlify/functions/audit.js` remain configured. Netlify deployment is currently paused by the account's credit limit, so this path has not been validated live. A Netlify deploy also needs a `PINATA_JWT` function environment variable. Its public audit endpoint does not yet have platform-backed rate limiting; do not enable paid pinning there without adding abuse controls.

## Contract deployment and tests

[`contracts/DataTruthV2.py`](contracts/DataTruthV2.py) is the active contract source. [`scripts/deploy-v2.mjs`](scripts/deploy-v2.mjs) deploys it to Studio Next using a local encrypted keystore and a separate password file. Set `DATATRUTH_KEYSTORE` and `DATATRUTH_PASSWORD_FILE` to their paths. Never commit either file. The deploy script verifies the transaction and writes `deployments/studio-dev-v2.json`; check any existing test bonds before replacing an address. The scripts `register-sample.mjs`, `file-claim.mjs` and `resolve-claim.mjs` execute the corresponding writes, including GenLayer's message allocation tree for bond transfers.

The test cycle was performed on Studio Next: register valid proof → file independently reproduced claim → resolve Verified; register intentionally false metrics → file valid claim → resolve Rejected. The active contract balance was zero afterward and the challenger balance rose by 0.01 GEN on rejection. Automated tests cover CSV parsing, byte integrity, CID calculation, URL eligibility, API routing, validation and size limits. The on-chain transactions provide integration evidence but are not a substitute for a formal contract audit.

## Scope and limitations

- The current metrics count duplicates but do not export a cleaned dataset. A demographic bias scan needs a declared protected attribute and outcome definition; none is inferred from arbitrary CSV columns.
- The contract proves an immutable GitHub source snapshot and reproducible metrics when challenged. Pending and Unchallenged records are **not verified quality guarantees**. It does not prove a model trained on that data is unbiased or fit for use.
- No ERC-721, automated schedule, QR code or GenLayer event listener is implemented. The registry uses audit IDs and the UI polls challenged records.
- Hosted IPFS pinning, stronger bot protection for a commercial launch, Netlify deployment, and production network migration remain outstanding. See [`AUDIT_STATUS.md`](AUDIT_STATUS.md).
