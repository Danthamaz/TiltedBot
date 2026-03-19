#!/bin/bash
# =============================================================================
# TiltedBot - Update Script
# Downloads latest code from GitHub and restarts the bot.
# Uses curl (no git required — the VM doesn't have git installed).
#
# Usage: ~/tilted-bot/deploy/update.sh
# =============================================================================

set -euo pipefail

APP_DIR="$HOME/tilted-bot"
SERVICE_NAME="tilted-bot"
REPO_URL="https://github.com/Danthamaz/TiltedBot"
BRANCH="main"

echo "=== Updating TiltedBot ==="

# Download latest tarball from GitHub
echo "[1/4] Downloading latest code..."
cd /tmp
curl -sL "${REPO_URL}/archive/refs/heads/${BRANCH}.tar.gz" -o tilted-bot-update.tar.gz
tar xzf tilted-bot-update.tar.gz
rm tilted-bot-update.tar.gz

# Sync files (preserve .env, node_modules, tilted.db)
echo "[2/4] Syncing files..."
rsync -a --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='tilted.db' \
  /tmp/TiltedBot-${BRANCH}/ "$APP_DIR/"
rm -rf /tmp/TiltedBot-${BRANCH}

# Reinstall dependencies (in case they changed)
echo "[3/4] Installing dependencies..."
cd "$APP_DIR"
npm ci --production

# Re-deploy slash commands (in case they changed)
echo "[4/4] Deploying slash commands..."
node src/deploy-commands.js

# Restart the service
sudo systemctl restart "$SERVICE_NAME"

echo ""
echo "=== Update complete ==="
sudo systemctl status "$SERVICE_NAME" --no-pager
