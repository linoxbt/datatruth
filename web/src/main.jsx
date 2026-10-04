import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import deployment from '../../deployments/studio-dev-v2.json';
import { connectWallet, discoverWallets, submitWalletWrite } from './wallet.js';
import './style.css';

const contract = import.meta.env.VITE_GENLAYER_CONTRACT || deployment.contract;
const network = import.meta.env.VITE_GENLAYER_NETWORK || deployment.network;
const chainName = { 'studio-dev': 'studioDevnet', 'testnet-bradbury': 'testnetBradbury', 'testnet-asimov': 'testnetAsimov', studionet: 'studionet' }[network];
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

let selectedWallet = null;

async function write(functionName, args, onSubmitted, value) {
  if (!contract) throw new Error('Set VITE_GENLAYER_CONTRACT in .env');
  if (!selectedWallet) throw new Error('Connect a wallet before sending a transaction');
  const { createClient, chain } = await sdk();
  const call = { address: contract, functionName, args, ...(value === undefined ? {} : { value }) };
  const { client, hash } = await submitWalletWrite({ ...selectedWallet, chain, createClient, call, onSubmitted });
  const result = await client.waitForFinalization({ hash, interval: 2000, retries: 180 });
  const { isSuccessful } = await sdk();
  if (!isSuccessful(result)) {
    const error = new Error(`Transaction failed: ${result.statusName} / ${result.txExecutionResultName}`);
    error.finalized = true;
    throw error;
  }
  return hash;
}

function AuditApp() {
  const [wallets, setWallets] = useState([]);
  const [walletId, setWalletId] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [url, setUrl] = useState('https://raw.githubusercontent.com/linoxbt/datatruth/d96a35fec007551fdfd677f7420f3fe1b39a9dc0/datasets/airtravel.csv');
  const [audit, setAudit] = useState(null);
  const [tokenId, setTokenId] = useState(() => new URLSearchParams(window.location.search).get('audit') || '0');
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tx, setTx] = useState('');
  const [finalized, setFinalized] = useState(false);
  const [claimCid, setClaimCid] = useState('');
  const [claimHash, setClaimHash] = useState('');
  const [registeredId, setRegisteredId] = useState(null);

  useEffect(() => discoverWallets(wallet => {
    setWallets(current => {
      if (current.some(item => item.id === wallet.id)) return current;
      return [...current, wallet];
    });
  }), []);

  useEffect(() => {
    if (!walletId) return;
    const wallet = wallets.find(item => item.id === walletId);
    if (!wallet) return;
    const clear = () => { selectedWallet = null; setWalletAddress(''); };
    const onAccounts = accounts => { if (!accounts?.some(account => account.toLowerCase() === walletAddress.toLowerCase())) clear(); };
    const onChain = chainId => { try { if (BigInt(chainId) !== BigInt(selectedWallet?.chainId || deployment.chainId)) clear(); } catch { clear(); } };
    wallet.provider.on?.('accountsChanged', onAccounts);
    wallet.provider.on?.('chainChanged', onChain);
    wallet.provider.on?.('disconnect', clear);
    return () => { wallet.provider.removeListener?.('accountsChanged', onAccounts); wallet.provider.removeListener?.('chainChanged', onChain); wallet.provider.removeListener?.('disconnect', clear); };
  }, [walletId, wallets, walletAddress]);

  async function attachWallet() {
    setWalletError(''); setWalletBusy(true);
    try {
      const wallet = wallets.find(item => item.id === walletId);
      const { chain } = await sdk();
      const address = await connectWallet(wallet?.provider, chain);
      selectedWallet = { provider: wallet.provider, address, chainId: chain.id };
      setWalletAddress(address);
    } catch (error) { setWalletError(error.shortMessage || error.message); }
    finally { setWalletBusy(false); }
  }

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

  return <main className="app-shell">
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE / DATASET AUDITOR</div><h1>Audit workspace<span className="period">.</span></h1><p>Inspect a public CSV, review its evidence, and explore GenLayer verdicts.</p></div><div className="network-badge"><span className="live-dot"/> STUDIO NEXT <small>CHAIN 61997</small></div></div>
    <section className="wallet-panel" aria-label="Wallet connection"><div><span className="eyebrow">WALLET CONNECTION</span><strong>{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Connect to transact'}</strong><p>Reads and audit previews work without a wallet. Writes require Studio Next and test GEN.</p></div><div className="wallet-controls"><select aria-label="Choose wallet" value={walletId} onChange={e => { selectedWallet = null; setWalletAddress(''); setWalletId(e.target.value); }}><option value="">Choose wallet</option>{wallets.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select>{walletAddress ? <button type="button" onClick={() => { selectedWallet = null; setWalletAddress(''); }}>Disconnect</button> : <button type="button" disabled={!walletId || walletBusy} onClick={attachWallet}>{walletBusy ? 'Connecting…' : 'Connect wallet'}</button>}</div>{walletError && <p className="wallet-error" role="alert">{walletError}</p>}</section>
    <div className="workspace-steps"><span><b>01</b> Audit dataset</span><i/><span><b>02</b> Publish proof</span><i/><span><b>03</b> Challenge & resolve</span></div>
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
  </main>;
}

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></>,
    chart: <><path d="M3 3v18h18M7 16l4-5 3 2 5-7"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Navbar() {
  const path = window.location.pathname;
  const [open, setOpen] = useState(false);
  const links = [['/','Home'],['/how-it-works','How it works'],['/verdicts','Verdicts'],['/docs','Docs'],['/faq','FAQ'],['/about','About']];
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <header className="site-nav"><a className="brand" href="/" aria-label="DataTruth home"><span className="brand-symbol">◈</span><span>data<span className="brand-accent">truth</span><sup>™</sup></span></a><nav className={open ? 'open' : ''} aria-label="Main navigation" id="main-navigation">{links.map(([href,label]) => <a key={href} className={path === href ? 'active' : ''} href={href} onClick={() => setOpen(false)}>{label}</a>)}<a className="mobile-app-link" href="/app" onClick={() => setOpen(false)}>Launch app <Icon name="arrow" size={16}/></a></nav><a className="nav-cta" href="/app">Launch app <Icon name="arrow" size={16}/></a><button type="button" className={'menu-toggle ' + (open ? 'is-open' : '')} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}><span/><span/><span/></button></header>;
}

