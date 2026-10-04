# Wallet integration fix

The previous workspace called `client.connect('studioDevnet')`. In the installed `genlayer-js` release candidate, that method calls `wallet_getSnaps` and attempts to install a MetaMask Snap. Standard EIP-1193 wallets can reject that method, preventing every write.

The workspace now uses Reown AppKit when `VITE_REOWN_PROJECT_ID` is configured. The Cloudflare production build uses the public Reown Project ID shared by GenSupply and GenShield. A single Connect wallet button opens Reown directly; the connected address button opens the account panel without disconnecting. Reown supplies the EIP-1193 provider and account to `genlayer-js`; the write path verifies Studio Next before signing. Builds without a Project ID retain read-only features. No application source invokes `client.connect()` or a Snap method.

The Reown wallet panel shows the connected account. The write connection clears when Reown reports a disconnected account or provider. Read-only audit previews and contract views remain available without a wallet.

Run `npm test` for wallet connection and write orchestration tests, including a provider that rejects all unsupported methods. Run `npm run test:browser` for the live browser flow. With a local Reown Project ID configured, run `npm run test:reown` against the Vite server to verify that Reown's wallet modal opens. A real wallet transaction still requires a funded Studio Next wallet and user approval; automated tests do not broadcast a paid transaction.
