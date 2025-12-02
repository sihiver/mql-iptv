#!/bin/bash

echo "🔧 Installing IPTV Server systemctl service..."

# Detect current user and directory
CURRENT_USER=$(whoami)
CURRENT_DIR=$(pwd)
SERVICE_FILE="iptv-server.service"
TEMP_SERVICE="/tmp/iptv-server-temp.service"

# Get port from package.json or use default
PORT=$(grep -o '"PORT":[^,}]*' package.json 2>/dev/null | grep -o '[0-9]*' || echo "3000")
if [ -z "$PORT" ]; then
    PORT=3000
fi

echo "📋 Configuration:"
echo "  User: $CURRENT_USER"
echo "  Directory: $CURRENT_DIR"
echo "  Port: $PORT"
echo ""

# Create temporary service file with dynamic values
sed -e "s|User=.*|User=$CURRENT_USER|"\
    -e "s|WorkingDirectory=.*|WorkingDirectory=$CURRENT_DIR|"\
    -e "s|ExecStart=.*|ExecStart=/usr/bin/node $CURRENT_DIR/server.js|"\
    -e "s|EnvironmentFile=.*|EnvironmentFile=-$CURRENT_DIR/.env|"\
    -e "s|Environment=PORT=.*|Environment=PORT=$PORT|" \
    "$SERVICE_FILE" > "$TEMP_SERVICE"

# Copy service file
sudo cp "$TEMP_SERVICE" /etc/systemd/system/iptv-server.service
rm -f "$TEMP_SERVICE"

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable iptv-server.service

echo ""
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