function SiteFooter() {
  return <footer className="site-footer"><div className="footer-top"><div><a className="brand" href="/"><span className="brand-symbol">◈</span><span>data<span className="brand-accent">truth</span><sup>™</sup></span></a><p>Evidence for every data decision.</p></div><div className="footer-links"><a href="/how-it-works">How it works</a><a href="/verdicts">Verdicts</a><a href="/docs">Docs</a><a href="/faq">FAQ</a><a href="/about">About</a><a href="https://github.com/linoxbt/datatruth" target="_blank" rel="noreferrer">GitHub ↗</a></div></div><div className="footer-bottom"><span>© 2026 DataTruth. Built with GenLayer.</span><span>STUDIO NEXT · PROTOTYPE</span></div></footer>;
}

function ProofVisual() {
  return <div className="proof-visual" aria-label="Diagram showing a dataset becoming an audit proof and GenLayer verdict"><div className="visual-grid"/><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/><div className="visual-glow"/><div className="visual-card data-card"><div className="visual-card-head"><span className="tiny-icon"><Icon name="file" size={15}/></span><span>airtravel.csv</span><span className="visual-menu">···</span></div><div className="data-lines"><span/><span/><span/><span/></div><div className="data-caption"><span className="mini-dot"/> SOURCE DATA <b>12 ROWS</b></div></div><div className="connector connector-left"/><div className="visual-core"><span className="core-rim"/><span className="core-glyph">◈</span></div><div className="connector connector-right"/><div className="visual-card verdict-card"><div className="visual-card-head"><span className="tiny-icon green-icon"><Icon name="shield" size={16}/></span><span>GenLayer verdict</span></div><div className="verdict-status"><span className="status-check">✓</span> Verified</div><div className="verdict-line"/><div className="verdict-caption">PROOF VALIDATED <span>↗</span></div></div><div className="floating-tag tag-top">SHA-256 VERIFIED <span>●</span></div><div className="floating-tag tag-bottom"><span>●</span> IMMUTABLE PROOF</div></div>;
}

