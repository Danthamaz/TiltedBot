#!/bin/bash
# =============================================================================
# TiltedBot - Oracle Cloud VM Setup Script
# Run this ONCE on a fresh Ubuntu VM to install everything and start the bot.
#
# Usage:
#   1. SSH into your VM
#   2. Clone your repo: git clone <your-repo-url> ~/tilted-bot
#   3. Run: chmod +x ~/tilted-bot/deploy/setup.sh && ~/tilted-bot/deploy/setup.sh
# =============================================================================

set -euo pipefail

APP_DIR="$HOME/tilted-bot"
SERVICE_NAME="tilted-bot"

echo "=== TiltedBot VM Setup ==="

# --- 1. System packages ---
echo "[1/6] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# build-essential + python3 needed for better-sqlite3 native compilation
echo "[2/6] Installing build tools..."
sudo apt-get install -y curl git build-essential python3

# --- 2. Node.js 22 LTS via NodeSource ---
echo "[3/6] Installing Node.js 22..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# --- 3. Install dependencies ---
echo "[4/6] Installing npm dependencies..."
cd "$APP_DIR"
npm ci --production

# --- 4. Prompt for .env if missing ---
if [ ! -f "$APP_DIR/.env" ]; then
    echo ""
    echo "=== .env file not found ==="
    echo "Create it now. You need these values from the Discord Developer Portal:"
    echo ""
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo "Copied .env.example -> .env"
    echo "Edit it with: nano $APP_DIR/.env"
    echo ""
    read -rp "Press Enter after you've edited .env to continue..."
fi

# --- 5. Deploy slash commands ---
echo "[5/6] Deploying Discord slash commands..."
cd "$APP_DIR"
node src/deploy-commands.js

# --- 6. Install systemd service ---
echo "[6/6] Setting up systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=TiltedBot Discord Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=$(which node) src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Your bot is running! Useful commands:"
echo "  sudo systemctl status $SERVICE_NAME    # Check status"
echo "  sudo journalctl -u $SERVICE_NAME -f    # Live logs"
echo "  sudo systemctl restart $SERVICE_NAME   # Restart"
echo "  sudo systemctl stop $SERVICE_NAME      # Stop"
echo ""
