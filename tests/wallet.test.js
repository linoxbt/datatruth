import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureChain, submitWalletWrite } from '../web/src/wallet.js';

const chain = { id: 61997, name: 'Studio Devnet', rpcUrls: { default: { http: ['https://studio-dev.genlayer.com/api'] } }, nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 } };
const address = '0x1111111111111111111111111111111111111111';

test('accepts the Reown-selected provider without calling any Snap method', async () => {
  const methods = [];
  const provider = { request: async ({ method }) => {
    methods.push(method);
    if (method === 'eth_chainId') return '0xf22d';
    throw new Error(`Unsupported: ${method}`);
  } };
  await ensureChain(provider, chain);
  assert.deepEqual(methods, ['eth_chainId']);
});

test('adds an unknown chain, switches, and verifies the result', async () => {
  let current = '0x1';
  const methods = [];
  const provider = { request: async ({ method }) => {
    methods.push(method);
    if (method === 'eth_chainId') return current;
    if (method === 'wallet_switchEthereumChain' && current === '0x1') throw Object.assign(new Error('Unknown chain'), { code: 4902 });
    if (method === 'wallet_addEthereumChain') { current = '0x2'; return null; }
    if (method === 'wallet_switchEthereumChain') { current = '0xf22d'; return null; }
    throw new Error(`Unsupported: ${method}`);
  } };
  await ensureChain(provider, chain);
  assert.deepEqual(methods, ['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain', 'eth_chainId']);
});

test('wallet write estimates fees, uses the selected provider and reports the hash', async () => {
  const provider = { request: async ({ method }) => {
    if (method === 'eth_chainId') return '0xf22d';
    throw new Error(`Unexpected wallet method ${method}`);
  } };
  const call = { address, functionName: 'resolve', args: [0] };
  let submitted;
  let received;
  const createClient = config => {
    assert.equal(config.provider, provider);
    assert.equal(config.account, address);
    return {
      estimateTransactionFeesForWrite: async actual => { assert.deepEqual(actual, call); return { distribution: { leader: 1 }, feeValue: 5n, messageAllocations: [{ value: 1n }] }; },
      writeContract: async actual => { received = actual; return '0xtest'; },
    };
  };
  const result = await submitWalletWrite({ provider, address, chain, createClient, call, onSubmitted: hash => { submitted = hash; } });
  assert.equal(result.hash, '0xtest');
  assert.equal(submitted, '0xtest');
  assert.deepEqual(received, { ...call, fees: { distribution: { leader: 1 }, feeValue: 5n, messageAllocations: [{ value: 1n }] } });
});

test('chain request rejection is surfaced without attempting a Snap fallback', async () => {
  const methods = [];
  const provider = { request: async ({ method }) => {
    methods.push(method);
    throw Object.assign(new Error('User rejected request'), { code: 4001 });
  } };
  await assert.rejects(ensureChain(provider, chain), /User rejected request/);
  assert.deepEqual(methods, ['eth_chainId']);
});

test('refuses a write when the wallet remains on the wrong chain', async () => {
  const provider = { request: async ({ method }) => {
    if (method === 'eth_chainId') return '0x1';
    if (method === 'wallet_switchEthereumChain') return null;
    throw new Error(`Unsupported: ${method}`);
  } };
  await assert.rejects(submitWalletWrite({ provider, address, chain, createClient: () => { throw new Error('Client must not be created'); }, call: {}, onSubmitted: () => {} }), /Switch your wallet/);
});
