import { readFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { createAccount, createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

const keystorePath = process.env.DATATRUTH_KEYSTORE;
const passwordPath = process.env.DATATRUTH_PASSWORD_FILE;
if (!keystorePath || !passwordPath) {
  throw new Error('Set DATATRUTH_KEYSTORE and DATATRUTH_PASSWORD_FILE to local files');
}

const [keystore, password, deployment] = await Promise.all([
  readFile(keystorePath, 'utf8'),
  readFile(passwordPath, 'utf8'),
  readFile(new URL('../deployments/studio-dev.json', import.meta.url), 'utf8'),
]);
const wallet = await Wallet.fromEncryptedJson(keystore, password.trim());
const { contract, sampleProofCid, sampleProofSha256, bondWei } = JSON.parse(deployment);
const client = createClient({ chain: studioDevnet, account: createAccount(wallet.privateKey) });
const call = {
  address: contract,
  functionName: 'register_audit',
  args: ['https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv', sampleProofCid, sampleProofSha256],
  value: BigInt(bondWei),
};
const fees = await client.estimateTransactionFeesForWrite(call);
const hash = await client.writeContract({ ...call, fees: { distribution: fees.distribution, feeValue: fees.feeValue } });
console.log(`Submitted ${hash}`);
await client.waitForFinalization({ hash, interval: 2000, retries: 180 });
const count = await client.readContract({ address: contract, functionName: 'audit_count', args: [] });
console.log(`Finalized ${hash}; audit count ${count}`);
