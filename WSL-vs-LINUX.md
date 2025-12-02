# WSL vs Linux Server - Quick Guide

## 🔴 Masalah yang Anda alami

**Di WSL:** ✅ Lancar
**Di Linux Server:** ❌ Bermasalah

## 🔍 Perbedaan Utama & Solusi

### 1. Trust Proxy Configuration

**Sebelum (terlalu permissive):**
```javascript
app.set('trust proxy', true); // ❌ Masalah di Linux Server
```

**Sesudah (specific untuk private networks):**
```javascript
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal', 
                        '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']);
```

### 2. IP Detection Logging

**Sebelum:**
- Logging selalu aktif → spam log

**Sesudah:**
- Hanya log jika `DEBUG_IP=true` di `.env`

### 3. Environment Configuration

**Buat file `.env` (copy dari `.env.example`):**
```bash
NODE_ENV=production
PORT=3000
DEBUG_IP=false
AUTO_STOP_DELAY=300000
CLIENT_TIMEOUT=90000
```

## 📋 Langkah Deploy ke Linux Server

### Quick Setup
```bash
# 1. Clone/upload project ke server

# 2. Run setup script
./setup-linux-server.sh

# 3. Edit environment
cp .env.example .env
nano .env

# 4. Test run
npm start

# 5. Install sebagai service
./install-service.sh

# 6. Start service
sudo systemctl start iptv-server
sudo systemctl enable iptv-server

# 7. Check status
sudo systemctl status iptv-server
```

## 🌐 Konfigurasi Network

### Untuk Client di VLAN Berbeda

**Skenario:**
- Server: 172.23.96.130
- Client VLAN 1: 192.168.112.0/24  
- Client VLAN 2: 172.16.88.0/24

**Router harus set header:**
```
X-Forwarded-For: <client_real_ip>
atau
X-Real-IP: <client_real_ip>
```

**Test dari client:**
```bash
# Test basic connectivity
curl -I http://172.23.96.130:3000

# Test playlist
curl http://172.23.96.130:3000/playlist.m3u8?token=default123

# Import ke VLC
vlc http://172.23.96.130:3000/playlist.m3u8?token=default123
```

## 🔧 Troubleshooting

### Check IP Detection
```bash
# Enable debug
echo "DEBUG_IP=true" >> .env

# Restart service
sudo systemctl restart iptv-server

# Watch logs
sudo journalctl -u iptv-server -f
```

### Check Firewall
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --list-ports
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### Check Process
```bash
# Is server running?
ps aux | grep "node.*server.js"

# What port is it listening on?
sudo netstat -tlnp | grep 3000

# Resource usage
top -p $(pgrep -f "node.*server.js")
```

## 📊 Monitoring

### Real-time Logs
```bash
# Systemd journal
sudo journalctl -u iptv-server -f

# Application log
tail -f logs/server.log

# Only errors
sudo journalctl -u iptv-server -p err -f
```

### Check Active Streams
```bash
curl http://localhost:3000/api/streams/active | jq
```

### Check Clients
```bash
curl http://localhost:3000/api/clients/stats | jq
```

## ⚡ Performance Tips

### Linux Server (Production)
1. Use systemd service (not `npm run dev`)
2. Set `NODE_ENV=production`
3. Disable debug logging (`DEBUG_IP=false`)
4. Use reverse proxy (nginx) for SSL
5. Setup log rotation
6. Monitor resources with htop/netdata

### WSL (Development)
1. Use `npm run dev` for auto-reload
2. Enable debug logging
3. Direct access without reverse proxy

## 🔐 Security

### Change Default Token
```bash
# Edit .env
PLAYLIST_TOKEN=your_secure_random_token_here

# Access playlist dengan token baru
http://server:3000/playlist.m3u8?token=your_secure_random_token_here
```

### Rate Limiting (via nginx)
```nginx
limit_req_zone $binary_remote_addr zone=iptv:10m rate=10r/s;

location / {
    limit_req zone=iptv burst=20;
    proxy_pass http://localhost:3000;
}
```

## 📚 Dokumentasi Lengkap

- Setup Guide: `./setup-linux-server.sh --help`
- Troubleshooting: `TROUBLESHOOTING.md`
- Router Config: `router-config-guide.sh`
- Environment vars: `.env.example`

## 🆘 Support

Jika masih ada masalah, kumpulkan informasi berikut:

```bash
# System info
uname -a
cat /etc/os-release

# Network config
ip addr show
ip route show

# Server logs
sudo journalctl -u iptv-server -n 100 > debug.log

# Test connectivity
curl -v http://localhost:3000
```