function Landing() {
  return <><section className="landing-hero"><div className="hero-copy"><div className="section-kicker"><span className="kicker-line"/> THE TRUST LAYER FOR PUBLIC DATA</div><h1>Know your data.<br/><span>Prove its truth.</span></h1><p>From raw dataset to verifiable evidence. Audit public CSVs, anchor proofs to IPFS, and let GenLayer resolve what happens when the facts are challenged.</p><div className="hero-actions"><a className="button-primary" href="/app">Start an audit <Icon name="arrow" size={18}/></a><a className="button-outline" href="/docs">Explore the docs <span>↗</span></a></div><div className="hero-footnote"><span className="live-dot"/> LIVE ON STUDIO NEXT <i/> OPEN SOURCE <i/> BUILT FOR VERIFIABILITY</div></div><ProofVisual/></section><section className="trust-strip"><div><span>01 /</span> EXACT-BYTE HASHING</div><div><span>02 /</span> IPFS EVIDENCE</div><div><span>03 /</span> GENLAYER VERDICTS</div><div><span>04 /</span> AUTOMATIC BOND SETTLEMENT</div></section><section className="section-block" id="how-it-works"><div className="section-intro"><div><div className="section-kicker"><span className="kicker-line"/> THE PROCESS</div><h2>From uncertainty<br/>to evidence<span className="period">.</span></h2></div><p>A clear path from a public CSV to a reviewable on-chain outcome. Every stage has a purpose and a visible artifact.</p></div><div className="feature-grid"><article className="feature-card"><div className="feature-top"><span className="feature-icon"><Icon name="chart" size={25}/></span><span>01</span></div><h3>Inspect the data</h3><p>Fetch a public CSV and calculate row counts, missing values, duplicate rows, and a hash of its exact bytes.</p><div className="feature-line">DATASET → METRICS <Icon name="arrow" size={16}/></div></article><article className="feature-card"><div className="feature-top"><span className="feature-icon"><Icon name="layers" size={25}/></span><span>02</span></div><h3>Anchor the proof</h3><p>Create a reproducible JSON proof with the source snapshot and audit metrics. Published proofs receive an IPFS CID.</p><div className="feature-line">METRICS → PROOF <Icon name="arrow" size={16}/></div></article><article className="feature-card"><div className="feature-top"><span className="feature-icon"><Icon name="shield" size={25}/></span><span>03</span></div><h3>Resolve the challenge</h3><p>GenLayer validators compare competing evidence with an immutable source and the contract settles the GEN bond.</p><div className="feature-line">PROOF → VERDICT <Icon name="arrow" size={16}/></div></article></div></section><section className="statement-section"><div className="statement-orb"/><div className="section-kicker"><span className="kicker-line"/> BUILT FOR ACCOUNTABLE DATA</div><h2>A claim is only as<br/>strong as its <em>evidence.</em></h2><p>DataTruth makes the evidence inspectable, the challenge process explicit, and the outcome visible on GenLayer.</p><a className="button-primary" href="/app">Open the workspace <Icon name="arrow" size={18}/></a></section><section className="section-block proof-section"><div><div className="section-kicker"><span className="kicker-line"/> PROOF IN PRACTICE</div><h2>See the verdicts<br/>for yourself<span className="period">.</span></h2><p>Two completed Studio Next audits demonstrate both sides of the process. Explore audit IDs 0 and 1 in the app.</p><a className="text-link" href="/app">View live audits <Icon name="arrow" size={18}/></a></div><div className="outcome-list"><div className="outcome"><span className="outcome-symbol success">✓</span><div><small>AUDIT ID 0</small><strong>Verified</strong><p>Provider proof matched the immutable source.</p></div><span className="outcome-arrow">↗</span></div><div className="outcome"><span className="outcome-symbol reject">×</span><div><small>AUDIT ID 1</small><strong>Rejected</strong><p>Challenger evidence exposed incorrect metrics.</p></div><span className="outcome-arrow">↗</span></div></div></section></>;
}

