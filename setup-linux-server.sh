#!/bin/bash

echo "🔧 IPTV Server - Linux Production Setup"
echo "========================================"
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
fi

echo "📋 Detected OS: $OS $VER"
echo ""

# Check if running in WSL
if grep -qi microsoft /proc/version; then
    echo "⚠️  WSL detected - This script is for native Linux servers"
    echo "   For WSL, use: npm run dev"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "1️⃣  Checking dependencies..."
echo "----------------------------"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    echo "   Install: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "           sudo apt-get install -y nodejs"
    exit 1
else
    echo "✅ Node.js $(node --version)"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
else
    echo "✅ npm $(npm --version)"
fi

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg not found"
    echo "   Install: sudo apt-get install -y ffmpeg"
    read -p "Install FFmpeg now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    fi
else
    echo "✅ FFmpeg $(ffmpeg -version | head -1)"
fi

echo ""
echo "2️⃣  Installing Node packages..."
echo "-------------------------------"
npm install

echo ""
echo "3️⃣  Setting up environment..."
echo "----------------------------"

if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created - Please edit it for your configuration"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "4️⃣  Setting up directories..."
echo "----------------------------"
mkdir -p data/stream_cache
mkdir -p logs
echo "✅ Directories created"

echo ""
echo "5️⃣  Checking network configuration..."
echo "-------------------------------------"
echo "Server will bind to: 0.0.0.0:3000"
echo "Network interfaces:"
ip addr show | grep -E "inet " | grep -v "127.0.0.1" | awk '{print "  - " $2}'

echo ""
echo "6️⃣  Firewall configuration..."
echo "----------------------------"
if command -v ufw &> /dev/null; then
    echo "UFW firewall detected"
    echo "To allow access to port 3000:"
    echo "  sudo ufw allow 3000/tcp"
elif command -v firewall-cmd &> /dev/null; then
    echo "Firewalld detected"
    echo "To allow access to port 3000:"
    echo "  sudo firewall-cmd --permanent --add-port=3000/tcp"
    echo "  sudo firewall-cmd --reload"
else
    echo "No firewall detected or iptables in use"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "----------------------------"
echo "1. Edit .env file if needed: nano .env"
echo "2. Test the server: npm start"
echo "3. Install as systemd service: ./install-service.sh"
echo ""
echo "🌐 Access URLs:"
echo "   Admin Panel: http://$(hostname -I | awk '{print $1}'):3000/admin"
echo "   Playlist: http://$(hostname -I | awk '{print $1}'):3000/playlist.m3u8?token=default123"
echo ""
