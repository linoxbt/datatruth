import { readFile, writeFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { createAccount, createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

const keystorePath = process.env.DATATRUTH_KEYSTORE;
const passwordPath = process.env.DATATRUTH_PASSWORD_FILE;
if (!keystorePath || !passwordPath) throw new Error('Set local keystore and password file paths');

const [keystore, password, code] = await Promise.all([
  readFile(keystorePath, 'utf8'), readFile(passwordPath, 'utf8'),
  readFile(new URL('../contracts/DataTruthV2.py', import.meta.url), 'utf8'),
]);
const wallet = await Wallet.fromEncryptedJson(keystore, password.trim());
const client = createClient({ chain: studioDevnet, account: createAccount(wallet.privateKey) });
await client.getContractSchemaForCode(code);
const bondWei = 10n ** 16n;
const feeOptions = {
  leaderTimeunitsAllocation: 300n,
  validatorTimeunitsAllocation: 300n,
  executionBudgetPerRound: 1_000_000n,
  totalMessageFees: 0n,
  appealRounds: 1n,
  rotations: [0n, 0n],
};
const initialQuote = await client.estimateTransactionFees(feeOptions);
feeOptions.executionBudgetPerRound = initialQuote.policy.executionBudgetFloor * 2n;
const estimate = await client.estimateTransactionFees(feeOptions);
const hash = await client.deployContract({ code, args: [bondWei], fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
console.log(`Submitted deployment: ${hash}`);
const receipt = await client.waitForTransactionReceipt({ hash, retries: 50, interval: 5000, waitUntil: 'decided', fullTransaction: true });
if (!isSuccessful(receipt)) throw new Error(`Deployment failed: ${receipt.statusName} / ${receipt.txExecutionResultName}`);
const contract = receipt.data?.contract_address ?? receipt.txDataDecoded?.contractAddress;
if (!contract) throw new Error(`Deployment ${hash} succeeded but returned no address`);
const manifest = { network: 'studio-dev', chainId: 61997, rpc: 'https://studio-dev.genlayer.com/api', contract,
  deployer: wallet.address, transaction: hash, bondWei: bondWei.toString(), version: '2.1' };
await writeFile(new URL('../deployments/studio-dev-v2.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Deployed ${contract}`);
