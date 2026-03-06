#!/bin/bash
cd "$(dirname "$0")"
# Use nvm node if available, otherwise system node
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found. Install Node or run: source ~/.nvm/nvm.sh"
  exit 1
fi
echo "Starting server (building schedule, may take 15–30 sec)..."
exec node server.js
