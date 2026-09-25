import { readFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { createAccount, createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import deployment from '../deployments/studio-dev-v2.json' with { type: 'json' };

const [tokenId, cid, proofHash] = process.argv.slice(2);
if (!/^(0|[1-9]\d*)$/.test(tokenId || '') || !cid || !proofHash) {
  throw new Error('Usage: file-claim.mjs AUDIT_ID CLAIM_CID CLAIM_PROOF_SHA256');
}
const keystorePath = process.env.DATATRUTH_KEYSTORE;
const passwordPath = process.env.DATATRUTH_PASSWORD_FILE;
if (!keystorePath || !passwordPath) throw new Error('Set local keystore and password file paths');
const [keystore, password] = await Promise.all([readFile(keystorePath, 'utf8'), readFile(passwordPath, 'utf8')]);
const wallet = await Wallet.fromEncryptedJson(keystore, password.trim());
const client = createClient({ chain: studioDevnet, account: createAccount(wallet.privateKey) });
const call = { address: deployment.contract, functionName: 'file_claim', args: [Number(tokenId), cid, proofHash] };
const estimate = await client.estimateTransactionFeesForWrite(call);
const hash = await client.writeContract({ ...call, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue, messageAllocations: estimate.messageAllocations } });
console.log(`Submitted claim: ${hash}`);
const result = await client.waitForFinalization({ hash, interval: 2000, retries: 180 });
if (!isSuccessful(result)) throw new Error(`Claim failed: ${result.statusName} / ${result.txExecutionResultName}`);
const audit = await client.readContract({ address: deployment.contract, functionName: 'get_audit', args: [Number(tokenId)] });
console.log(`Finalized: ${hash}; status: ${audit.status}`);
