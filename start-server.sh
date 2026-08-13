#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  SideScroller - start the game server (Linux / macOS counterpart of
#  start-server.bat). Run it from a terminal or double-click it in a file
#  manager; players then open http://localhost:3000 (or the LAN URL it prints)
#  in a browser. Ctrl+C stops the server - the world is saved on the way out.
#
#  There is no Python in this project, so there is no virtualenv to activate.
#  The only "requirement" is the npm package `ws`, and this script installs it
#  if it is missing - falling back to a direct registry download when npm
#  itself is not on the box (Debian's `nodejs` package ships without npm).
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

MIN_NODE_MAJOR=18   # server/llmbrain.js uses global fetch()
SKIP_INSTALL=0
TMPDIR_DL=""        # scratch dir for the no-npm install path, if it is used

die() { printf '\n  %s\n\n' "$*" >&2; exit 1; }
say() { printf '  %s\n' "$*"; }

# Only fires on the error paths: the successful path removes the scratch dir
# itself and then exec's, which discards traps along with the shell.
cleanup() { if [ -n "$TMPDIR_DL" ]; then rm -rf "$TMPDIR_DL"; fi; }
trap cleanup EXIT

usage() {
  cat <<'EOF'

  Usage: ./start-server.sh [options]

    --port N          listen on port N              (default 3000, env PORT)
    --data DIR        save directory, must end in / (default ../data/, env SS_DATA)
    --llm-url URL     LLM endpoint for AI survivors (env SS_LLM_URL)
    --llm-model NAME  LLM model for AI survivors    (env SS_LLM_MODEL)
    --skip-install    do not touch node_modules, just launch
    -h, --help        show this text

  The LLM options only matter if you turn on LLM bot brains in-game (ESC menu);
  the bots fall back to their heuristic ladder whenever the endpoint is absent.

EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port)       [ $# -ge 2 ] || die "--port needs a value";       export PORT="$2";          shift 2 ;;
    --data)       [ $# -ge 2 ] || die "--data needs a value";       export SS_DATA="$2";       shift 2 ;;
    --llm-url)    [ $# -ge 2 ] || die "--llm-url needs a value";    export SS_LLM_URL="$2";    shift 2 ;;
    --llm-model)  [ $# -ge 2 ] || die "--llm-model needs a value";  export SS_LLM_MODEL="$2";  shift 2 ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            usage; die "unknown option: $1" ;;
  esac
done

# --- Node.js ---------------------------------------------------------------
command -v node >/dev/null 2>&1 || die \
"Node.js was not found on your PATH.
  Install it (Debian/Ubuntu: sudo apt install nodejs) or grab the LTS build
  from https://nodejs.org/, then run this again."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ] || die \
"Node.js $(node -v) is too old - this server needs v${MIN_NODE_MAJOR} or newer."

# --- dependencies ----------------------------------------------------------
# One runtime dependency (ws). Resolve it the way the server will, so a
# half-extracted directory counts as missing rather than as installed.
deps_ok() { node -e 'import("ws").then(()=>0,()=>process.exit(1))' >/dev/null 2>&1; }

# Last resort when npm is unavailable: fetch each production dependency's
# tarball straight from the registry and verify it against package-lock.json.
# Every entry carries its own integrity hash, so this is as trustworthy as npm
# for a lockfile that is already committed.
install_from_lockfile() {
  [ -f package-lock.json ] || die "package-lock.json is missing - cannot install without npm."
  command -v curl >/dev/null 2>&1 || die "Need either npm or curl to install dependencies."

  local plan path url integrity got
  plan=$(node -e '
    const lock = require("./package-lock.json");
    for (const [path, p] of Object.entries(lock.packages || {})) {
      if (!path || p.dev || p.optional || !p.resolved) continue;
      console.log([path, p.resolved, p.integrity || ""].join("\t"));
    }
  ')
  [ -n "$plan" ] || die "No installable dependencies found in package-lock.json."

  TMPDIR_DL=$(mktemp -d)   # cleaned up by the EXIT trap, and again below

  while IFS=$'\t' read -r path url integrity; do
    [ -n "$path" ] || continue
    say "fetching ${path#node_modules/} ..."
    curl -fsSL --max-time 120 -o "$TMPDIR_DL/pkg.tgz" "$url" \
      || die "Download failed: $url"

    case "$integrity" in
      sha512-*)
        got="sha512-$(openssl dgst -sha512 -binary "$TMPDIR_DL/pkg.tgz" | base64 -w0)"
        [ "$got" = "$integrity" ] \
          || die "Integrity check FAILED for ${path#node_modules/} - refusing to install."
        ;;
      "") say "  (no integrity hash in the lockfile - skipping verification)" ;;
      *)  say "  (unrecognised integrity algorithm - skipping verification)" ;;
    esac

    rm -rf "$path"
    mkdir -p "$path"
    tar -xzf "$TMPDIR_DL/pkg.tgz" --strip-components=1 -C "$path"
  done <<< "$plan"

  rm -rf "$TMPDIR_DL"; TMPDIR_DL=""
}

install_deps() {
  echo
  say "Installing dependencies (this happens once)..."
  echo
  if command -v npm >/dev/null 2>&1; then
    npm install --no-fund --no-audit
  elif command -v corepack >/dev/null 2>&1 && corepack npm@10 --version >/dev/null 2>&1; then
    say "npm is not installed; using corepack's npm."
    corepack npm@10 install --no-fund --no-audit
  else
    say "npm is not installed; installing from package-lock.json directly."
    install_from_lockfile
  fi
}

if [ "$SKIP_INSTALL" -eq 0 ] && ! deps_ok; then
  install_deps
  deps_ok || die "Dependencies still missing after install - see the messages above."
fi

# --- launch ----------------------------------------------------------------
echo
say "Starting SideScroller... open the URL below in your browser."
say "Press Ctrl+C to stop the server (the world is saved first)."
echo

exec node server/index.js
