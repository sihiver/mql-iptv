#!/bin/bash

echo "🗑️  Uninstalling IPTV Server systemctl service..."

# Stop service if running
sudo systemctl stop iptv-server.service 2>/dev/null

# Disable service
sudo systemctl disable iptv-server.service 2>/dev/null

# Remove service file
sudo rm -f /etc/systemd/system/iptv-server.service

# Reload systemd
sudo systemctl daemon-reload

echo "✅ Service uninstalled successfully!"