function Docs() {
  const [active, setActive] = useState('overview');
  const sections = [['overview','Overview'],['quickstart','Quick start'],['evidence','Audit evidence'],['disputes','GenLayer disputes'],['deployment','Deployment'],['limits','Current limits']];
  return <div className="docs-layout"><aside className="docs-sidebar"><div className="sidebar-title">DOCUMENTATION <span>01</span></div><nav aria-label="Documentation sections">{sections.map(([id,label]) => <a key={id} className={active === id ? 'selected' : ''} href={`#${id}`} onClick={() => setActive(id)}>{label}</a>)}</nav><div className="sidebar-help"><Icon name="link" size={18}/><strong>Open source</strong><p>Read the implementation and deployment evidence.</p><a href="https://github.com/linoxbt/datatruth" target="_blank" rel="noreferrer">View on GitHub ↗</a></div></aside><article className="docs-content"><div className="section-kicker"><span className="kicker-line"/> THE DATATRUTH GUIDE</div><h1>Documentation<span className="period">.</span></h1><p className="docs-lead">A practical guide to auditing a dataset, reading a proof, and understanding how GenLayer resolves a challenge.</p><div className="docs-notice"><span>◈</span><div><strong>Prototype on Studio Next</strong><p>The live auditor currently returns a preview because hosted IPFS publishing is not configured. Completed on-chain verdicts are available as audit IDs 0 and 1.</p></div></div><section id="overview"><div className="doc-number">01 / OVERVIEW</div><h2>What DataTruth does</h2><p>DataTruth audits public CSV snapshots. It counts rows, columns, missing cells, and duplicates, then hashes the exact downloaded bytes. An IPFS proof can carry the source URL and metrics. A GenLayer Intelligent Contract stores registrations, checks challenged evidence, and settles a native GEN bond.</p><p>A Verified result means the registered proof matched the immutable source when challenged. Pending and Unchallenged records do not carry that verdict.</p></section><section id="quickstart"><div className="doc-number">02 / QUICK START</div><h2>Try the live application</h2><ol className="doc-steps"><li><b>Open the workspace.</b><span>The app has an immutable sample GitHub CSV URL ready to audit.</span></li><li><b>Run audit.</b><span>Inspect the metrics, SHA-256 digest, calculated CID, and publication status.</span></li><li><b>View audit 0.</b><span>Enter ID 0 and select View to read the Verified on-chain record.</span></li><li><b>View audit 1.</b><span>Enter ID 1 to read the Rejected on-chain record.</span></li></ol><a className="button-primary docs-button" href="/app">Launch workspace <Icon name="arrow" size={18}/></a></section><section id="evidence"><div className="doc-number">03 / AUDIT EVIDENCE</div><h2>What the proof contains</h2><p>Each proof includes a source URL, the raw CSV snapshot, an exact-byte SHA-256 hash, and deterministic quality metrics. The calculated CID identifies the serialized proof bytes. An audit is eligible for contract registration only after the proof is published to IPFS and the source is a raw GitHub URL pinned to a full commit SHA.</p><div className="docs-code"><div>PROOF PIPELINE <span>DATATRUTH / V1</span></div><code>PUBLIC CSV → BYTE HASH → QUALITY METRICS → IPFS CID</code></div></section><section id="disputes"><div className="doc-number">04 / GENLAYER DISPUTES</div><h2>Challenge and verdict</h2><p>A provider registers a published proof with a 0.01 GEN test bond. During the seven-day challenge window, another account can file a published competing proof. GenLayer validators compare that evidence with the immutable GitHub source. A subsequent resolve transaction marks the audit Verified or Rejected and transfers the bond to the provider or challenger.</p><p>If no claim is filed within seven days, the provider can release the bond. That record is labeled Unchallenged, not Verified.</p></section><section id="deployment"><div className="doc-number">05 / DEPLOYMENT</div><h2>Where it runs</h2><div className="docs-links"><a href="https://datatruth.alemzdelight.workers.dev/" target="_blank" rel="noreferrer"><span>Frontend & auditor</span><strong>Cloudflare Worker ↗</strong></a><a href="https://github.com/linoxbt/datatruth/blob/main/deployments/studio-dev-v2.json" target="_blank" rel="noreferrer"><span>Contract & transaction manifest</span><strong>Studio Next ↗</strong></a><a href="https://github.com/linoxbt/datatruth" target="_blank" rel="noreferrer"><span>Source code</span><strong>GitHub ↗</strong></a></div></section><section id="limits"><div className="doc-number">06 / CURRENT LIMITS</div><h2>What to know</h2><p>The hosted Worker does not yet have an IPFS pinning credential, so its audit endpoint shows previews and new registrations are disabled. The contract runs on the Studio Next development preview. Current metrics do not remove duplicates or assess demographic bias; those tasks need an explicit dataset schema and quality policy. DataTruth is a public prototype, not a commercial quality guarantee.</p></section></article></div>;
}

