import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import deployment from '../../deployments/studio-dev-v2.json';
import './style.css';

const contract = import.meta.env.VITE_GENLAYER_CONTRACT || deployment.contract;
const network = import.meta.env.VITE_GENLAYER_NETWORK || deployment.network;
const chainName = { 'studio-dev': 'studioDevnet', 'testnet-bradbury': 'testnetBradbury', 'testnet-asimov': 'testnetAsimov', studionet: 'studionet' }[network];
const walletNetwork = network === 'studio-dev' ? 'studioDevnet' : network === 'testnet-bradbury' ? 'testnetBradbury' : network === 'testnet-asimov' ? 'testnetAsimov' : network;
function parseGen(value) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) throw new Error('Invalid GEN bond amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
}
const bond = import.meta.env.VITE_BOND_GEN ? parseGen(import.meta.env.VITE_BOND_GEN) : BigInt(deployment.bondWei);
let sdkLoad;
async function sdk() {
  if (!chainName) throw new Error(`Unsupported GenLayer network: ${network}`);
  sdkLoad ||= Promise.all([import('genlayer-js'), import('genlayer-js/chains')])
    .then(([api, chains]) => ({ ...api, chain: chains[chainName] }));
  return sdkLoad;
}

async function readClient() {
  const { createClient, chain } = await sdk();
  return createClient({ chain });
}

function auditId(value) {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Enter a nonnegative audit ID');
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new Error('Audit ID is too large');
  return id;
}

async function walletClient() {
  const { createClient, chain } = await sdk();
  if (!window.ethereum) throw new Error('Install an EIP-1193 wallet to send GenLayer transactions');
  const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const client = createClient({ chain, account: address, provider: window.ethereum });
  await client.connect(walletNetwork);
  return client;
}

async function write(functionName, args, onSubmitted, value) {
  if (!contract) throw new Error('Set VITE_GENLAYER_CONTRACT in .env');
  const client = await walletClient();
  const call = { address: contract, functionName, args, ...(value === undefined ? {} : { value }) };
  const estimate = await client.estimateTransactionFeesForWrite(call);
  const hash = await client.writeContract({ ...call, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue, messageAllocations: estimate.messageAllocations } });
  onSubmitted(hash);
  const result = await client.waitForFinalization({ hash, interval: 2000, retries: 180 });
  const { isSuccessful } = await sdk();
  if (!isSuccessful(result)) {
    const error = new Error(`Transaction failed: ${result.statusName} / ${result.txExecutionResultName}`);
    error.finalized = true;
    throw error;
  }
  return hash;
}

