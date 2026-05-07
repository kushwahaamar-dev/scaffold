import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi';
import { parseUnits, formatUnits, keccak256, toBytes, type Address, type Hex } from 'viem';

import { ERC20_ABI, SCAFFOLD_ESCROW_ABI } from '../chain/abi';
import { escrowAddress, explorerAddressUrl, explorerTxUrl, usdcAddress } from '../chain/config';
import {
  createDemoContract,
  getDemoCheckpointCount,
  getDemoCheckpointWeightsBasisPoints,
} from '../domain/scaffold';

export type EscrowSession = {
  jobId: Hex;
  buyer: Address;
  worker: Address;
  arbiter: Address;
  budget: bigint;
  released: bigint;
  deadline: bigint;
  qualityThresholdBps: number;
  checkpointCount: number;
  deposited: boolean;
  paused: boolean;
  finalized: boolean;
  specHash: Hex;
  weights: number[];
  bpsReleasedPerCp: number[];
} | null;

type Props = { onSession?: (s: EscrowSession) => void };

const USDC_DECIMALS = 6;

export function OnChainEscrow({ onSession }: Props = {}) {
  const chainId = useChainId();
  const account = useAccount();
  const publicClient = usePublicClient();
  const walletClient = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const escrowAddr = useMemo<Address | null>(() => {
    try { return escrowAddress(chainId); } catch { return null; }
  }, [chainId]);
  const usdcAddr = useMemo<Address>(() => usdcAddress(chainId), [chainId]);

  const demoTitles = useMemo(() => createDemoContract().checkpoints.map((c) => c.title), []);
  const demoCpCount = getDemoCheckpointCount();
  const demoWeights = useMemo(() => getDemoCheckpointWeightsBasisPoints(), []);

  const [nonce, setNonce] = useState('1');
  const [budgetUsdc, setBudgetUsdc] = useState('25');
  const [workerStr, setWorkerStr] = useState('');
  const [arbiterStr, setArbiterStr] = useState('');
  const [deadlineHours, setDeadlineHours] = useState('72');
  const [thresholdPct, setThresholdPct] = useState('80');
  const [scoreBps, setScoreBps] = useState<Record<number, string>>({});

  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<Hex | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Compute jobId off-chain (matches solidity keccak256(buyer, nonce))
  const jobId = useMemo<Hex | null>(() => {
    if (!account.address) return null;
    const nonceBig = BigInt(nonce.trim() || '0');
    const buyerBytes = toBytes(account.address);
    const nonceHex = nonceBig.toString(16).padStart(64, '0');
    return keccak256(new Uint8Array([...buyerBytes, ...toBytes(`0x${nonceHex}`)])) as Hex;
  }, [account.address, nonce]);

  const jobRead = useReadContract({
    address: escrowAddr ?? undefined,
    abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'getJob',
    args: jobId ? [jobId] : undefined,
    query: { enabled: !!jobId && !!escrowAddr },
  });

  const session = useMemo<EscrowSession>(() => {
    if (!jobRead.data || !jobId) return null;
    const [
      buyer, worker, arbiter, _token, budget, released,
      deadline, threshold, count, deposited, paused, finalized, specHash,
    ] = jobRead.data as readonly [
      Address, Address, Address, Address, bigint, bigint,
      bigint, number, number, boolean, boolean, boolean, Hex,
    ];
    return {
      jobId,
      buyer, worker, arbiter,
      budget, released,
      deadline,
      qualityThresholdBps: Number(threshold),
      checkpointCount: Number(count),
      deposited, paused, finalized, specHash,
      // Per-checkpoint weights and bps_released are read separately via getCheckpointProgress;
      // for now we rely on the locally-known demoWeights and a fresh on-demand fetch.
      weights: demoWeights.slice(0, Number(count)),
      bpsReleasedPerCp: new Array(Number(count)).fill(0),
    };
  }, [jobRead.data, jobId, demoWeights]);

  // Fetch per-checkpoint progress when the job exists.
  const [progress, setProgress] = useState<number[]>([]);
  useEffect(() => {
    if (!escrowAddr || !jobId || !session || !publicClient) return;
    let cancelled = false;
    (async () => {
      const cps = await Promise.all(
        Array.from({ length: session.checkpointCount }, (_, i) =>
          publicClient.readContract({
            address: escrowAddr,
            abi: SCAFFOLD_ESCROW_ABI,
            functionName: 'getCheckpointProgress',
            args: [jobId, i],
          }) as Promise<readonly [number, number]>,
        ),
      );
      if (!cancelled) {
        setProgress(cps.map((c) => Number(c[1])));
      }
    })();
    return () => { cancelled = true; };
  }, [escrowAddr, jobId, session, publicClient]);

  // Push session up
  useEffect(() => {
    if (!onSession) return;
    if (!session) {
      onSession(null);
      return;
    }
    onSession({ ...session, bpsReleasedPerCp: progress });
  }, [onSession, session, progress]);

  const waitForTx = useWaitForTransactionReceipt({ hash: lastTx ?? undefined, query: { enabled: !!lastTx } });

  // Refetch on tx confirmation.
  useEffect(() => {
    if (waitForTx.data) {
      void jobRead.refetch();
    }
  }, [waitForTx.data, jobRead]);

  const wrap = (label: string, run: () => Promise<Hex>) => async () => {
    setBusy(true); setErr(null);
    try {
      const tx = await run();
      setLastTx(tx);
    } catch (e) {
      setErr(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const initializeJob = wrap('initialize', async () => {
    if (!account.address || !escrowAddr) throw new Error('Connect wallet on Base');
    const worker = workerStr.trim() as Address;
    const arbiter = (arbiterStr.trim() || account.address) as Address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(worker)) throw new Error('Invalid worker address');
    const budget = parseUnits(budgetUsdc, USDC_DECIMALS);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(60, Math.round(Number(deadlineHours) * 3600)));
    const threshold = Math.max(0, Math.min(10000, Math.round(Number(thresholdPct) * 100)));
    const specBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
      worker, arbiter, weights: demoWeights, deadline: deadline.toString(), threshold,
    })));
    const specHash = ('0x' + Array.from(new Uint8Array(specBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
    const weights = [...demoWeights] as unknown as readonly [
      number, number, number, number, number, number, number, number,
      number, number, number, number, number, number, number, number,
    ];
    return await writeContractAsync({
      address: escrowAddr,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'initialize',
      args: [BigInt(nonce), worker, arbiter, usdcAddr, budget, deadline, threshold, demoCpCount, weights, specHash],
    });
  });

  const approveAndDeposit = wrap('approve+deposit', async () => {
    if (!account.address || !escrowAddr || !jobId) throw new Error('Initialize first');
    if (!session) throw new Error('Job not loaded');
    if (!walletClient.data) throw new Error('No wallet client');
    // Approve max USDC, then deposit
    const approveTx = await writeContractAsync({
      address: usdcAddr,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [escrowAddr, session.budget],
    });
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
    return await writeContractAsync({
      address: escrowAddr,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'deposit',
      args: [jobId],
    });
  });

  const releaseStreamed = (idx: number, bps: number) => wrap(`release(${idx}, ${bps})`, async () => {
    if (!escrowAddr || !jobId) throw new Error('Initialize first');
    return await writeContractAsync({
      address: escrowAddr,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed',
      args: [jobId, idx, bps],
    });
  });

  const togglePause = (paused: boolean) => wrap('setPause', async () => {
    if (!escrowAddr || !jobId) throw new Error('Initialize first');
    return await writeContractAsync({
      address: escrowAddr,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'setPause',
      args: [jobId, paused],
    });
  });

  const refundBuyer = wrap('refund', async () => {
    if (!escrowAddr || !jobId) throw new Error('Initialize first');
    return await writeContractAsync({
      address: escrowAddr,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'refundBuyer',
      args: [jobId],
    });
  });

  const finalizeJob = wrap('finalize', async () => {
    if (!escrowAddr || !jobId) throw new Error('Initialize first');
    return await writeContractAsync({
      address: escrowAddr,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'finalizeJob',
      args: [jobId],
    });
  });

  return (
    <section id="escrow" className="chain-section" aria-label="Base escrow controls">
      <div className="chain-head">
        <div>
          <p className="section-label">On-chain escrow</p>
          <h2 className="section-title chain-title">Live USDC flows on Base</h2>
          <p className="section-text chain-lede">
            Deploy <code>ScaffoldEscrow.sol</code> to Base Sepolia, connect a wallet, get devnet USDC from{' '}
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">faucet.circle.com</a>, then step
            through initialize → approve+deposit → score checkpoints → finalize. Refund sends remaining USDC to the
            buyer when paused or past the deadline.
          </p>
          {escrowAddr ? (
            <p className="chain-meta">
              Escrow{' '}
              <a href={explorerAddressUrl(chainId, escrowAddr)} target="_blank" rel="noreferrer">
                {escrowAddr.slice(0, 6)}…{escrowAddr.slice(-4)}
              </a>{' '}
              · USDC{' '}
              <a href={explorerAddressUrl(chainId, usdcAddr)} target="_blank" rel="noreferrer">
                {usdcAddr.slice(0, 6)}…
              </a>
            </p>
          ) : (
            <p className="chain-meta">Set <code>VITE_ESCROW_ADDRESS_SEPOLIA</code> after deploying.</p>
          )}
        </div>
        <div className="chain-wallet-actions">
          <ConnectButton chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      <div className="chain-grid">
        <div className="chain-card">
          <h3 className="chain-card-title">1 · Escrow parameters</h3>
          <label className="field"><span>Nonce (per buyer)</span>
            <input value={nonce} onChange={(e) => setNonce(e.target.value)} inputMode="numeric" />
          </label>
          <label className="field"><span>Budget (USDC, 6 decimals)</span>
            <input value={budgetUsdc} onChange={(e) => setBudgetUsdc(e.target.value)} />
          </label>
          <label className="field"><span>Worker address</span>
            <input value={workerStr} onChange={(e) => setWorkerStr(e.target.value)} placeholder="0x… receives streamed USDC" spellCheck={false} />
          </label>
          <label className="field"><span>Arbiter address (judge)</span>
            <input value={arbiterStr} onChange={(e) => setArbiterStr(e.target.value)} placeholder="Leave blank to default to connected wallet" spellCheck={false} />
          </label>
          <label className="field"><span>Deadline (hours from now)</span>
            <input value={deadlineHours} onChange={(e) => setDeadlineHours(e.target.value)} inputMode="numeric" />
          </label>
          <label className="field"><span>Quality threshold (%)</span>
            <input value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} inputMode="numeric" />
          </label>
          <button type="button" className="primary-btn" disabled={busy || !account.isConnected || !escrowAddr} onClick={initializeJob}>
            Initialize escrow
          </button>
          <button type="button" className="primary-btn" disabled={busy || !account.isConnected || !session || session.deposited} onClick={approveAndDeposit}>
            Approve + deposit budget
          </button>
        </div>

        <div className="chain-card">
          <h3 className="chain-card-title">2 · Chain state</h3>
          {!session ? (
            <p className="chain-muted">No job at this buyer + nonce yet on chain {chainId}.</p>
          ) : (
            <ul className="chain-state-list">
              <li><span>Deposited</span><strong>{session.deposited ? 'yes' : 'no'}</strong></li>
              <li><span>Paused</span><strong>{session.paused ? 'yes' : 'no'}</strong></li>
              <li><span>Finalized</span><strong>{session.finalized ? 'yes' : 'no'}</strong></li>
              <li><span>Budget</span><strong>{formatUnits(session.budget, USDC_DECIMALS)} USDC</strong></li>
              <li><span>Released</span><strong>{formatUnits(session.released, USDC_DECIMALS)} USDC</strong></li>
              <li><span>Worker</span><strong className="mono">{session.worker.slice(0, 8)}…</strong></li>
              <li><span>Arbiter</span><strong className="mono">{session.arbiter.slice(0, 8)}…</strong></li>
              <li><span>Deadline</span><strong>{new Date(Number(session.deadline) * 1000).toLocaleString()}</strong></li>
              <li><span>Quality threshold</span><strong>{(session.qualityThresholdBps / 100).toFixed(0)}%</strong></li>
            </ul>
          )}
          <div className="chain-pause-row">
            <button type="button" className="warn-btn" disabled={busy || !session} onClick={togglePause(true)}>Pause streaming</button>
            <button type="button" className="ghost-btn" disabled={busy || !session} onClick={togglePause(false)}>Unpause</button>
          </div>
          <button type="button" className="danger-btn" disabled={busy || !session} onClick={refundBuyer}>
            Refund vault to buyer (paused or past deadline)
          </button>
          <button type="button" className="primary-btn" disabled={busy || !session?.deposited || session?.finalized} onClick={finalizeJob}>
            Finalize · route surplus by quality
          </button>
        </div>

        <div className="chain-card chain-card--wide">
          <h3 className="chain-card-title">3 · Score checkpoints (arbiter wallet)</h3>
          <p className="chain-muted">
            Submit a per-checkpoint score in basis points (0–10000). Each call streams the delta versus prior score
            for that checkpoint as USDC. Repeated calls with rising scores accumulate up to the checkpoint weight ceiling.
          </p>
          <div className="release-grid">
            {demoTitles.map((title, idx) => {
              const weight = session?.weights[idx] ?? demoWeights[idx];
              const releasedBps = progress[idx] ?? 0;
              const fraction = weight === 0 ? 0 : releasedBps / weight;
              const fullyReleased = fraction >= 1;
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
                  <div className="release-controls">
                    <input
                      className="release-input"
                      value={inputVal}
                      onChange={(e) => setScoreBps((prev) => ({ ...prev, [idx]: e.target.value }))}
                      inputMode="numeric"
                      placeholder="bps"
                      disabled={busy || fullyReleased}
                    />
                    <button
                      type="button"
                      className="small-btn"
                      disabled={busy || !session?.deposited || session?.paused || session?.finalized || fullyReleased}
                      onClick={releaseStreamed(idx, Number(inputVal))}
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

      {lastTx ? (
        <p className="chain-tx">
          Last tx{' '}
          <a href={explorerTxUrl(chainId, lastTx)} target="_blank" rel="noreferrer">
            {lastTx.slice(0, 10)}…
          </a>
          {waitForTx.isLoading ? ' · confirming…' : waitForTx.data ? ' · confirmed' : null}
        </p>
      ) : null}
      {err ? <pre className="chain-error" role="alert">{err}</pre> : null}
      {busy ? <p className="chain-busy">Confirm in wallet…</p> : null}
    </section>
  );
}
