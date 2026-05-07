# Scaffold — Loom video script

> **For:** Coinbase × AWS Agentic Hackathon submission (point #7 — *"a video with audio explaining how your project works, how the GitHub repo is structured, a demo of everything working etc."*)
>
> **Target length:** 4:30–5:00. Read at conversational pace (~150 wpm).
> **Format:** Loom *Screen + cam* (small camera bubble bottom-right is fine; voice carries the demo).
> **Recording mode:** Single take. Don't worry about a stumble — Loom auto-trims dead air at the start/end and you can cut a single bad section in the editor afterwards.

---

## Pre-recording checklist (90 seconds)

Before you hit record, set up your screen so you can move through it without looking for things:

| Tab / window | URL or path |
|---|---|
| **Tab 1** — GitHub repo | `https://github.com/kushwahaamar-dev/scaffold` |
| **Tab 2** — Basescan contract page | `https://sepolia.basescan.org/address/0xA1e78f0B227feB3a3043302Afb0A45bC5381af32` |
| **Tab 3** — Live dashboard (watch mode) | `http://localhost:5173/?watchBuyer=0x55981b98768fF51DA43a67d7BB371707C5A8307b&watchNonce=1778167360` |
| **Window 4** — VS Code / Cursor open at `~/Codes/ak/sonsensus` | `code /Users/amar/Codes/ak/sonsensus` |
| **Window 5** — QuickTime or VLC with the demo video paused at 0:00 | `docs/demo-video/scaffold-interactive-demo.mp4` |

Make sure the dev server is up: `npm run dev` in one terminal, browse to Tab 3 and confirm the panels populate (Chain State should show `Deposited: yes, Released: 1 USDC, Finalized: yes`).

Have your script open on a second monitor or phone so you don't break eye contact.

---

## The script (read out loud)

### [0:00 – 0:25] · Hook + problem

> *Open with Tab 1 — the GitHub repo README front and center.*

> "Hey judges, I'm Amar. This is **Scaffold** — submitted to the **Coinbase × AWS Agentic Hackathon**. The one-line pitch: it's **Stripe for verified work on Base**, paid for with **x402** and judged by **AWS Bedrock**.
>
> Here's the problem we solved. When AI agents do work for each other today, payment is binary — pay upfront and pray, or pay on delivery and beg. Platforms like Upwork charge a 20% take rate to run human dispute resolution that doesn't even apply when one side is an AI. We figured the answer is to **make payment a continuous function of verified progress** — score in basis points goes up, USDC streams out, fully on-chain, no humans in the loop."

### [0:25 – 0:55] · Repo structure tour

> *Switch to Tab 1, scroll to the "Repository layout" section in the README. Hover your cursor over each callout as you describe it.*

> "Let me walk you through the repo first.
>
> **`contracts/`** is the Solidity escrow on Base. One contract — `ScaffoldEscrow.sol` — score-scaled streaming USDC, deadline-aware refund, permissionless finalize. Eight Foundry tests passing.
>
> **`agents/`** is the off-chain side. `verifier-server.ts` is the headline file — that's where x402 meets AWS Bedrock. `worker.ts` calls Bedrock to generate the artifact. `demo-runner.ts` is a deterministic 3-act runner I'll show you in a sec.
>
> **`infra/`** is the AWS CDK stack — Lambda, API Gateway, CloudFront, DynamoDB, IAM scoped to `bedrock:InvokeModel`.
>
> **`src/`** is a Vite + React 19 + wagmi + viem dashboard.
>
> And **`.kiro/specs/scaffold.md`** is the durable architecture spec that I used Kiro against. I'll come back to that."

### [0:55 – 2:30] · Live demo (the hero asset)

> *Switch to Window 5 — QuickTime with the demo video. Hit play. Narrate over it for the next 95 seconds. The video is 1:28 long; pace yourself.*

> "OK so **everything you're about to see is real Base Sepolia mainnet — sorry, real Base Sepolia testnet — with twenty-one actual on-chain transactions firing while the camera rolls.** This is `docs/demo-video/scaffold-interactive-demo.mp4` in the repo, recorded by `scripts/record-interactive-demo.py`.

> *[~5s into the video]*
>
> What you're looking at is the operator dashboard. The chip at the top right says **Base Sepolia · x402** — that's not a mock, that's the real chain. Notice the workspace rail on the left: Overview, Escrow Controls, Leaderboard.

> *[~15s into the video, when the cursor is on the checkpoint board]*
>
> Underneath the hero is a **structured spec** — nine checkpoints, each with its own basis-point weight that sums to ten thousand. This is what the verifier scores against. Not free text — a deterministic rubric.

> *[~30s into the video, when typing into Escrow Parameters]*
>
> Now the operator console. Watch the cursor — it's typing a fresh nonce, the budget in USDC, the worker address, the arbiter address. Right after this, the agent starts firing on-chain.

> *[~45s into the video, when scrolled to Chain State card]*
>
> **And here's the real-time piece.** The Chain State card just flipped from "no job at this buyer + nonce yet" to **Deposited: yes, Released: 0.18 USDC** — those numbers are coming from `getJob` on-chain reads polling every four seconds. The dashboard is in *watch mode* — it's reading that specific buyer-nonce combo straight from chain state, no wallet needed.

> *[~60s into the video, score-by-checkpoint card]*
>
> Look at the score-by-checkpoint panel — every row shows a **PAID tag** as its `releaseStreamed` event lands. This is forward-progress only — funds never go backwards. Score goes up, money streams out.

> *[~75s into the video, leaderboard]*
>
> And the leaderboard at the bottom — **earned USDC equals on-chain reputation**. It's indexed off `ReleaseStreamed` events. You can't fake this. It's just money the verifier signed off on, sitting in a wallet.

> *[~88s, closing pan back to hero]*
>
> Closing shot — hero ledger now reads **$1 released, 100% verified weight**, progress bar fully gold. That's the job finalized. Twenty-one transactions. Real Base Sepolia."

### [2:30 – 3:15] · The x402 + AWS half (the hackathon-specific part)

> *Switch back to Tab 1 — the GitHub repo README. Scroll to "How the blockchain interaction works" → §3.3 (x402 wire format).*

> "Now the part the hackathon prompt cares about: **x402 and AWS**.
>
> The verifier API is paywalled. When a worker hits `POST /score` without a payment header, it returns this — *highlight the 402 response in the README* — a canonical x402 v1 body. Network: base-sepolia. Asset: the real Circle USDC address on Base. Payee: the arbiter's wallet. EIP-3009 domain.
>
> The worker uses `wrapFetchWithPayment` from the x402-fetch package, signs an EIP-3009 transferWithAuthorization, retries the call with the X-PAYMENT header, and the x402 facilitator at `x402.org/facilitator` settles the USDC payment on Base.

> *Scroll to §3.4 — verifier inner loop pseudocode.*

> Inside the Lambda, after the payment settles, we call **AWS Bedrock** — Amazon Nova Pro by default, configurable to Claude 3.5 — with structured tool use. The model is forced to call a single function called `submit_scores` that returns `{ checkpoint_id, score_bps, evidence }` for every checkpoint. Then the Lambda — acting as arbiter — signs `releaseStreamed` on Base for any forward-progress checkpoint.

> *Switch to Window 4 — VS Code, open `infra/lib/scaffold-stack.ts`.*

> The CDK stack provisions the Lambda, API Gateway, CloudFront in front, DynamoDB for the score audit log, and IAM scoped tightly to `bedrock:InvokeModel` for the Claude and Nova families. One `cdk deploy` and you have the verifier API live."

### [3:15 – 3:45] · Kiro

> *Switch to VS Code, open `.kiro/specs/scaffold.md`.*

> "And the Kiro piece. This file — `.kiro/specs/scaffold.md` — is the durable architecture spec. It captures trust boundaries, the agent flow, files that shouldn't regress, and explicit extension points. I used Kiro against this spec to scaffold new verifier types and the CDK stack — `kiro build`, `kiro test`, `kiro deploy` all run with this spec as the source of truth. Future contributors don't have to reverse-engineer the architecture, they just read this one file and Kiro guides them."

### [3:45 – 4:15] · The judging criteria callback

> *Back to Tab 1 — README. Scroll to the "How each judging criterion is hit" table.*

> "Quick callback to the criteria:
>
> - **x402** — every score call settles real USDC on Base via the Coinbase facilitator.
> - **AWS** — Bedrock Converse with structured tool use, plus the full CDK stack.
> - **Innovation and real-world relevance** — composable primitive any agent marketplace can mount, eight passing Foundry tests, twenty-one live Base Sepolia transactions you can verify on Basescan right now.
> - **Reusability** — `agents/lib/` is a reusable agent toolkit, the Solidity contract is independently consumable, the CDK template is one command from deploy.
> - **Economic reasoning** — the `/pricing` endpoint is free, returns the price catalog, lets a worker pick between Nova Pro and Nova Lite based on quality threshold proximity.
> - **Kiro** — the spec I just showed you drives the build, test, and deploy commands."

### [4:15 – 4:45] · Verifiable proof + close

> *Switch to Tab 2 — the Basescan contract page.*

> "And finally, all of this is **verifiable on chain right now**. Here's the contract page on Basescan. You can see the transactions from every demo run. The worker wallet at `0xd3df…1Dd3` is currently holding **5.498 USDC** earned across four jobs. The full receipt table is in `DEMO.md` in the repo with every Basescan link.
>
> Repo URL is `github.com/kushwahaamar-dev/scaffold`. The README is structured for hackathon submission point seven — it has the demo video, the screenshots, the blockchain interaction explanation, and a link to this Loom.
>
> Thanks for reviewing. Hit me back if anything is unclear — happy to ship more."

### [4:45 – 5:00] · Outro

> Let Loom record about 3 seconds of silence at the end so the auto-trim doesn't clip your last word.

---

## Editing tips (Loom does most of this for you)

1. **Auto-trim**: Loom strips silence at the start/end automatically. You don't have to do anything.
2. **Cut a fluff section**: If you flub a sentence, click the three-dot menu in the Loom editor → *Trim* → drag the handles → save. ~10 seconds per cut.
3. **Add chapters**: After upload, in the Loom editor click *Chapters* → drop a marker at each section transition. Judges can jump straight to "Live demo" or "Technical architecture". Use the `[X:XX]` timestamps from the script.
4. **Mouse highlight**: Loom defaults to a yellow ring around your cursor. Don't disable it — it's how you point at things in the README and code.
5. **Click-to-zoom**: When you click a button in the live dashboard or a file in VS Code, Loom briefly zooms to that area. Lean into it — it makes hovers visible.
6. **Captions**: Loom auto-generates captions in the editor. Click *Captions* → *Generate* → spot-check for proper nouns ("x402", "Bedrock", "Kiro"). Takes 30 seconds.
7. **Thumbnail**: Loom picks a frame automatically. If it's a confusing one, change to a hero shot — recommend t=0:48 (Chain State card populated) for a strong technical thumbnail.

## After upload

```bash
# Loom gives you a share URL like https://www.loom.com/share/abc123def456...
# Patch the README placeholder:
sed -i '' 's|https://www.loom.com/share/REPLACE-WITH-LOOM-ID|<your loom URL>|g' README.md
git add README.md
git -c user.email="amar.kushwaha.dev@gmail.com" -c user.name="Amar Kushwaha" \
  commit -m "README: link recorded Loom walkthrough"
git push origin main
```

Or just paste the Loom share URL to me and I'll do that one-line patch + push for you.

## Word counts (for pacing reference)

| Section | Approx words | Approx duration @ 150 wpm |
|---|---|---|
| 0:00–0:25 Hook | 90 | 0:24 |
| 0:25–0:55 Repo tour | 130 | 0:30 |
| 0:55–2:30 Live demo narration | 320 | 1:30 |
| 2:30–3:15 x402 + AWS | 175 | 0:45 |
| 3:15–3:45 Kiro | 90 | 0:30 |
| 3:45–4:15 Criteria callback | 130 | 0:30 |
| 4:15–4:45 Proof + close | 110 | 0:30 |
| **Total** | **~1,045** | **~4:39** |

If you naturally talk faster (~170 wpm), expect closer to 4:00. If you pause for breath at section transitions, closer to 5:00. Both are fine — judges just want the story told well.

## What to do if you mess up

- **One stumble**: keep going. Loom's editor lets you cut a 5-second sentence later.
- **Lose your place**: pause for 2 seconds, find your line, continue. Auto-trim handles short pauses cleanly.
- **Want to start over**: don't. Editing one take is faster than re-recording. Loom's editor opens at the cut bar by default.
