"""
SOTA live demo recording.

Plan:
  · Playwright Chromium opens the dashboard (headed, visible window).
  · Records video at 1920x1080 @ 25fps via Playwright's built-in.
  · In parallel, runs `npm run agent:demo` so 21 real Base Sepolia
    transactions fire while we drive the UI.
  · The dashboard's wagmi hooks refetch on every block, so the user
    sees the on-chain state move underneath the visible cursor.

Output: docs/demo-video/scaffold-interactive-demo.mp4
"""
import os
import shutil
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path("/Users/amar/Codes/ak/sonsensus")
OUT_DIR = REPO / "docs/demo-video"
RAW_DIR = OUT_DIR / "raw-interactive"
OUT_DIR.mkdir(parents=True, exist_ok=True)
shutil.rmtree(RAW_DIR, ignore_errors=True)
RAW_DIR.mkdir()

NONCE = str(int(time.time()))
WORKER = "0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3"
ARBITER = "0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10"


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
    print(f"[demo] generated NONCE = {NONCE}")
    print(f"[demo] worker  {WORKER}")
    print(f"[demo] arbiter {ARBITER}")
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

        # Scene 0 — open dashboard
        page.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)

        # ── Scene 1 — hero + ledger ──────────────────────────────────────
        print("scene 1 — hero")
        hover(page, ".brand-name", hold_ms=1500)
        hover(page, ".title", hold_ms=2200)
        hover(page, ".subtitle", hold_ms=2500)

        smooth_scroll_to(page, 480)
        page.wait_for_timeout(1200)
        hover(page, ".ledger-card .amount", hold_ms=1800)
        hover(page, ".ledger-grid > *:nth-child(1)", hold_ms=900)
        hover(page, ".ledger-grid > *:nth-child(2)", hold_ms=900)
        hover(page, ".ledger-grid > *:nth-child(3)", hold_ms=900)

        # ── Scene 2 — checkpoint board ───────────────────────────────────
        print("scene 2 — checkpoint board")
        smooth_scroll_to(page, 1100)
        page.wait_for_timeout(900)
        hover(page, ".board .section-title", hold_ms=1500)
        for i in range(1, 6):
            hover(page, f".checkpoint-grid > *:nth-child({i})", hold_ms=550)

        # ── Scene 3 — escrow controls (parameters card) ─────────────────
        print("scene 3 — escrow parameters card")
        smooth_scroll_to(page, 2000)
        page.wait_for_timeout(1000)
        hover(page, ".chain-section .chain-title", hold_ms=1500)
        hover(page, ".chain-meta a:first-of-type", hold_ms=900)

        # Type into the form so the operator sees deliberate input
        first_card = page.locator(".chain-card").nth(0)
        nonce = first_card.locator("input").nth(0)
        nonce.click()
        nonce.fill("")
        nonce.type(NONCE, delay=70)
        page.wait_for_timeout(600)

        budget = first_card.locator("input").nth(1)
        budget.click()
        budget.fill("")
        budget.type("1", delay=120)
        page.wait_for_timeout(600)

        worker_input = first_card.locator("input").nth(2)
        worker_input.click()
        worker_input.fill("")
        worker_input.type(WORKER, delay=15)
        page.wait_for_timeout(800)

        arbiter_input = first_card.locator("input").nth(3)
        arbiter_input.click()
        arbiter_input.fill("")
        arbiter_input.type(ARBITER, delay=15)
        page.wait_for_timeout(1000)

        # Highlight the Initialize button visually (do not click — agent fires from Node)
        hover(page, ".chain-card:nth-of-type(1) .primary-btn", hold_ms=1500)

        # ── Scene 4 — KICK OFF agent:demo (parallel real txs) ───────────
        print("scene 4 — launching agent:demo in parallel")
        env = os.environ.copy()
        env["NONCE"] = NONCE
        env["BUDGET_USDC"] = "1"
        agent_log = open(REPO / "/tmp/agent-demo.log", "w") if False else None
        agent_proc = subprocess.Popen(
            ["npm", "run", "agent:demo"],
            cwd=str(REPO),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        # Watch the agent in a thread; print to console so I can see progress
        import threading

        def stream_agent():
            for line in agent_proc.stdout:  # type: ignore[union-attr]
                # Surface the bullet lines so the recording side knows what's happening
                if line.startswith("  · ") or line.startswith("[demo]"):
                    print(f"    AGENT: {line.rstrip()}")

        threading.Thread(target=stream_agent, daemon=True).start()

        # Now scroll to the chain-state card so the recording shows
        # "no job at this buyer + nonce yet" → populated state
        smooth_scroll_to(page, 2350)
        page.wait_for_timeout(2500)
        hover(page, ".chain-card:nth-of-type(2) .chain-card-title", hold_ms=1500)

        # Spend ~3 seconds on the chain-state card while agent does init + deposit
        for _ in range(8):
            page.wait_for_timeout(500)

        # ── Scene 5 — score-by-checkpoint card (live updates) ───────────
        print("scene 5 — score by checkpoint")
        smooth_scroll_to(page, 2900)
        page.wait_for_timeout(1500)
        hover(page, ".chain-card--wide .chain-card-title", hold_ms=2000)

        # Linger so several releaseStreamed txs land while we watch
        for i in range(1, 6):
            hover(page, f".release-grid > *:nth-child({i}) .small-btn", hold_ms=900)

        # ── Scene 6 — leaderboard ─────────────────────────────────────────
        print("scene 6 — leaderboard")
        smooth_scroll_to(page, 3700)
        page.wait_for_timeout(1500)
        hover(page, '[aria-label="Worker leaderboard"] .chain-title', hold_ms=2200)
        hover(page, '[aria-label="Worker leaderboard"] .chain-lede', hold_ms=2500)

        # Wait for the agent to finish so the leaderboard tick lands on camera
        print("  waiting for agent:demo to finish...")
        try:
            agent_proc.wait(timeout=120)
        except subprocess.TimeoutExpired:
            print("  agent timed out, killing")
            agent_proc.kill()
            agent_proc.wait()
        page.wait_for_timeout(4000)  # leaderboard refresh interval

        # Force a leaderboard refresh by reloading and scrolling back
        print("scene 7 — closing shot (refresh + scroll to top)")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(3000)
        smooth_scroll_to(page, 3700, steps=30)
        page.wait_for_timeout(3500)
        smooth_scroll_to(page, 0, steps=40)
        page.wait_for_timeout(2500)

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
