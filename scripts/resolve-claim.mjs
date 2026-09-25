import { readFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { createAccount, createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import deployment from '../deployments/studio-dev-v2.json' with { type: 'json' };

const tokenId = process.argv[2];
if (!/^(0|[1-9]\d*)$/.test(tokenId || '')) throw new Error('Usage: resolve-claim.mjs AUDIT_ID');
const [keystore, password] = await Promise.all([
  readFile(process.env.DATATRUTH_KEYSTORE, 'utf8'),
  readFile(process.env.DATATRUTH_PASSWORD_FILE, 'utf8'),
]);
const wallet = await Wallet.fromEncryptedJson(keystore, password.trim());
const client = createClient({ chain: studioDevnet, account: createAccount(wallet.privateKey) });
const call = { address: deployment.contract, functionName: 'resolve', args: [Number(tokenId)] };
const estimate = await client.estimateTransactionFeesForWrite(call);
const hash = await client.writeContract({ ...call, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue, messageAllocations: estimate.messageAllocations } });
console.log(`Submitted resolve: ${hash}`);
const result = await client.waitForFinalization({ hash, interval: 2000, retries: 180 });
if (!isSuccessful(result)) throw new Error(`Resolve failed: ${result.statusName} / ${result.txExecutionResultName}`);
const audit = await client.readContract({ address: deployment.contract, functionName: 'get_audit', args: [Number(tokenId)] });
console.log(`Finalized: ${hash}; status: ${audit.status}`);
