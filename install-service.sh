#!/bin/bash

echo "🔧 Installing IPTV Server systemctl service..."

# Copy service file
sudo cp iptv-server.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable iptv-server.service

echo "✅ Service installed successfully!"
echo ""
echo "📋 Available commands:"
echo "  sudo systemctl start iptv-server    # Start the service"
echo "  sudo systemctl stop iptv-server     # Stop the service"
echo "  sudo systemctl restart iptv-server  # Restart the service"
echo "  sudo systemctl status iptv-server   # Check service status"
echo "  sudo journalctl -u iptv-server -f   # View live logs"
echo ""
echo "🚀 To start the service now, run:"
echo "  sudo systemctl start iptv-server"
