#!/bin/bash
#
# Records the user's full screen while running agent:demo on real Base Sepolia.
# The user's Brave tab at localhost:5173 (with their wallet connected) updates
# live as transactions land — that's what gets captured.
#
# Usage:
#   ./scripts/record-live-demo.sh [resume_job_id]
#
# Output:
#   docs/demo-video/scaffold-live-demo.mp4
#
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="docs/demo-video"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/raw-screen.mov"
OUT="$OUT_DIR/scaffold-live-demo.mp4"

RESUME_ID="${1:-}"
NONCE_VAL="${NONCE:-$(date +%s)}"
BUDGET="${BUDGET_USDC:-1}"

cat <<'BANNER'
╔═══════════════════════════════════════════════════════════════════╗
║  SCAFFOLD LIVE DEMO RECORDING                                     ║
║                                                                   ║
║  In 7 seconds I will:                                             ║
║   1. Start full-screen ffmpeg capture                             ║
║   2. Launch agent:demo (~21 real Base Sepolia txs)                ║
║   3. Stop recording when the run finishes                         ║
║                                                                   ║
║  PUT YOUR BRAVE TAB ON SCREEN NOW — make the dashboard visible.   ║
║  If your laptop has multiple displays, I capture display 0.       ║
╚═══════════════════════════════════════════════════════════════════╝
BANNER
for i in 7 6 5 4 3 2 1; do printf "\rstarting in %d... " "$i"; sleep 1; done
printf "\rRECORDING NOW                          \n"

# Start ffmpeg in the background. -framerate 30 is the avfoundation source
# rate; we transcode at -r 30 and CRF 18 for crisp text.
ffmpeg -y \
  -hide_banner -loglevel warning \
  -f avfoundation -framerate 30 -capture_cursor 1 -i "4" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
  -movflags +faststart \
  "$RAW" &
FFPID=$!

# Tiny grace so ffmpeg starts cleanly before the demo fires.
sleep 2

if [[ -n "$RESUME_ID" ]]; then
  RESUME_JOB_ID="$RESUME_ID" npm run agent:demo
else
  NONCE="$NONCE_VAL" BUDGET_USDC="$BUDGET" npm run agent:demo
fi

echo
echo "demo finished — letting the dashboard refresh for 6s before stopping recording"
sleep 6

# Send SIGTERM so ffmpeg writes a clean MOV.
kill -SIGTERM "$FFPID" || true
wait "$FFPID" 2>/dev/null || true

# Copy/transcode to a smaller MP4 if the user wants distribution-friendly output.
if [[ -f "$RAW" ]]; then
  ffmpeg -y -hide_banner -loglevel warning -i "$RAW" \
    -vf "scale=1920:-2" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
    -movflags +faststart \
    "$OUT"
  echo
  echo "═══ DONE ═══"
  echo "  raw (full retina): $RAW"
  ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$RAW" | sed 's/^/    /'
  echo "  1080p mp4:         $OUT"
  ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$OUT" | sed 's/^/    /'
fi
