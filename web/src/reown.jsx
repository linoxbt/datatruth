import React, { useEffect, useRef } from 'react';
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { defineChain } from '@reown/appkit/networks';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
const studioNext = defineChain({
  id: 61997,
  caipNetworkId: 'eip155:61997',
  chainNamespace: 'eip155',
  name: 'GenLayer Studio Next',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://studio-dev.genlayer.com/api'] } },
  blockExplorers: { default: { name: 'GenLayer Explorer', url: 'https://explorer-studio-dev.genlayer.com' } },
  testnet: true,
});

createAppKit({
  adapters: [new EthersAdapter()],
  networks: [studioNext],
  defaultNetwork: studioNext,
  projectId,
  metadata: {
    name: 'DataTruth',
    description: 'Verifiable audits of public datasets',
    url: window.location.origin,
    icons: [],
  },
  themeMode: 'dark',
  features: { analytics: false, email: false, socials: [], swaps: false, onramp: false },
});

export default function ReownWallet({ onChange }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const active = isConnected && /^0x[0-9a-fA-F]{40}$/.test(address || '') && typeof walletProvider?.request === 'function';
    callback.current(active ? { address, provider: walletProvider } : null);
    return () => callback.current(null);
  }, [address, isConnected, walletProvider]);

  return <section className="wallet-panel" aria-label="Wallet connection"><div><span className="eyebrow">POWERED BY REOWN APPKIT</span><strong>{isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect to transact'}</strong><p>Connect with Reown to send Studio Next transactions. Reads and audit previews work without a wallet.</p></div><div className="wallet-controls">{isConnected && address ? <button type="button" title="Manage wallet" onClick={() => open({ view: 'Account' })}>{address.slice(0, 6)}…{address.slice(-4)}</button> : <button type="button" onClick={() => open()}>Connect wallet</button>}</div></section>;
}
