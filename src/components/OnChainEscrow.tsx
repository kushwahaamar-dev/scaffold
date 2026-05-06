import BN from 'bn.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

import {
  explorerAddressUrl,
  explorerTxUrl,
  getCluster,
  PROGRAM_ID,
  USDC_MINT,
} from '../chain/config';
import { escrowPda } from '../chain/escrowPda';
import { fetchEscrowAccountNullable, getProgram, type EscrowAccount } from '../chain/program';
import {
  createDemoContract,
  getDemoCheckpointCount,
  getDemoCheckpointWeightsBasisPoints,
} from '../domain/scaffold';

export type EscrowSession = {
  escrow: EscrowAccount;
  vaultUiAmount: string;
  releasedUiAmount: number;
} | null;

type Props = {
  onSession?: (session: EscrowSession) => void;
};

export function OnChainEscrow({ onSession }: Props = {}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();

  const { publicKey } = wallet;

  const demoTitles = useMemo(() => createDemoContract().checkpoints.map((c) => c.title), []);
  const demoCpCount = getDemoCheckpointCount();
  const demoWeights = useMemo(() => getDemoCheckpointWeightsBasisPoints(), []);

  const [nonceStr, setNonceStr] = useState('1');
  const [budgetUsdc, setBudgetUsdc] = useState('25');
  const [workerStr, setWorkerStr] = useState('');
  const [arbiterStr, setArbiterStr] = useState('');
  const [deadlineHours, setDeadlineHours] = useState('72');
  const [thresholdPct, setThresholdPct] = useState('80');
  const [scoreBps, setScoreBps] = useState<Record<number, string>>({});

  const [escrowAcct, setEscrowAcct] = useState<EscrowAccount | null>(null);
  const [vaultUiAmount, setVaultUiAmount] = useState<string>('—');
  const [busy, setBusy] = useState(false);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const nonceBn = useMemo(() => new BN(nonceStr.trim() || '0', 10), [nonceStr]);

  const escrowPk = useMemo(() => {
    if (!publicKey || nonceBn.isNeg()) {
      return null;
    }
    const [pda] = escrowPda(publicKey, nonceBn);
    return pda;
  }, [publicKey, nonceBn]);

  const vaultAta = useMemo(() => {
    if (!escrowPk) {
      return null;
    }
    return getAssociatedTokenAddressSync(USDC_MINT, escrowPk, true);
  }, [escrowPk]);

  const refresh = useCallback(async () => {
    setErr(null);
    if (!anchorWallet || !publicKey || !escrowPk || !vaultAta) {
      setEscrowAcct(null);
      setVaultUiAmount('—');
      onSession?.(null);
      return;
    }

    try {
      const program = getProgram(connection, anchorWallet);
      const acct = await fetchEscrowAccountNullable(program, escrowPk);
      if (!acct) {
        setEscrowAcct(null);
        setVaultUiAmount('—');
        onSession?.(null);
        return;
      }
      setEscrowAcct(acct);

      const vb = await connection.getTokenAccountBalance(vaultAta);
      const ui = vb.value.uiAmountString ?? vb.value.amount;
      setVaultUiAmount(ui);

      onSession?.({
        escrow: acct,
        vaultUiAmount: ui,
        releasedUiAmount: acct.released.toNumber() / 1_000_000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setEscrowAcct(null);
      onSession?.(null);
    }
  }, [anchorWallet, connection, escrowPk, publicKey, vaultAta, onSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Subscribe to live account changes so the dashboard reflects on-chain state
  // without manual polling.
  useEffect(() => {
    if (!escrowPk || !vaultAta) {
      return;
    }
    const escrowSub = connection.onAccountChange(escrowPk, () => {
      void refresh();
    });
    const vaultSub = connection.onAccountChange(vaultAta, () => {
      void refresh();
    });
    return () => {
      void connection.removeAccountChangeListener(escrowSub);
      void connection.removeAccountChangeListener(vaultSub);
    };
  }, [connection, escrowPk, vaultAta, refresh]);

  const pushTx = async (label: string, run: () => Promise<string>) => {
    setBusy(true);
    setErr(null);
    try {
      const sig = await run();
      setLastSig(sig);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(`${label}: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const parsePubkeyInput = (label: string, value: string): PublicKey => {
    try {
      return new PublicKey(value.trim());
    } catch {
      throw new Error(`${label} must be a valid Solana address`);
    }
  };

  const workerPk = useMemo(() => {
    if (!workerStr.trim()) {
      return null;
    }
    try {
      return new PublicKey(workerStr.trim());
    } catch {
      return null;
    }
  }, [workerStr]);

  const initializeEscrow = () =>
    pushTx('initializeEscrow', async () => {
      if (!anchorWallet || !publicKey) {
        throw new Error('Connect buyer wallet first');
      }
      const worker = parsePubkeyInput('Worker', workerStr);
      const arbiter =
        arbiterStr.trim().length > 0 ? parsePubkeyInput('Arbiter', arbiterStr) : publicKey;

      const budgetAtoms = BigInt(Math.round(Number(budgetUsdc) * 1_000_000));
      if (budgetAtoms <= 0n) {
        throw new Error('Budget must be a positive USDC amount');
      }

      const program = getProgram(connection, anchorWallet);
      const [escrow] = escrowPda(publicKey, nonceBn);
      const vault = getAssociatedTokenAddressSync(USDC_MINT, escrow, true);

      const deadlineSecs = Math.max(60, Math.round(Number(deadlineHours) * 3600));
      const deadlineUnix = new BN(Math.floor(Date.now() / 1000) + deadlineSecs);
      const threshold = Math.max(0, Math.min(10000, Math.round(Number(thresholdPct) * 100)));
      const specHash = await sha256SpecHash({
        budgetAtoms: budgetAtoms.toString(),
        weights: demoWeights,
        deadlineUnix: deadlineUnix.toString(),
        threshold,
        worker: worker.toBase58(),
        arbiter: arbiter.toBase58(),
      });

      return await program.methods
        .initializeEscrow(
          nonceBn,
          new BN(budgetAtoms.toString()),
          demoCpCount,
          demoWeights,
          deadlineUnix,
          threshold,
          Array.from(specHash),
        )
        .accountsPartial({
          buyer: publicKey,
          worker,
          arbiter,
          mint: USDC_MINT,
          escrow,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

  const depositEscrow = () =>
    pushTx('deposit', async () => {
      if (!anchorWallet || !publicKey || !escrowPk || !vaultAta) {
        throw new Error('Missing escrow context');
      }
      const program = getProgram(connection, anchorWallet);
      const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false);

      return await program.methods
        .deposit()
        .accountsPartial({
          buyer: publicKey,
          escrow: escrowPk,
          vault: vaultAta,
          buyerAta,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

  const ensureWorkerAta = async () => {
    if (!anchorWallet?.publicKey || !workerPk) {
      setErr('Connect wallet and set a valid worker address');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const workerAta = getAssociatedTokenAddressSync(USDC_MINT, workerPk, false);
      const info = await connection.getAccountInfo(workerAta);
      if (info) {
        await refresh();
        return;
      }

      const ix = createAssociatedTokenAccountInstruction(
        anchorWallet.publicKey,
        workerAta,
        workerPk,
        USDC_MINT,
      );
      const tx = new Transaction().add(ix);
      const latest = await connection.getLatestBlockhash();
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = anchorWallet.publicKey;

      const signed = await anchorWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(sig, 'confirmed');
      setLastSig(sig);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(`createWorkerAta: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const releaseStreamed = (index: number, scoreBpsValue: number) =>
    pushTx(`releaseStreamed(${index}, ${scoreBpsValue}bps)`, async () => {
      if (!anchorWallet?.publicKey || !escrowPk || !vaultAta || !escrowAcct) {
        throw new Error('Load escrow on-chain state first');
      }
      if (!anchorWallet.publicKey.equals(escrowAcct.arbiter)) {
        throw new Error('Switch wallet to the arbiter pubkey that was set at initialize');
      }
      const bps = Math.max(0, Math.min(10000, Math.round(scoreBpsValue)));
      if (bps === 0) {
        throw new Error('Score must be > 0 bps');
      }

      const workerAta = getAssociatedTokenAddressSync(USDC_MINT, escrowAcct.worker, false);
      const info = await connection.getAccountInfo(workerAta);
      if (!info) {
        throw new Error('Create the worker USDC token account first (button above)');
      }

      const program = getProgram(connection, anchorWallet);
      return await program.methods
        .releaseStreamed(index, bps)
        .accountsPartial({
          arbiter: anchorWallet.publicKey,
          escrow: escrowPk,
          vault: vaultAta,
          worker: escrowAcct.worker,
          workerAta,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

  const finalizeJob = () =>
    pushTx('finalizeJob', async () => {
      if (!anchorWallet?.publicKey || !escrowPk || !vaultAta || !escrowAcct) {
        throw new Error('Load escrow on-chain state first');
      }
      const workerAta = getAssociatedTokenAddressSync(USDC_MINT, escrowAcct.worker, false);
      const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, escrowAcct.buyer, false);
      const program = getProgram(connection, anchorWallet);
      return await program.methods
        .finalizeJob()
        .accountsPartial({
          cranker: anchorWallet.publicKey,
          escrow: escrowPk,
          vault: vaultAta,
          worker: escrowAcct.worker,
          workerAta,
          buyerAta,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

  const togglePause = (paused: boolean) =>
    pushTx('setPause', async () => {
      if (!anchorWallet?.publicKey || !escrowPk || !escrowAcct) {
        throw new Error('Missing escrow');
      }
      if (!anchorWallet.publicKey.equals(escrowAcct.arbiter)) {
        throw new Error('Switch wallet to the arbiter pubkey');
      }
      const program = getProgram(connection, anchorWallet);
      return await program.methods
        .setPause(paused)
        .accountsPartial({
          arbiter: anchorWallet.publicKey,
          escrow: escrowPk,
        })
        .rpc();
    });

  const refundBuyer = () =>
    pushTx('refundBuyer', async () => {
      if (!anchorWallet || !publicKey || !escrowPk || !vaultAta) {
        throw new Error('Missing context');
      }
      const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false);
      const program = getProgram(connection, anchorWallet);
      return await program.methods
        .refundBuyer()
        .accountsPartial({
          buyer: publicKey,
          escrow: escrowPk,
          vault: vaultAta,
          buyerAta,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

  const fundFeePayer = () =>
    pushTx('airdropSol', async () => {
      if (!publicKey) {
        throw new Error('Connect wallet');
      }
      if (getCluster() !== 'devnet' && getCluster() !== 'testnet') {
        throw new Error('SOL faucet only works on devnet/testnet RPC');
      }
      const sig = await connection.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    });

  const checkpointFraction = (idx: number) => {
    if (!escrowAcct) return 0;
    const w = escrowAcct.weights[idx];
    if (!w) return 0;
    return escrowAcct.bpsReleasedPerCp[idx] / w;
  };
  const checkpointFullyReleased = (idx: number) => checkpointFraction(idx) >= 1;

  const bpsSum = demoWeights.reduce((a, b) => a + b, 0);

  return (
    <section className="chain-section" aria-label="Solana devnet escrow controls">
      <div className="chain-head">
        <div>
          <p className="section-label">On-chain escrow</p>
          <h2 className="section-title chain-title">Live USDC flows ({getCluster()})</h2>
          <p className="section-text chain-lede">
            Deploy the Anchor program (once), connect Phantom or Solflare, fund devnet SOL + devnet USDC, then step
            through initialize → deposit → per-checkpoint releases signed by the arbiter. Refund sends vault remainder
            back to the buyer while paused.
          </p>
          <p className="chain-meta">
            Program{' '}
            <a href={explorerAddressUrl(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">
              {PROGRAM_ID.toBase58().slice(0, 4)}…{PROGRAM_ID.toBase58().slice(-4)}
            </a>{' '}
            · USDC mint{' '}
            <a href={explorerAddressUrl(USDC_MINT.toBase58())} target="_blank" rel="noreferrer">
              {USDC_MINT.toBase58().slice(0, 4)}…
            </a>
          </p>
        </div>
        <div className="chain-wallet-actions">
          <WalletMultiButton className="wallet-multi-btn" />
          <button type="button" className="ghost-btn" disabled={busy || !publicKey} onClick={() => void fundFeePayer()}>
            Request devnet SOL (1)
          </button>
          <button type="button" className="ghost-btn" disabled={busy} onClick={() => void refresh()}>
            Refresh balances
          </button>
        </div>
      </div>

      <div className="chain-grid">
        <div className="chain-card">
          <h3 className="chain-card-title">1 · Escrow parameters</h3>
          <label className="field">
            <span>Nonce (per buyer)</span>
            <input value={nonceStr} onChange={(e) => setNonceStr(e.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Budget (USDC, 6 decimals)</span>
            <input value={budgetUsdc} onChange={(e) => setBudgetUsdc(e.target.value)} />
          </label>
          <label className="field">
            <span>Worker pubkey</span>
            <input
              value={workerStr}
              onChange={(e) => setWorkerStr(e.target.value)}
              placeholder="Base58 address · receives streamed USDC"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>Arbiter pubkey (judge)</span>
            <input
              value={arbiterStr}
              onChange={(e) => setArbiterStr(e.target.value)}
              placeholder="Leave blank to default to connected wallet"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>Deadline (hours from now)</span>
            <input value={deadlineHours} onChange={(e) => setDeadlineHours(e.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Quality threshold (%)</span>
            <input value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} inputMode="numeric" />
          </label>
          <button type="button" className="primary-btn" disabled={busy || !publicKey} onClick={() => void initializeEscrow()}>
            Initialize escrow
          </button>
          <button type="button" className="primary-btn" disabled={busy || !publicKey} onClick={() => void depositEscrow()}>
            Deposit full budget
          </button>
          <p className="chain-hint">
            Checkpoint weights match the demo rubric ({demoCpCount} checkpoints, {bpsSum} bps).
          </p>
        </div>

        <div className="chain-card">
          <h3 className="chain-card-title">2 · Chain state</h3>
          {!escrowAcct ? (
            <p className="chain-muted">No escrow account at this buyer + nonce yet.</p>
          ) : (
            <ul className="chain-state-list">
              <li>
                <span>Deposited</span>
                <strong>{escrowAcct.deposited ? 'yes' : 'no'}</strong>
              </li>
              <li>
                <span>Paused</span>
                <strong>{escrowAcct.paused ? 'yes' : 'no'}</strong>
              </li>
              <li>
                <span>Vault balance (UI)</span>
                <strong>{vaultUiAmount}</strong>
              </li>
              <li>
                <span>Released (raw)</span>
                <strong>{escrowAcct.released.toString()}</strong>
              </li>
              <li>
                <span>Worker</span>
                <strong className="mono">{escrowAcct.worker.toBase58().slice(0, 8)}…</strong>
              </li>
              <li>
                <span>Arbiter</span>
                <strong className="mono">{escrowAcct.arbiter.toBase58().slice(0, 8)}…</strong>
              </li>
              <li>
                <span>Deadline</span>
                <strong>{new Date(escrowAcct.deadlineUnix.toNumber() * 1000).toLocaleString()}</strong>
              </li>
              <li>
                <span>Quality threshold</span>
                <strong>{(escrowAcct.qualityThresholdBps / 100).toFixed(0)}%</strong>
              </li>
              <li>
                <span>Finalized</span>
                <strong>{escrowAcct.finalized ? 'yes' : 'no'}</strong>
              </li>
            </ul>
          )}
          <button type="button" className="ghost-btn" disabled={busy || !workerPk || !publicKey} onClick={() => void ensureWorkerAta()}>
            Create worker USDC ATA (payer = you)
          </button>
          <div className="chain-pause-row">
            <button type="button" className="warn-btn" disabled={busy} onClick={() => void togglePause(true)}>
              Pause streaming
            </button>
            <button type="button" className="ghost-btn" disabled={busy} onClick={() => void togglePause(false)}>
              Unpause
            </button>
          </div>
          <button type="button" className="danger-btn" disabled={busy || !publicKey} onClick={() => void refundBuyer()}>
            Refund vault to buyer (paused or past deadline)
          </button>
          <button type="button" className="primary-btn" disabled={busy || !publicKey || !escrowAcct?.deposited || escrowAcct?.finalized} onClick={() => void finalizeJob()}>
            Finalize · route surplus by quality
          </button>
        </div>

        <div className="chain-card chain-card--wide">
          <h3 className="chain-card-title">3 · Score checkpoints (arbiter wallet)</h3>
          <p className="chain-muted">
            Submit a per-checkpoint score in basis points (0–10000). Each call streams the delta versus prior score for
            that checkpoint as USDC. Repeated calls with rising scores accumulate up to the checkpoint weight ceiling.
          </p>
          <div className="release-grid">
            {demoTitles.map((title, idx) => {
              const weight = escrowAcct?.weights[idx] ?? 0;
              const releasedBps = escrowAcct?.bpsReleasedPerCp[idx] ?? 0;
              const fraction = weight === 0 ? 0 : releasedBps / weight;
              const fullyReleased = checkpointFullyReleased(idx);
              const inputVal = scoreBps[idx] ?? String(weight);
              return (
                <div key={title} className="release-row">
                  <div>
                    <span className="release-idx">{idx + 1}</span>
                    <span className="release-title">{title}</span>
                    {fullyReleased ? <span className="released-tag">paid</span> : null}
                    {!fullyReleased && fraction > 0 ? (
                      <span className="released-tag">{Math.round(fraction * 100)}%</span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      value={inputVal}
                      onChange={(e) => setScoreBps((prev) => ({ ...prev, [idx]: e.target.value }))}
                      style={{ width: 70 }}
                      inputMode="numeric"
                      placeholder="bps"
                      disabled={busy || fullyReleased}
                    />
                    <button
                      type="button"
                      className="small-btn"
                      disabled={busy || !escrowAcct?.deposited || escrowAcct?.paused || escrowAcct?.finalized || fullyReleased}
                      onClick={() => void releaseStreamed(idx, Number(inputVal))}
                    >
                      Release
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {lastSig ? (
        <p className="chain-tx">
          Last signature{' '}
          <a href={explorerTxUrl(lastSig)} target="_blank" rel="noreferrer">
            {lastSig.slice(0, 10)}…
          </a>
        </p>
      ) : null}

      {err ? (
        <pre className="chain-error" role="alert">
          {err}
        </pre>
      ) : null}

      {busy ? <p className="chain-busy">Confirm in wallet…</p> : null}
    </section>
  );
}

async function sha256SpecHash(spec: object): Promise<Uint8Array> {
  const data = new TextEncoder().encode(JSON.stringify(spec));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}