function PageHero({ eyebrow, title, lead }) {
  return <div className="interior-hero"><div className="section-kicker"><span className="kicker-line"/>{eyebrow}</div><h1>{title}<span className="period">.</span></h1><p>{lead}</p></div>;
}

function HowItWorks() {
  return <main className="interior-page"><PageHero eyebrow="THE PROTOCOL" title="How it works" lead="A public CSV becomes reproducible evidence. If someone challenges a registered proof, GenLayer validators compare it with the source and the contract settles the bond."/><div className="flow-timeline"><article><span className="flow-index">01 / INPUT</span><div className="flow-icon"><Icon name="file" size={30}/></div><div><h2>Choose a public snapshot</h2><p>Paste an allowlisted HTTPS CSV URL. For on-chain registration, the source must be a raw GitHub file pinned to a full commit SHA, so validators can check the same bytes later.</p></div></article><article><span className="flow-index">02 / AUDIT</span><div className="flow-icon"><Icon name="chart" size={30}/></div><div><h2>Measure and hash</h2><p>The auditor counts rows, columns, missing cells, and duplicates. It hashes the exact downloaded UTF-8 bytes and prepares a JSON proof with the source snapshot.</p></div></article><article><span className="flow-index">03 / EVIDENCE</span><div className="flow-icon"><Icon name="layers" size={30}/></div><div><h2>Publish the proof</h2><p>A configured pinning service uploads the proof to IPFS. The CID and proof SHA-256 are checked before a provider can register it with a 0.01 test GEN bond.</p></div></article><article><span className="flow-index">04 / VERDICT</span><div className="flow-icon"><Icon name="shield" size={30}/></div><div><h2>Challenge and resolve</h2><p>A challenger files independently reproduced evidence within seven days. GenLayer validators compare the proofs with the immutable source; the contract marks Verified or Rejected and transfers the bond.</p></div></article></div><div className="interior-cta"><div><strong>See the process in action</strong><p>Run a preview audit and inspect completed on-chain verdicts.</p></div><a className="button-primary" href="/app">Launch workspace <Icon name="arrow" size={18}/></a></div></main>;
}

function Verdicts() {
  return <main className="interior-page"><PageHero eyebrow="ON-CHAIN EVIDENCE" title="Real verdicts" lead="Two completed Studio Next audits show both outcomes of the dispute process. Open each record in the workspace and inspect the deployment manifest for transaction hashes."/><div className="verdict-page-grid"><article className="verdict-detail"><div className="verdict-detail-top"><span className="outcome-symbol success">✓</span><span>AUDIT ID 0 · STUDIO NEXT</span></div><h2>Verified</h2><p>The provider proof matched the immutable GitHub source after a challenger submitted independently reproduced evidence. The GEN bond returned to the provider.</p><a className="button-outline" href="/app?audit=0">Inspect audit 0 <Icon name="arrow" size={17}/></a></article><article className="verdict-detail"><div className="verdict-detail-top"><span className="outcome-symbol reject">×</span><span>AUDIT ID 1 · STUDIO NEXT</span></div><h2>Rejected</h2><p>The registered proof contained incorrect duplicate metrics. The challenger submitted a valid proof; GenLayer rejected the provider result and the bond went to the challenger.</p><a className="button-outline" href="/app?audit=1">Inspect audit 1 <Icon name="arrow" size={17}/></a></article></div><div className="evidence-panel"><div className="feature-icon"><Icon name="link" size={24}/></div><div><h3>Verify the transaction trail</h3><p>The public deployment manifest records the contract address and registration, claim, and resolution transaction hashes for both audits.</p></div><a className="text-link" href="https://github.com/linoxbt/datatruth/blob/main/deployments/studio-dev-v2.json" target="_blank" rel="noreferrer">Open manifest ↗</a></div></main>;
}

