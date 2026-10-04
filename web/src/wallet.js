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

export async function submitWalletWrite({ provider, address, chain, createClient, call, onSubmitted }) {
  await ensureChain(provider, chain);
  const client = createClient({ chain, account: address, provider });
  const estimate = await client.estimateTransactionFeesForWrite(call);
  const hash = await client.writeContract({ ...call, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue, messageAllocations: estimate.messageAllocations } });
  onSubmitted(hash);
  return { client, hash };
}
