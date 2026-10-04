# Wallet integration fix

The previous workspace called `client.connect('studioDevnet')`. In the installed `genlayer-js` release candidate, that method calls `wallet_getSnaps` and attempts to install a MetaMask Snap. Standard EIP-1193 wallets can reject that method, preventing every write.

The workspace now discovers wallets with EIP-6963, provides an injected-provider fallback, requests an account with `eth_requestAccounts`, switches or adds Studio Next using standard chain requests, verifies the resulting chain ID, and passes the selected provider and account directly to `genlayer-js`. No application source invokes `client.connect()` or a Snap method.

The wallet panel shows the selected account, lets a user disconnect locally, and clears its write connection when accounts, chain, or provider state changes. Read-only audit previews and contract views remain available without a wallet.

Run `npm test` for wallet connection and write orchestration tests, including a provider that rejects all unsupported methods. Run `npm run test:browser` for the live browser flow with an injected wallet that has no Snap support. A real wallet transaction still requires a funded Studio Next wallet and user approval; automated tests do not broadcast a paid transaction.
