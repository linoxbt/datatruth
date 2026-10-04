import React, { useEffect, useState } from 'react';
import { connectWallet, discoverWallets } from './wallet.js';

export default function FallbackWallet({ onChange, chain }) {
  const [wallets, setWallets] = useState([]);
  const [walletId, setWalletId] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => discoverWallets(wallet => setWallets(current => current.some(item => item.id === wallet.id) ? current : [...current, wallet])), []);
  useEffect(() => {
    const wallet = wallets.find(item => item.id === walletId);
    if (!wallet || !address) return;
    const clear = () => { setAddress(''); onChange(null); };
    const onAccounts = accounts => { if (!accounts?.some(account => account.toLowerCase() === address.toLowerCase())) clear(); };
    const onChain = id => { try { if (BigInt(id) !== BigInt(chain.id)) clear(); } catch { clear(); } };
    wallet.provider.on?.('accountsChanged', onAccounts);
    wallet.provider.on?.('chainChanged', onChain);
    wallet.provider.on?.('disconnect', clear);
    return () => { wallet.provider.removeListener?.('accountsChanged', onAccounts); wallet.provider.removeListener?.('chainChanged', onChain); wallet.provider.removeListener?.('disconnect', clear); };
  }, [wallets, walletId, address, chain.id, onChange]);
  async function connect() {
    setBusy(true); setError('');
    try {
      const wallet = wallets.find(item => item.id === walletId);
      const account = await connectWallet(wallet?.provider, chain);
      setAddress(account);
      onChange({ provider: wallet.provider, address: account });
    } catch (cause) { setError(cause.shortMessage || cause.message); }
    finally { setBusy(false); }
  }
  return <section className="wallet-panel" aria-label="Wallet connection"><div><span className="eyebrow">BROWSER WALLET FALLBACK</span><strong>{address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Connect to transact'}</strong><p>Reown needs a DataTruth Project ID. Browser wallets remain available here until one is configured.</p></div><div className="wallet-controls"><select aria-label="Choose wallet" value={walletId} onChange={event => { setWalletId(event.target.value); setAddress(''); onChange(null); }}><option value="">Choose wallet</option>{wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select>{address ? <button type="button" onClick={() => { setAddress(''); onChange(null); }}>Disconnect</button> : <button type="button" disabled={!walletId || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect wallet'}</button>}</div>{error && <p role="alert" className="wallet-error">{error}</p>}</section>;
}
