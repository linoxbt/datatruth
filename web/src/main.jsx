import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from 'genlayer-js';
import { studionet, testnetBradbury, testnetAsimov, studioDevnet } from 'genlayer-js/chains';
import './style.css';

const contract = import.meta.env.VITE_GENLAYER_CONTRACT;
const network = import.meta.env.VITE_GENLAYER_NETWORK || 'studionet';
const chain = network === 'studio-dev' ? studioDevnet : network === 'testnet-bradbury' ? testnetBradbury : network === 'testnet-asimov' ? testnetAsimov : studionet;
const walletNetwork = network === 'studio-dev' ? 'studioDevnet' : network === 'testnet-bradbury' ? 'testnetBradbury' : network === 'testnet-asimov' ? 'testnetAsimov' : network;
const bond = BigInt(Math.round(Number(import.meta.env.VITE_BOND_GEN || '0.01') * 1e18));

async function walletClient() {
  if (!window.ethereum) throw new Error('Install an EIP-1193 wallet to send GenLayer transactions');
  const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const client = createClient({ chain, account: address, provider: window.ethereum });
  await client.connect(walletNetwork);
  return client;
}

async function write(functionName, args, value) {
  if (!contract) throw new Error('Set VITE_GENLAYER_CONTRACT in .env');
  const client = await walletClient();
  const call = { address: contract, functionName, args, ...(value === undefined ? {} : { value }) };
  const estimate = await client.estimateTransactionFeesForWrite(call);
  const hash = await client.writeContract({ ...call, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
  await client.waitForFinalization({ hash, interval: 2000, retries: 180 });
  return hash;
}

function App() {
  const [url, setUrl] = useState('https://people.sc.fsu.edu/~jburkardt/data/csv/airtravel.csv');
  const [audit, setAudit] = useState(null);
  const [tokenId, setTokenId] = useState('0');
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tx, setTx] = useState('');

  async function runAudit(e) {
    e.preventDefault(); setError(''); setAudit(null); setBusy('Fetching and auditing CSV');
    try {
      const response = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAudit(result);
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  async function action(label, callback) {
    setError(''); setTx(''); setBusy(label);
    try { setTx(await callback()); } catch (e) { setError(e.shortMessage || e.message); } finally { setBusy(''); }
  }

  async function refresh() {
    setError(''); setBusy('Reading audit');
    try {
      if (!contract) throw new Error('Set VITE_GENLAYER_CONTRACT in .env');
      const client = createClient({ chain });
      setRecord(await client.readContract({ address: contract, functionName: 'get_audit', args: [Number(tokenId)] }));
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  return <main>
    <header><div className="brand"><span className="mark">◈</span> DATATRUTH <span className="tm">TM</span></div><span className="pill">GENLAYER INTELLIGENT CONTRACT</span></header>
    <section className="hero"><div className="eyebrow">PROVABLE DATA QUALITY</div><h1>Trust the data.<br/><em>Verify the evidence.</em></h1><p>Audit a public CSV, anchor its proof to IPFS, and let GenLayer validators decide a challenged claim.</p></section>
    <div className="grid"><section className="card"><div className="step">01 / AUDIT</div><h2>Inspect a dataset</h2><form onSubmit={runAudit}><label htmlFor="url">PUBLIC HTTPS CSV URL</label><input id="url" value={url} onChange={e => setUrl(e.target.value)} /><button disabled={!!busy}>Run audit <span>↗</span></button></form>{audit && <div className="result"><div className="result-head">AUDIT PROOF <span className={audit.published ? 'green' : 'amber'}>{audit.published ? 'PUBLISHED TO IPFS' : 'LOCAL PREVIEW'}</span></div><div className="metrics"><div><strong>{audit.metrics.rows}</strong><small>ROWS</small></div><div><strong>{audit.metrics.columns}</strong><small>COLUMNS</small></div><div><strong>{audit.metrics.duplicates}</strong><small>DUPLICATES</small></div><div><strong>{audit.metrics.missing.reduce((a,b)=>a+b,0)}</strong><small>MISSING</small></div></div><div className="hash">CID <code>{audit.cid}</code></div><div className="hash">SHA-256 <code>{audit.proofSha256}</code></div>{!audit.published && <p className="note">Configure Pinata or an IPFS API on the auditor to publish this proof before registering it.</p>}{audit.published && <button className="secondary" disabled={!!busy} onClick={() => action('Registering audit', () => write('register_audit', [audit.sourceUrl, audit.cid, audit.proofSha256], bond))}>Register with {import.meta.env.VITE_BOND_GEN || '0.01'} GEN bond →</button>}</div>}</section>
    <section className="card"><div className="step">02 / CHALLENGE</div><h2>Ask the court</h2><label htmlFor="token">AUDIT ID</label><div className="inline"><input id="token" type="number" min="0" value={tokenId} onChange={e=>setTokenId(e.target.value)}/><button onClick={refresh} disabled={!!busy}>View</button></div>{record && <div className="record"><span className="eyebrow">CURRENT RECORD</span><pre>{JSON.stringify(record, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}</pre></div>}<div className="actions"><button className="secondary" disabled={!!busy} onClick={() => action('Filing challenge', () => write('challenge', [Number(tokenId)]))}>File challenge</button><button className="secondary" disabled={!!busy} onClick={() => action('Resolving proof', () => write('resolve', [Number(tokenId)]))}>Resolve with GenLayer</button><button className="text-button" disabled={!!busy} onClick={() => action('Releasing bond', () => write('release_unchallenged', [Number(tokenId)]))}>Release after 7 days ↗</button></div><p className="note">Any third party can challenge a pending audit. Validators fetch the IPFS proof, recompute its metrics, and settle the provider’s bond at finality.</p></section></div>
    {(busy || error || tx) && <div className={'status ' + (error ? 'fail' : '')}>{error || (busy ? busy + '…' : `Finalized transaction: ${tx}`)}</div>}
    <footer>DATA SNAPSHOT → QUALITY CHECK → IPFS PROOF → GENLAYER VERDICT</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
