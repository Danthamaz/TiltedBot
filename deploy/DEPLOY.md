# Deploying TiltedBot to Oracle Cloud

## 1. Create the VM

1. Go to [Oracle Cloud Console](https://cloud.oracle.com/)
2. **Compute > Instances > Create Instance**
3. Settings:
   - **Image:** Ubuntu 22.04 (or 24.04)
   - **Shape:** VM.Standard.A1.Flex (free tier — ARM, 1 OCPU, 6 GB RAM is plenty)
   - **SSH key:** Upload your public key (or generate one and download)
   - **Boot volume:** 50 GB default is fine
4. Click **Create** and wait for it to be running.

## 2. Open the firewall (if needed)

TiltedBot only makes outbound connections (to Discord), so you don't need to open any inbound ports beyond SSH (22). The default security list already allows SSH.

## 3. SSH into the VM

```bash
ssh -i ~/.ssh/your-key ubuntu@<VM_PUBLIC_IP>
```

## 4. Clone and set up

```bash
# Clone your repo
git clone https://github.com/YOUR_USER/TiltedBot.git ~/tilted-bot

# Run the setup script
chmod +x ~/tilted-bot/deploy/setup.sh
~/tilted-bot/deploy/setup.sh
```

The setup script will:
- Install Node.js 22, build tools
- Run `npm ci`
- Prompt you to fill in `.env` if it's missing
- Deploy slash commands
- Create and start a systemd service

## 5. Verify it's running

```bash
# Check service status
sudo systemctl status tilted-bot

# Watch live logs
sudo journalctl -u tilted-bot -f
```

## 6. Updating the bot

After pushing changes to your repo:

```bash
~/tilted-bot/deploy/update.sh
```

This pulls latest code, reinstalls dependencies, re-deploys commands, and restarts the service.

## Useful commands

| Command | Description |
|---------|-------------|
| `sudo systemctl status tilted-bot` | Check if bot is running |
| `sudo journalctl -u tilted-bot -f` | Live log tail |
| `sudo journalctl -u tilted-bot --since "1 hour ago"` | Recent logs |
| `sudo systemctl restart tilted-bot` | Restart the bot |
| `sudo systemctl stop tilted-bot` | Stop the bot |
| `nano ~/tilted-bot/.env` | Edit environment variables |

## Notes

- The bot auto-restarts on crash (systemd `Restart=always`).
- The bot starts automatically on VM reboot (systemd `WantedBy=multi-user.target`).
- SQLite database (`*.db`) lives in the project directory and persists across restarts.
- The `.env` file is gitignored — you manage it directly on the VM.
