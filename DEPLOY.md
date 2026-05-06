# Scaffold — deploy program & run against devnet / testnet

The UI expects this Anchor program on your chosen cluster (default **devnet**). Program id is fixed by the committed keypair:

`programs/scaffold_escrow/scaffold_escrow-keypair.json` → **4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG**

## 1. Prerequisites

- Solana CLI configured for **devnet** or **testnet** (`solana config set --url https://api.devnet.solana.com` or testnet RPC).
- Wallet JSON with SOL on that cluster for deployment fees (`Anchor.toml` `[provider] wallet`).
- Node 20+ for the Vite app.

## 2. Build & deploy the program

From `sonsensus/`:

```bash
npm run anchor:build
anchor deploy --provider.cluster devnet
```

For **testnet**:

```bash
anchor deploy --provider.cluster testnet
```

After deploying, match `Anchor.toml` `[programs.testnet]` / explorer if you ever regenerate the program keypair (otherwise keep the committed keypair so the id stays **4dUW…**).

## 3. Frontend environment

Optional `.env` (or `.env.local`) overrides:

```
VITE_SOLANA_CLUSTER=devnet
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_PROGRAM_ID=4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG
VITE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Default USDC mint is Circle **devnet** USDC. On **testnet**, replace `VITE_USDC_MINT` with the SPL mint you actually use.

Run the app:

```bash
npm install
npm run dev
```

## 4. Demo wallet flow

1. Connect Phantom / Solflare on **devnet**.
2. Request SOL from a faucet (the UI includes “Request devnet SOL” when cluster is devnet/testnet).
3. Acquire **devnet USDC** for that mint into your wallet’s ATA (Circle faucet / whatever your team uses).
4. Paste **worker** pubkey (second wallet that will receive streamed USDC).
5. Leave **arbiter** blank to use your wallet as judge, or paste a dedicated arbiter wallet — you must **switch Phantom to that arbiter** before pause/release/refund actions that require arbiter signature.
6. **Initialize escrow** → **Deposit full budget** → **Create worker USDC ATA** → **Release** checkpoints in order as arbiter.
7. **Pause** → **Refund vault to buyer** returns remaining USDC to buyer while paused.

Explorer links in the UI respect `VITE_SOLANA_CLUSTER`.
