#!/bin/bash
# =============================================================================
# TiltedBot - Update Script
# Run this to pull latest changes and restart the bot.
#
# Usage: ~/tilted-bot/deploy/update.sh
# =============================================================================

set -euo pipefail

APP_DIR="$HOME/tilted-bot"
SERVICE_NAME="tilted-bot"

echo "=== Updating TiltedBot ==="

cd "$APP_DIR"

# Pull latest code
echo "[1/4] Pulling latest changes..."
git pull

# Reinstall dependencies (in case they changed)
echo "[2/4] Installing dependencies..."
npm ci --production

# Re-deploy slash commands (in case they changed)
echo "[3/4] Deploying slash commands..."
node src/deploy-commands.js

# Restart the service
echo "[4/4] Restarting bot..."
sudo systemctl restart "$SERVICE_NAME"

echo ""
echo "=== Update complete ==="
sudo systemctl status "$SERVICE_NAME" --no-pager