function App() {
  const [url, setUrl] = useState('https://raw.githubusercontent.com/linoxbt/datatruth/d96a35fec007551fdfd677f7420f3fe1b39a9dc0/datasets/airtravel.csv');
  const [audit, setAudit] = useState(null);
  const [tokenId, setTokenId] = useState('0');
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tx, setTx] = useState('');
  const [finalized, setFinalized] = useState(false);
  const [claimCid, setClaimCid] = useState('');
  const [claimHash, setClaimHash] = useState('');
  const [registeredId, setRegisteredId] = useState(null);

  useEffect(() => {
    if (!chainName || !record || record.status !== 'Challenged') return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const client = await readClient();
        const latest = await client.readContract({ address: contract, functionName: 'get_audit', args: [auditId(tokenId)] });
        if (active) setRecord(latest);
      } catch { /* The View button can retry transient RPC failures. */ }
    }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [record?.status, tokenId]);

  async function runAudit(e) {
    e.preventDefault(); setError(''); setAudit(null); setRegisteredId(null); setBusy('Fetching and auditing CSV');
    try {
      const response = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAudit(result);
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  async function action(label, callback) {
    setError(''); setTx(''); setFinalized(false); setBusy(label);
    try {
      await callback(hash => setTx(hash));
      setFinalized(true);
      if (record) {
        const client = await readClient();
        try { setRecord(await client.readContract({ address: contract, functionName: 'get_audit', args: [auditId(tokenId)] })); }
        catch { setRecord(null); }
      }
    } catch (e) { if (e.finalized) setFinalized(true); setError(e.shortMessage || e.message); } finally { setBusy(''); }
  }

  async function checkTransaction() {
    setError(''); setBusy('Checking transaction');
    try {
      const client = await readClient();
      const result = await client.waitForFinalization({ hash: tx, interval: 2000, retries: 15 });
      const { isSuccessful } = await sdk();
      setFinalized(true);
      if (!isSuccessful(result)) setError(`Transaction failed: ${result.statusName} / ${result.txExecutionResultName}`);
    } catch (e) { setError(`Transaction outcome is still unknown. Check ${tx} before trying again: ${e.message}`); }
    finally { setBusy(''); }
  }

  async function refresh() {
    setError(''); setRecord(null); setBusy('Reading audit');
    try {
      if (!contract) throw new Error('Set VITE_GENLAYER_CONTRACT in .env');
      if (!chainName) throw new Error(`Unsupported GenLayer network: ${network}`);
      const client = await readClient();
      setRecord(await client.readContract({ address: contract, functionName: 'get_audit', args: [auditId(tokenId)] }));
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  return <main>
    <header><div className="brand"><span className="mark">◈</span> DATATRUTH <span className="tm">TM</span></div><span className="pill">GENLAYER INTELLIGENT CONTRACT</span></header>
    <section className="hero"><div className="eyebrow">VERIFIABLE DATA SNAPSHOTS</div><h1>Trust the data.<br/><em>Verify the evidence.</em></h1><p>Inspect a public CSV, publish the proof to IPFS, and let GenLayer compare a challenge against an immutable source.</p></section>
    <div className="grid">
      <section className="card">
        <div className="step">01 / AUDIT</div><h2>Inspect a dataset</h2>
        <form onSubmit={runAudit}><label htmlFor="url">PUBLIC HTTPS CSV URL</label><input id="url" type="url" required value={url} onChange={e => setUrl(e.target.value)} /><button disabled={!!busy}>Run audit <span>↗</span></button></form>
        {audit && <div className="result">
          <div className="result-head">AUDIT PROOF <span className={audit.published ? 'green' : 'amber'}>{audit.published ? 'PUBLISHED TO IPFS' : 'LOCAL PREVIEW'}</span></div>
          <div className="metrics"><div><strong>{audit.metrics.rows}</strong><small>ROWS</small></div><div><strong>{audit.metrics.columns}</strong><small>COLUMNS</small></div><div><strong>{audit.metrics.duplicates}</strong><small>DUPLICATES</small></div><div><strong>{audit.metrics.missing.reduce((a,b)=>a+b,0)}</strong><small>MISSING</small></div></div>
          <div className="hash">CID <code>{audit.cid}</code></div><div className="hash">SHA-256 <code>{audit.proofSha256}</code></div>
          {!audit.published && <p className="note">IPFS publishing is not configured on this deployment. This is a preview and cannot be registered.</p>}
          {!audit.registrable && <p className="note">Registration requires a raw GitHub URL pinned to a full commit SHA, so the court can independently check provenance.</p>}
          {audit.published && audit.registrable && <button className="secondary" disabled={!!busy || (!!tx && !finalized)} onClick={() => action('Registering audit', async onSubmitted => {
            await write('register_audit', [audit.sourceUrl, audit.cid, audit.proofSha256], onSubmitted, bond);
            try {
              const client = await readClient();
              const count = Number(await client.readContract({ address: contract, functionName: 'audit_count', args: [] }));
              for (let id = count - 1; id >= Math.max(0, count - 20); id--) {
                const item = await client.readContract({ address: contract, functionName: 'get_audit', args: [id] });
                if (item.cid === audit.cid && item.proof_sha256 === audit.proofSha256) {
                  setRegisteredId(id); setTokenId(String(id)); setRecord(item); break;
                }
              }
            } catch { /* The finalized transaction hash remains visible for lookup. */ }
          })}>Register with {import.meta.env.VITE_BOND_GEN || '0.01'} GEN bond →</button>}
          {registeredId !== null && <p className="note">Registered as audit ID {registeredId}.</p>}
          {audit.published && <button className="text-button" type="button" onClick={() => { setClaimCid(audit.cid); setClaimHash(audit.proofSha256); }}>Use this proof for a challenge ↗</button>}
        </div>}
      </section>
      <section className="card">
        <div className="step">02 / CHALLENGE</div><h2>Ask the court</h2>
        <label htmlFor="token">AUDIT ID</label><div className="inline"><input id="token" type="number" min="0" step="1" value={tokenId} onChange={e=>{setTokenId(e.target.value); setRecord(null);}}/><button onClick={refresh} disabled={!!busy}>View</button></div>
        {record && <div className="record"><span className="eyebrow">CURRENT RECORD · {record.status}</span><pre>{JSON.stringify(record, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}</pre></div>}
        <div className="claim-fields"><label htmlFor="claim-cid">COMPETING PROOF CID</label><input id="claim-cid" value={claimCid} onChange={e => setClaimCid(e.target.value)} placeholder="Qm…"/><label htmlFor="claim-hash">COMPETING PROOF SHA-256</label><input id="claim-hash" value={claimHash} onChange={e => setClaimHash(e.target.value)} placeholder="64 hexadecimal characters"/></div>
        <div className="actions"><button className="secondary" disabled={!!busy || (!!tx && !finalized) || !/^Qm.{44}$/.test(claimCid) || !/^[0-9a-f]{64}$/.test(claimHash)} onClick={() => action('Validating and filing claim', onSubmitted => write('file_claim', [auditId(tokenId), claimCid, claimHash], onSubmitted))}>File claim</button><button className="secondary" disabled={!!busy || (!!tx && !finalized)} onClick={() => action('Resolving proof', onSubmitted => write('resolve', [auditId(tokenId)], onSubmitted))}>Resolve with GenLayer</button><button className="text-button" disabled={!!busy || (!!tx && !finalized)} onClick={() => action('Releasing bond', onSubmitted => write('release_unchallenged', [auditId(tokenId)], onSubmitted))}>Release after 7 days ↗</button></div>
        <p className="note">A claim must include a published proof of the same immutable source. Validators check that proof before opening a dispute, then compare the provider’s proof and settle the GEN bond.</p>
      </section>
    </div>
    {(busy || error || tx) && <div role="status" className={'status ' + (error ? 'fail' : '')}>{error || (tx ? `${finalized ? 'Finalized' : 'Submitted'} transaction: ${tx}${busy ? ' · awaiting finality…' : ''}` : busy + '…')}</div>}
    {tx && !finalized && !busy && <button className="secondary" onClick={checkTransaction}>Check transaction status</button>}
    <footer>DATA SNAPSHOT → QUALITY CHECK → IPFS PROOF → GENLAYER VERDICT</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
