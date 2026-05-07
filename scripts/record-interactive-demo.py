"""
SOTA live demo recording v2 — chain state visibly populates the dashboard.

Plan:
  · Pick a fresh nonce N for this run.
  · Open localhost:5173?watchBuyer=<buyer>&watchNonce=N in headed Playwright.
    The dashboard's OnChainEscrow component reads the URL params and treats
    that buyer/nonce as the "connected" identity for chain reads. No wallet
    needed — getJob() and getCheckpointProgress() just work.
  · Scroll to the on-chain panels FIRST so they're framed before the agent
    starts firing.
  · Spawn `npm run agent:demo` with the same nonce. As each tx confirms,
    the dashboard's polling picks it up:
       - Hero ledger amount ticks up: $0 → $0.10 → $0.18 → ... → $1.00
       - Chain state card: Deposited yes, Paused yes/no, Released X
       - Score-checkpoint card: each "PAID" tag appears as cp ramps to weight
       - Leaderboard: worker row updates with new lifetime USDC
  · Recording captures all of it.

Output: docs/demo-video/scaffold-interactive-demo.mp4
"""
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path("/Users/amar/Codes/ak/sonsensus")
OUT_DIR = REPO / "docs/demo-video"
RAW_DIR = OUT_DIR / "raw-interactive"
OUT_DIR.mkdir(parents=True, exist_ok=True)
shutil.rmtree(RAW_DIR, ignore_errors=True)
RAW_DIR.mkdir()

BUYER = "0x55981b98768fF51DA43a67d7BB371707C5A8307b"
WORKER = "0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3"
ARBITER = "0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10"
NONCE = str(int(time.time()))

WATCH_URL = (
    f"http://localhost:5173?watchBuyer={BUYER}&watchNonce={NONCE}"
)


def smooth_scroll_to(page, y, steps=24, delay_ms=35):
    page.evaluate(
        """([target, steps, delay]) => {
            const start = window.scrollY;
            const dist  = target - start;
            return new Promise(resolve => {
                let i = 0;
                const tick = () => {
                    i++;
                    const t = i / steps;
                    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
                    window.scrollTo(0, start + dist * e);
                    if (i < steps) setTimeout(tick, delay);
                    else resolve();
                };
                tick();
            });
        }""",
        [y, steps, delay_ms],
    )


def hover(page, selector, hold_ms=900):
    try:
        loc = page.locator(selector).first
        loc.scroll_into_view_if_needed()
        page.wait_for_timeout(180)
        loc.hover()
        page.wait_for_timeout(hold_ms)
    except Exception as exc:
        print(f"  (skip hover {selector}: {exc})")


