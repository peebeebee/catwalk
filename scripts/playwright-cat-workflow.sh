#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"
PORT="${PORT:-4173}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
HEADED="${HEADED:-0}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
WAIT_MOVE_MS="${WAIT_MOVE_MS:-1500}"
WAIT_JUMP_MS="${WAIT_JUMP_MS:-900}"
WAIT_SETTLE_MS="${WAIT_SETTLE_MS:-400}"
ALLOW_FILE_FALLBACK="${ALLOW_FILE_FALLBACK:-1}"

OUTPUT_ROOT="${ROOT_DIR}/output/playwright"
RUN_DIR="${OUTPUT_ROOT}/cat-workflow-${RUN_ID}"
FLOW_LOG="${RUN_DIR}/playwright-flow.log"
SERVER_LOG="${RUN_DIR}/http-server.log"
if [[ "${FIXED_SESSION:-0}" == "1" ]]; then
  SESSION="${PLAYWRIGHT_CLI_SESSION:-cat-workflow-fixed}"
else
  # Keep session id short and unique at the front to avoid socket-name truncation collisions.
  SESSION="cwf-$(date +%s)-$RANDOM"
fi
server_pid=""
opened_browser="0"

mkdir -p "$RUN_DIR"

cleanup() {
  local exit_code=$?
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$opened_browser" == "1" ]]; then
    PLAYWRIGHT_CLI_SESSION="$SESSION" "$PWCLI" close >/dev/null 2>&1 || true
  fi

  if [[ "$exit_code" -ne 0 ]]; then
    echo "Workflow failed. Logs:"
    echo "  ${FLOW_LOG}"
    echo "  ${SERVER_LOG}"
  fi
}
trap cleanup EXIT

if ! command -v npx >/dev/null 2>&1; then
  cat <<'EOF'
npx is required but was not found.

# Verify Node/npm are installed
node --version
npm --version

# If missing, install Node.js/npm, then:
npm install -g @playwright/cli@latest
playwright-cli --help
EOF
  exit 1
fi

if [[ ! -f "$PWCLI" ]]; then
  echo "Playwright wrapper not found at: $PWCLI"
  echo "Expected location: \$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  SERVER_CMD=(python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT_DIR")
elif command -v python >/dev/null 2>&1; then
  SERVER_CMD=(python -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT_DIR")
else
  SERVER_CMD=()
fi

wait_for_server() {
  local attempts=60
  local i
  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS "${BASE_URL}/index.html" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$server_pid" >/dev/null 2>&1; then
      return 1
    fi
    sleep 0.25
  done
  return 1
}

target_url="${BASE_URL}/index.html"
file_fallback_url="file://${ROOT_DIR}/index.html"

echo "Run directory: $RUN_DIR"
if [[ "${#SERVER_CMD[@]}" -gt 0 ]]; then
  echo "Starting local server on ${BASE_URL}"
  "${SERVER_CMD[@]}" >"$SERVER_LOG" 2>&1 &
  server_pid=$!

  if command -v curl >/dev/null 2>&1; then
    if ! wait_for_server; then
      if [[ "$ALLOW_FILE_FALLBACK" == "1" ]]; then
        echo "Local server unavailable; falling back to ${file_fallback_url}"
        target_url="$file_fallback_url"
        if [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then
          kill "$server_pid" >/dev/null 2>&1 || true
          wait "$server_pid" >/dev/null 2>&1 || true
        fi
        server_pid=""
      else
        echo "Server failed to start or did not become ready: ${BASE_URL}/index.html"
        exit 1
      fi
    fi
  else
    sleep 1
  fi
else
  if [[ "$ALLOW_FILE_FALLBACK" != "1" ]]; then
    echo "python3/python was not found and file fallback is disabled."
    exit 1
  fi
  echo "python3/python not found; using file URL fallback: ${file_fallback_url}"
  target_url="$file_fallback_url"
fi

pw() {
  PLAYWRIGHT_CLI_SESSION="$SESSION" "$PWCLI" "$@" >>"$FLOW_LOG" 2>&1
}

snapshot_to() {
  local output_file="$1"
  PLAYWRIGHT_CLI_SESSION="$SESSION" "$PWCLI" snapshot >"$output_file" 2>>"$FLOW_LOG"
}

run_code() {
  local js="$1"
  PLAYWRIGHT_CLI_SESSION="$SESSION" "$PWCLI" run-code "$js" >>"$FLOW_LOG" 2>&1
}

save_screenshot() {
  local target_file="$1"
  local marker_file
  local source_file
  marker_file="${RUN_DIR}/.screenshot-marker.$RANDOM.$$"
  : >"$marker_file"

  pw screenshot

  source_file="$(find "${ROOT_DIR}/.playwright-cli" -type f -name "*.png" -newer "$marker_file" 2>/dev/null | sort | tail -n 1)"
  rm -f "$marker_file"

  if [[ -z "$source_file" ]]; then
    echo "Expected screenshot was not created by Playwright CLI." >&2
    return 1
  fi

  cp "$source_file" "$target_file"
}

echo "Running Playwright flow (session: $SESSION)"

open_args=(open "$target_url")
if [[ "$HEADED" == "1" ]]; then
  open_args+=(--headed)
fi

pw "${open_args[@]}"
opened_browser="1"
pw resize 1366 900
snapshot_to "${RUN_DIR}/01-snapshot-initial.txt"
save_screenshot "${RUN_DIR}/01-initial.png"

# Ensure keyboard events hit the canvas-driven app.
run_code "await page.locator('canvas').click()"
pw keydown ArrowRight
run_code "await page.waitForTimeout(${WAIT_MOVE_MS})"
pw press Space
run_code "await page.waitForTimeout(${WAIT_JUMP_MS})"
pw keyup ArrowRight
run_code "await page.waitForTimeout(${WAIT_SETTLE_MS})"

snapshot_to "${RUN_DIR}/02-snapshot-after-jump.txt"
save_screenshot "${RUN_DIR}/02-after-jump.png"

pw keydown ArrowLeft
run_code "await page.waitForTimeout(700)"
pw keyup ArrowLeft
run_code "await page.waitForTimeout(${WAIT_SETTLE_MS})"

snapshot_to "${RUN_DIR}/03-snapshot-final.txt"
save_screenshot "${RUN_DIR}/03-final.png"

{
  echo "Workflow complete."
  echo "Run directory: ${RUN_DIR}"
  echo "Artifacts:"
  echo "  - ${RUN_DIR}/01-snapshot-initial.txt"
  echo "  - ${RUN_DIR}/01-initial.png"
  echo "  - ${RUN_DIR}/02-snapshot-after-jump.txt"
  echo "  - ${RUN_DIR}/02-after-jump.png"
  echo "  - ${RUN_DIR}/03-snapshot-final.txt"
  echo "  - ${RUN_DIR}/03-final.png"
  echo "  - ${FLOW_LOG}"
  echo "  - ${SERVER_LOG}"
} | tee "${RUN_DIR}/README.txt"