function Faq() {
  const entries = [
    ['Is DataTruth live?','Yes. The frontend and auditor run on Cloudflare, and the Intelligent Contract is deployed on Studio Next. The site is a public prototype, not a production data-quality guarantee.'],
    ['Can I register a new audit today?','The live Worker currently has no hosted IPFS pinning credential. You can run an audit preview and inspect existing on-chain records. Registration becomes available when a proof is actually published to IPFS.'],
    ['What does Verified mean?','A challenged provider proof matched the immutable GitHub source according to the GenLayer validation flow. It does not certify that a dataset is unbiased or suitable for a specific model.'],
    ['What if nobody challenges an audit?','After seven days, the provider can reclaim the bond through release_unchallenged. The record says Unchallenged, not Verified.'],
    ['Does DataTruth remove duplicates or measure bias?','It counts duplicate rows and missing cells. It does not produce a cleaned dataset or infer demographic fairness from arbitrary CSV columns. A bias check would need declared group and outcome fields.'],
    ['Is there an NFT?','No. The active implementation is a GenLayer-native registry with audit IDs and native GEN bond settlement. The original ERC-721 idea is not part of this Studio Next deployment.'],
  ];
  return <main className="interior-page faq-page"><PageHero eyebrow="COMMON QUESTIONS" title="Frequently asked" lead="A direct look at what DataTruth does today, how the verdicts work, and where the prototype’s boundaries are."/><div className="faq-list">{entries.map(([q,a],i) => <details key={q}><summary><span>{String(i+1).padStart(2,'0')}</span>{q}<b>+</b></summary><p>{a}</p></details>)}</div><div className="interior-cta"><div><strong>Want the technical details?</strong><p>Read the proof format, challenge flow, deployment, and limits.</p></div><a className="button-primary" href="/docs">Read the docs <Icon name="arrow" size={18}/></a></div></main>;
}

function About() {
  return <main className="interior-page"><PageHero eyebrow="ABOUT DATATRUTH" title="Evidence, made useful" lead="DataTruth explores a simple premise: a data-quality claim is stronger when anyone can inspect the source, reproduce the checks, and challenge the result."/><div className="about-grid"><div className="about-highlight"><div className="about-orbit">◈</div><span>OUR NORTH STAR</span><h2>Make public data claims open to verification.</h2></div><div className="about-copy"><h2>Why we built it</h2><p>People increasingly use public datasets to train, evaluate, and inform AI systems. Basic facts about a dataset—such as missing cells and duplicate rows—should be repeatable from a known source, not left as an unsupported claim.</p><p>DataTruth combines a deterministic auditor, content-addressed evidence, and a GenLayer Intelligent Contract. A GEN bond gives both sides a stake in the outcome, while validators compare challenged proofs with the immutable source.</p><p>The current deployment is a transparent prototype on Studio Next. Its limitations are documented, including the missing hosted IPFS credential for new browser registrations.</p><div className="about-links"><a className="text-link" href="/how-it-works">Explore the process <Icon name="arrow" size={18}/></a><a className="text-link" href="https://github.com/linoxbt/datatruth" target="_blank" rel="noreferrer">View source code ↗</a></div></div></div></main>;
}

function Site() {
  const path = window.location.pathname;
  const pages = { '/': <Landing/>, '/how-it-works': <HowItWorks/>, '/verdicts': <Verdicts/>, '/docs': <Docs/>, '/faq': <Faq/>, '/about': <About/>, '/app': <AuditApp/> };
  const page = pages[path] || <main className="interior-page"><PageHero eyebrow="PAGE NOT FOUND" title="Lost your way?" lead="That page does not exist. Return to the home page or open the audit workspace."/><a className="button-primary" href="/">Back home <Icon name="arrow" size={18}/></a></main>;
  return <><Navbar/>{page}<SiteFooter/></>;
}

createRoot(document.getElementById('root')).render(<Site/>);