def main():
    print(f"[demo] NONCE = {NONCE}")
    print(f"[demo] watch URL = {WATCH_URL}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            record_video_dir=str(RAW_DIR),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        # ── Open in watch mode (no wallet required) ──────────────────────
        page.goto(WATCH_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # ── Scene 1 — hero ───────────────────────────────────────────────
        print("scene 1 — hero")
        hover(page, ".brand-name", hold_ms=1200)
        hover(page, ".title", hold_ms=2000)
        hover(page, ".subtitle", hold_ms=2000)

        # ── Scene 2 — checkpoint board (briefly) ─────────────────────────
        print("scene 2 — checkpoint board")
        smooth_scroll_to(page, 1100)
        page.wait_for_timeout(800)
        hover(page, ".board .section-title", hold_ms=1500)
        for i in range(1, 5):
            hover(page, f".checkpoint-grid > *:nth-child({i})", hold_ms=400)

        # ── Scene 3 — POSITION on chain-state card BEFORE firing agent ──
        print("scene 3 — position on chain-state card")
        smooth_scroll_to(page, 2300)
        page.wait_for_timeout(1500)
        hover(page, ".chain-section .chain-title", hold_ms=1500)

        # ── Scene 4 — kick off agent:demo ───────────────────────────────
        print("scene 4 — launching agent:demo")
        env = os.environ.copy()
        env["NONCE"] = NONCE
        env["BUDGET_USDC"] = "1"
        agent_log_path = REPO / "/tmp/agent-demo-watch.log"
        agent_proc = subprocess.Popen(
            ["npm", "run", "agent:demo"],
            cwd=str(REPO),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        agent_state = {"finished": False}

        def stream_agent():
            for line in agent_proc.stdout:  # type: ignore[union-attr]
                if line.startswith("  · ") or line.startswith("[demo]"):
                    print(f"    AGENT: {line.rstrip()}")
            agent_state["finished"] = True

        threading.Thread(target=stream_agent, daemon=True).start()

        # Loop: hover the chain-state card while the first 3 txs (init+approve+
        # deposit) confirm. ~15s.
        for i in range(20):
            hover(page, ".chain-card:nth-of-type(2) .chain-card-title", hold_ms=300)
            hover(page, ".chain-state-list", hold_ms=400) if page.locator(".chain-state-list").count() else None
            page.wait_for_timeout(150)

        # ── Scene 5 — score checkpoints (this is where the panels move) ──
        print("scene 5 — score-by-checkpoint card (live updates)")
        smooth_scroll_to(page, 2900)
        page.wait_for_timeout(800)
        hover(page, ".chain-card--wide .chain-card-title", hold_ms=1500)

        # Hover each checkpoint row in a loop. While we're doing this,
        # releaseStreamed txs land and the "PAID" tags appear in the UI.
        for round_idx in range(3):
            for i in range(1, 10):
                hover(page, f".release-grid > *:nth-child({i})", hold_ms=240)

        # ── Scene 6 — back to hero (ledger ticking) ──────────────────────
        print("scene 6 — hero ledger should now show populated state")
        smooth_scroll_to(page, 0, steps=30)
        page.wait_for_timeout(1500)
        hover(page, ".ledger-card .amount", hold_ms=2500)
        hover(page, ".ledger-grid > *:nth-child(1)", hold_ms=900)
        hover(page, ".ledger-grid > *:nth-child(2)", hold_ms=900)
        hover(page, ".ledger-grid > *:nth-child(3)", hold_ms=900)
        hover(page, ".progress-block", hold_ms=2000)

        # ── Scene 7 — leaderboard ────────────────────────────────────────
        print("scene 7 — leaderboard")
        smooth_scroll_to(page, 3700)
        page.wait_for_timeout(2000)
        hover(page, '[aria-label="Worker leaderboard"] .chain-title', hold_ms=2000)

        # Wait for agent to finish so the final ledger total + finalize lands
        print("  waiting for agent to finish...")
        try:
            agent_proc.wait(timeout=180)
        except subprocess.TimeoutExpired:
            agent_proc.kill()
            agent_proc.wait()
        print("  agent done")
        page.wait_for_timeout(6000)  # let dashboard polls catch up

        # ── Scene 8 — closing pan over hero with final state ─────────────
        print("scene 8 — closing pan")
        smooth_scroll_to(page, 0, steps=40, delay_ms=50)
        page.wait_for_timeout(2500)
        hover(page, ".ledger-card .amount", hold_ms=2200)
        smooth_scroll_to(page, 2300, steps=30)
        page.wait_for_timeout(2000)

        page.close()
        context.close()
        browser.close()

    raws = list(RAW_DIR.glob("*.webm"))
    if not raws:
        raise RuntimeError(f"no video file in {RAW_DIR}")
    src = sorted(raws)[-1]
    out_mp4 = OUT_DIR / "scaffold-interactive-demo.mp4"
    print(f"\nraw: {src} ({src.stat().st_size // 1024} KB)")
    print(f"transcoding to {out_mp4}")
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src),
            "-c:v", "libx264", "-preset", "slow", "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(out_mp4),
        ],
        check=True,
    )
    print(f"done: {out_mp4} ({out_mp4.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
