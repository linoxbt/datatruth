# DataTruth

DataTruth audits a public CSV, creates a content-addressed evidence file, and lets a GenLayer Intelligent Contract decide whether a challenged audit is internally valid. The provider deposits a native GEN bond. A valid audit returns it to the provider; a falsified audit awards it to the challenger. The provider may reclaim an unchallenged bond after seven days.

## Architecture

1. The Node auditor downloads an allowlisted HTTPS CSV (1 MB maximum), parses quoted CSV fields, and counts rows, columns, missing values, and duplicate rows.
2. It builds a JSON proof with the CSV snapshot, metrics, source URL, and SHA-256 digest. With `IPFS_API_URL` configured, it uploads and pins the exact bytes to a Kubo-compatible IPFS API, checking the returned CID.
3. The provider registers the CID and proof hash with `register_audit`, sending the configured GEN bond. The contract assigns an audit ID and stores a Pending record.
4. A third party calls `challenge`. Anyone then calls `resolve`; GenLayer validators independently fetch the proof through the IPFS gateway and agree on its validity with `strict_eq`. The contract verifies the proof hash and recomputes the CSV statistics before scheduling the bond payment on finality.

The audit ID is a GenLayer registry record. This MVP does **not** mint an ERC-721. It also checks proof integrity and reproducibility, **not** truthfulness or demographic bias of the source dataset. A source URL is recorded for provenance but is not cryptographic proof that the CSV came from that URL. For stronger provenance, use a signed snapshot or immutable source reference.

## Run locally

Requirements: Node 20+, npm, a GenLayer compatible wallet, and a running Kubo IPFS daemon with API access. For an audit preview, Kubo is optional; a locally computed CID is shown, but registration is disabled until the proof is published.

```bash
cp .env.example .env
npm install
npm run server
npm run dev
```

Open the URL printed by Vite. The sample public CSV URL is prefilled. Set `IPFS_API_URL=http://127.0.0.1:5001` in `.env` for a local Kubo daemon. The API is called by the Node server, so browser CORS configuration is unnecessary.

To start Kubo with Docker and persistent storage:

```bash
docker volume create datatruth_ipfs
docker run -d --name datatruth-ipfs --restart unless-stopped \
  -v datatruth_ipfs:/data/ipfs -p 127.0.0.1:5001:5001 \
  -p 127.0.0.1:18080:8080 ipfs/kubo:latest
```

The API and gateway are bound to localhost. Keep the API private; the public gateway URL used by the contract is separate.

## Deploy to GenLayer

The current deployment is on **Studio Next**, named `studio-dev` in the GenLayer CLI and SDK (chain ID 61997). Its address and deploy transaction are in [`deployments/studio-dev.json`](deployments/studio-dev.json). The constructor bond is in wei; `10000000000000000` is 0.01 GEN. The frontend defaults in `.env.example` point to this deployment.

To deploy a separate copy using the included CLI version:

```bash
./node_modules/.bin/genlayer network set studio-dev
./node_modules/.bin/genlayer deploy --contract contracts/DataTruth.py --args 10000000000000000
```

Set `VITE_GENLAYER_CONTRACT` to the finalized Intelligent Contract address, `VITE_GENLAYER_NETWORK=studio-dev`, and `VITE_BOND_GEN` to the human-readable bond. Restart Vite. Connect an EIP-1193 wallet with enough Studio Next test GEN for the bond and GenLayer protocol fees. Studio Next account balances and deployments may reset; use the deployment manifest as the recorded result of this build.

The UI waits for GenLayer transaction finalization. Its View button reads the current registry record. The CLI account keystore and password are local to the deployer machine and must never be committed. For a smoke registration with that local account, set `DATATRUTH_KEYSTORE` and `DATATRUTH_PASSWORD_FILE` to their paths and run `node --env-file=.env scripts/register-sample.mjs`.

## Verify

```bash
npm test
npm run build
```

The contract uses GenLayer native payable calls and finality-bound external value transfers. It does not depend on an undocumented Solidity `adjudicate` interface. Studio simulates GEN balances; it does not run an EVM escrow contract. Its runtime dependency pin targets the Studio Next runner used at deployment time; local `genvm-lint` installations with a different runner pin may fail to load it.
