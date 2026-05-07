# Scaffold demo — Loom voiceover script

> **Read at a natural conversational pace.** Total length when read normally: ~2:10–2:30. The video is 1:26 so there's slack — pause briefly between scenes, or pause Loom and read ahead if needed.

**Setup:**
1. Open Loom, click *New Recording* → *Screen and cam* (or *Screen only*).
2. Pick *Custom* size, drag to cover only the video player area, or just record full-screen and crop later.
3. Open `docs/demo-video/scaffold-walkthrough.mp4` in QuickTime full-screen.
4. Hit Loom record, then play the video. Read the script in time with the scenes.

---

## Script

### [0:00 – 0:12] Scene 1 — Hero

> Hi, I'm Amar. This is **Scaffold** — Stripe for verified work, built for the Coinbase × AWS Agentic Hackathon. The pitch in one sentence: AI agents pay each other in real-time USDC on Base, and AWS Bedrock decides how much each side has earned.

### [0:12 – 0:24] Scene 1 (cont.) — what's on screen

> What you're seeing here is the live operator dashboard. Ledger card on the right pulls real numbers from a contract I deployed on Base Sepolia. The "Connect Wallet" button uses RainbowKit, the chip in the top right says "Base Sepolia" — that's not a mock, that's the actual chain.

### [0:24 – 0:36] Scene 2 — Ledger metrics

> Locked, refundable, verified weight — these update on every release. The progress bar is the percentage of the spec we've signed off on so far. The whole flow is wired so this card never shows numbers that don't match on-chain reality.

### [0:36 – 0:48] Scene 3 — Checkpoint board

> Underneath, a structured spec. Nine checkpoints, each with its own basis-point weight that sums to ten thousand. This isn't free text — it's a deterministic rubric. The verifier scores against this exact spec, not vibes.

### [0:48 – 1:05] Scene 4 — Escrow controls (Card 1)

> This is the operator console. Card one — escrow parameters. Buyer fills in nonce, budget in USDC, worker address, deadline, quality threshold. Hit *Initialize escrow* and you get a real Base Sepolia transaction. *Approve and deposit* moves the buyer's USDC into the contract.

### [1:05 – 1:18] Scene 4 (cont.) — Card 2 + 3

> Card two is the live chain state — every field is a contract read, refreshed on every block. *Pause streaming* halts new releases for the failure act. *Finalize* is permissionless — anyone can crank it; outcome is determined by on-chain quality threshold. Card three is where the magic is — the arbiter posts a per-checkpoint score in basis points, and the contract streams the proportional USDC delta to the worker. **Forward-progress only** — funds never go backward.

### [1:18 – 1:26] Scene 5 — Leaderboard

> And here's reputation as on-chain truth. Lifetime USDC released across every Scaffold job, indexed off `ReleaseStreamed` events. You can't fake this — it's just money the verifier signed off on, sitting in a wallet.

### [1:26 – end] Wrap-up (you can keep talking after the video ends)

> The piece you don't see in this video — the verifier API at `localhost:4021`. Every scoring call is paywalled with **x402**, settled in USDC by the **Coinbase x402 Facilitator** on Base, and judged by **AWS Bedrock** with structured tool use. The repo at `github.com/kushwahaamar-dev/scaffold` has eight Foundry tests passing, twenty-one verified Base Sepolia transactions, an AWS CDK stack for Lambda plus API Gateway plus CloudFront, and a Kiro spec at `.kiro/specs/scaffold.md` that drives the architecture. Thanks for watching.

---

## Pacing tips

- **Speak ~140 words per minute.** The script is ~330 words for ~2:10 of audio. Slack at the end gives you breathing room.
- **Hesitate at scene transitions** rather than mid-sentence — gives the viewer a beat to absorb each panel.
- **The video has no audio, so any reverb in your mic is fine.** Record in the quietest room you can find.
- **One take is enough.** Loom's editor lets you trim filler at the start and end.

## After recording

```bash
# Loom auto-uploads. Copy the share URL, then:
sed -i '' 's|https://www.loom.com/share/REPLACE-WITH-LOOM-ID|<your loom URL>|g' README.md
git add README.md
git -c user.email="amar.kushwaha.dev@gmail.com" -c user.name="Amar Kushwaha" \
  commit -m "README: link recorded Loom walkthrough"
git push origin main
```

Or paste the Loom URL to me and I'll do that one-line patch + push.
