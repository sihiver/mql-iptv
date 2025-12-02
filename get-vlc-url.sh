#!/bin/bash
# Get WSL IP for VLC on Windows

WSL_IP=$(ip addr show eth0 | grep "inet " | awk '{print $2}' | cut -d/ -f1)

echo "================================================"
echo "   IPTV SERVER - VLC URL (Windows)"
echo "================================================"
echo ""
echo "Copy URL ini ke VLC di Windows:"
echo ""
echo "  http://$WSL_IP:3000/playlist.m3u8?token=default123"
echo ""
echo "================================================"
echo "Cara pakai di VLC:"
echo "1. Buka VLC Media Player (di Windows)"
echo "2. Media → Open Network Stream (Ctrl+N)"
echo "3. Paste URL di atas"
echo "4. Klik Play"
echo "================================================"
