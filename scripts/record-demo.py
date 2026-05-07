"""
Records a silent screen-only walkthrough of the live Scaffold dashboard.

Drives every section in sequence with realistic mouse movement and scrolling.
Output: docs/demo-video/scaffold-walkthrough-silent.mp4 (1920x1080 @ 25fps).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT_DIR = Path("/Users/amar/Codes/ak/sonsensus/docs/demo-video")
OUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR = OUT_DIR / "raw"
RAW_DIR.mkdir(exist_ok=True)


def smooth_scroll_to(page, y, steps=30, delay_ms=40):
    """Animate window.scrollTo so the recording shows movement, not a jump."""
    page.evaluate(f"""
        (() => {{
            const target = {y};
            const start = window.scrollY;
            const dist = target - start;
            const steps = {steps};
            let i = 0;
            return new Promise(resolve => {{
                const tick = () => {{
                    i++;
                    const t = i / steps;
                    // ease-in-out cubic
                    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
                    window.scrollTo(0, start + dist*e);
                    if (i < steps) setTimeout(tick, {delay_ms});
                    else resolve();
                }};
                tick();
            }});
        }})()
    """)


def hover(page, selector, hold_ms=1100):
    try:
        loc = page.locator(selector).first
        loc.scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        loc.hover()
        page.wait_for_timeout(hold_ms)
    except Exception as exc:
        print(f"  (skip hover {selector}: {exc})")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            record_video_dir=str(RAW_DIR),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        # ── Scene 1 — hero ────────────────────────────────────────────────
        print("scene 1: hero")
        page.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(4000)

        # Linger on the hero — the audience reads the title + subtitle while the
        # narrator opens with the pitch.
        hover(page, ".brand-name", hold_ms=1500)
        hover(page, ".title", hold_ms=2200)
        hover(page, ".subtitle", hold_ms=3000)
        hover(page, ".hero-actions button:nth-child(1)")  # Connect Wallet
        hover(page, ".hero-actions button:nth-child(2)")  # Get started
        hover(page, ".hero-meta", hold_ms=1500)

        # ── Scene 2 — ledger card ────────────────────────────────────────
        print("scene 2: ledger card")
        smooth_scroll_to(page, 500)
        page.wait_for_timeout(1800)
        hover(page, ".ledger-card .amount", hold_ms=2500)
        hover(page, ".ledger-grid > *:nth-child(1)", hold_ms=1300)
        hover(page, ".ledger-grid > *:nth-child(2)", hold_ms=1300)
        hover(page, ".ledger-grid > *:nth-child(3)", hold_ms=1300)
        hover(page, ".progress-block", hold_ms=2000)

        # ── Scene 3 — checkpoint board ───────────────────────────────────
        print("scene 3: checkpoint board")
        smooth_scroll_to(page, 1100)
        page.wait_for_timeout(1500)
        hover(page, ".board .section-title", hold_ms=2200)
        for i in range(1, 7):
            hover(page, f".checkpoint-grid > *:nth-child({i})", hold_ms=900)

        # ── Scene 4 — escrow controls (3 cards) ───────────────────────────
        print("scene 4: escrow operator UI")
        smooth_scroll_to(page, 2000)
        page.wait_for_timeout(1200)
        hover(page, ".chain-section .chain-title")
        hover(page, ".chain-meta a:first-of-type")  # explorer link

        # Card 1 — parameters: type into a few fields to show this is a real form
        print("  · filling parameters card")
        page.locator(".chain-card").nth(0).scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        nonce = page.locator(".chain-card").nth(0).locator("input").nth(0)
        nonce.click()
        nonce.fill("")
        nonce.type("42", delay=120)
        page.wait_for_timeout(400)

        budget = page.locator(".chain-card").nth(0).locator("input").nth(1)
        budget.click()
        budget.fill("")
        budget.type("5", delay=120)
        page.wait_for_timeout(400)

        worker = page.locator(".chain-card").nth(0).locator("input").nth(2)
        worker.click()
        worker.fill("")
        worker.type("0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3", delay=20)
        page.wait_for_timeout(800)

        # Hover Initialize button (do not click — wallet not connected)
        hover(page, ".chain-card:nth-of-type(1) .primary-btn", hold_ms=900)

        # Card 2 — chain state
        smooth_scroll_to(page, 2400)
        page.wait_for_timeout(700)
        hover(page, ".chain-card:nth-of-type(2) .chain-card-title")
        hover(page, ".chain-card:nth-of-type(2) .chain-pause-row .warn-btn")
        hover(page, ".chain-card:nth-of-type(2) .danger-btn")

        # Card 3 — score by checkpoint
        smooth_scroll_to(page, 2800)
        page.wait_for_timeout(1200)
        hover(page, ".chain-card--wide .chain-card-title", hold_ms=2200)
        for i in range(1, 6):
            hover(page, f".release-grid > *:nth-child({i}) .small-btn", hold_ms=900)

        # ── Scene 5 — leaderboard ─────────────────────────────────────────
        print("scene 5: leaderboard")
        smooth_scroll_to(page, 3600)
        page.wait_for_timeout(2200)
        hover(page, '[aria-label="Worker leaderboard"] .chain-title', hold_ms=2500)
        hover(page, '[aria-label="Worker leaderboard"] .chain-lede', hold_ms=3000)
        # Linger so the audience reads it
        page.wait_for_timeout(3000)

        # ── Scene 6 — back to hero (closing shot) ─────────────────────────
        print("scene 6: closing")
        smooth_scroll_to(page, 0, steps=50, delay_ms=50)
        page.wait_for_timeout(3500)

        page.close()
        context.close()
        browser.close()

    # The video file is written when context closes; rename it.
    raws = list(RAW_DIR.glob("*.webm"))
    if not raws:
        raise RuntimeError(f"no video file in {RAW_DIR}")
    src = raws[-1]
    print(f"\nraw video: {src} ({src.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
