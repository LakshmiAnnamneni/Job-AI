#!/usr/bin/env bash
# Adds a Gmail MCP server to Claude Code for THIS project only (local scope), using
# YOUR OWN Google OAuth client. Nothing is written into the repo: the config lives in
# your Claude Code settings and the client secret in your OS keychain.
#
# Prerequisite: a Google OAuth client (Desktop app). See docs/SETUP.md, "Gmail access".
# Usage: npm run setup:gmail

set -euo pipefail
cd "$(dirname "$0")/.."

NAME="gmail-personal"
URL="https://gmailmcp.googleapis.com/mcp/v1"
PORT="${GMAIL_MCP_CALLBACK_PORT:-8080}"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI ('claude') not found on PATH. Install it first: https://claude.com/claude-code" >&2
  exit 1
fi

if claude mcp get "$NAME" >/dev/null 2>&1; then
  read -r -p "'$NAME' is already configured for this project. Replace it? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Left unchanged."; exit 0; }
  claude mcp remove "$NAME" -s local
fi

read -r -p "Google OAuth Client ID (ends in .apps.googleusercontent.com): " CLIENT_ID
if [[ "$CLIENT_ID" != *.apps.googleusercontent.com ]]; then
  echo "That doesn't look like a Google OAuth client ID. See docs/SETUP.md." >&2
  exit 1
fi

echo "You'll be prompted for the client secret next (input is hidden)."
claude mcp add --transport http --scope local \
  --client-id "$CLIENT_ID" --client-secret --callback-port "$PORT" \
  "$NAME" "$URL"

cat <<EOF

Done. '$NAME' is available only when Claude Code runs in $(pwd).
Next: restart Claude Code here, run /mcp, choose '$NAME' -> Authenticate,
and approve access in the browser (Google will warn the app is unverified;
that's expected for your own Testing-mode client, so choose Continue).
EOF
