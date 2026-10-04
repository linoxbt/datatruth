export function discoverWallets(onWallet, browser = window) {
  const seen = new Set();
  const announce = event => {
    const { info, provider } = event.detail || {};
    if (!info?.uuid || !info?.name || typeof provider?.request !== 'function' || seen.has(info.uuid)) return;
    seen.add(info.uuid);
    onWallet({ id: info.uuid, name: info.name, provider });
  };
  browser.addEventListener('eip6963:announceProvider', announce);
  browser.dispatchEvent(new Event('eip6963:requestProvider'));
  if (typeof browser.ethereum?.request === 'function') {
    onWallet({ id: 'injected', name: 'Browser wallet', provider: browser.ethereum });
  }
  return () => browser.removeEventListener('eip6963:announceProvider', announce);
}

export async function ensureChain(provider, chain) {
  const expected = `0x${chain.id.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  if (BigInt(current) === BigInt(expected)) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expected }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: expected, chainName: chain.name, rpcUrls: chain.rpcUrls.default.http, nativeCurrency: chain.nativeCurrency, blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [] }] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expected }] });
  }
  const after = await provider.request({ method: 'eth_chainId' });
  if (BigInt(after) !== BigInt(expected)) throw new Error(`Switch your wallet to ${chain.name} before sending a transaction`);
}

export async function connectWallet(provider, chain) {
  if (typeof provider?.request !== 'function') throw new Error('Choose a browser wallet first');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const address = accounts?.[0];
  if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) throw new Error('Wallet did not return a valid account');
  await ensureChain(provider, chain);
  return address;
}

export async function submitWalletWrite({ provider, address, chain, createClient, call, onSubmitted }) {
  await ensureChain(provider, chain);
  const client = createClient({ chain, account: address, provider });
  const estimate = await client.estimateTransactionFeesForWrite(call);
  const hash = await client.writeContract({ ...call, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue, messageAllocations: estimate.messageAllocations } });
  onSubmitted(hash);
  return { client, hash };
}
