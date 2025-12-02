# Troubleshooting - Linux Server vs WSL

## Masalah Umum di Linux Server

### 1. IP Detection Issues

**Gejala:**
- IP client terdeteksi sebagai `192.168.50.1` bukan IP asli dari VLAN
- Log menunjukkan IP yang salah

**Penyebab:**
- Trust proxy tidak dikonfigurasi dengan benar
- Router/proxy tidak mengirim header `X-Forwarded-For` atau `X-Real-IP`

**Solusi:**

#### A. Konfigurasi Server
Edit `.env`:
```bash
DEBUG_IP=true  # Enable untuk debug IP detection
```

Restart server dan lihat log untuk memahami IP mana yang terdeteksi.

#### B. Konfigurasi Router/Proxy

**Untuk NGINX:**
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

**Untuk Apache:**
```apache
ProxyPass / http://localhost:3000/
ProxyPassReverse / http://localhost:3000/
ProxyPreserveHost On
RequestHeader set X-Real-IP %{REMOTE_ADDR}s
RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
```

**Untuk HAProxy:**
```haproxy
frontend iptv_frontend
    bind *:80
    option forwardfor
    http-request set-header X-Real-IP %[src]
    default_backend iptv_backend

backend iptv_backend
    server iptv1 127.0.0.1:3000
```

#### C. Test IP Detection
```bash
# Test dari client
curl -v http://SERVER_IP:3000/playlist.m3u8?token=default123

# Test dengan custom header (simulasi proxy)
curl -H "X-Forwarded-For: 192.168.112.50" http://localhost:3000/playlist.m3u8?token=default123
```

### 2. Stream Restart Loop

**Gejala:**
- Stream stop dan start terus menerus setiap 10-30 detik
- Log menunjukkan: `STOP -> START -> STOP -> START`

**Penyebab:**
- Timeout terlalu pendek
- Client tracking terlalu aggressive

**Solusi:**

Edit `.env`:
```bash
# Tingkatkan timeout
AUTO_STOP_DELAY=300000  # 5 menit
CLIENT_TIMEOUT=90000    # 90 detik
CLEANUP_INTERVAL=30000  # 30 detik
```

### 3. Firewall Blocking

**Gejala:**
- Server running tapi tidak bisa diakses dari client
- Connection timeout

**Solusi:**

**Ubuntu/Debian (UFW):**
```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

**CentOS/RHEL (Firewalld):**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

**iptables:**
```bash
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

### 4. Permission Issues

**Gejala:**
- Error saat membuat cache directory
- Database lock errors

**Solusi:**
```bash
# Set proper permissions
sudo chown -R $USER:$USER /path/to/iptv-server
chmod -R 755 /path/to/iptv-server

# Database directory
chmod 775 data/
chmod 664 data/iptv.db

# Cache directory
chmod 775 data/stream_cache/
```

### 5. Port Already in Use

**Gejala:**
- Error: `EADDRINUSE: address already in use :::3000`

**Solusi:**
```bash
# Find process using port 3000
sudo lsof -i :3000
# or
sudo netstat -nlp | grep :3000

# Kill the process
sudo kill -9 <PID>

# Or change port in .env
PORT=3001
```

### 6. FFmpeg Not Found

**Gejala:**
- Error: `ffmpeg: command not found`
- Stream tidak start

**Solusi:**

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

**CentOS/RHEL:**
```bash
sudo yum install -y epel-release
sudo yum install -y ffmpeg
```

**Custom FFmpeg path:**
Edit `.env`:
```bash
FFMPEG_PATH=/usr/local/bin/ffmpeg
```

### 7. SELinux Issues (CentOS/RHEL)

**Gejala:**
- Permission denied meskipun permission sudah benar
- AVC denials di log

**Solusi:**
```bash
# Temporary disable untuk test
sudo setenforce 0

# Permanent solution
sudo setsebool -P httpd_can_network_connect 1

# Allow port 3000
sudo semanage port -a -t http_port_t -p tcp 3000

# Re-enable SELinux
sudo setenforce 1
```

## Perbedaan WSL vs Linux Server

| Aspek | WSL | Linux Server |
|-------|-----|--------------|
| Network | Bridge ke Windows | Native network stack |
| IP Detection | Mungkin IPv6 mapped | Direct IPv4/IPv6 |
| Firewall | Windows Firewall | iptables/ufw/firewalld |
| systemd | Limited support | Full support |
| Performance | Sedikit overhead | Native performance |
| File permissions | Bisa case-insensitive | Case-sensitive |

## Monitoring & Debugging

### Check Server Status
```bash
# Via systemd
sudo systemctl status iptv-server

# Via logs
tail -f logs/server.log
journalctl -u iptv-server -f

# Check active streams
curl http://localhost:3000/api/streams/active | jq

# Check client stats
curl http://localhost:3000/api/clients/stats | jq
```

### Network Debugging
```bash
# Test connectivity
nc -zv SERVER_IP 3000

# Check listening ports
sudo netstat -tlnp | grep 3000

# Monitor traffic
sudo tcpdump -i any port 3000

# Check routing
ip route get 192.168.112.1
```

### Performance Monitoring
```bash
# CPU & Memory
top -p $(pgrep -f "node.*server.js")

# Network bandwidth
iftop -i eth0

# Disk I/O
iotop -p $(pgrep -f "node.*server.js")
```

## Production Best Practices

1. **Gunakan systemd service** - Bukan `npm run dev`
2. **Set NODE_ENV=production** - Untuk optimasi
3. **Enable log rotation** - Agar disk tidak penuh
4. **Monitor resource usage** - CPU, RAM, bandwidth
5. **Backup database** - Jadwalkan backup `iptv.db`
6. **Gunakan reverse proxy** - nginx/apache untuk SSL dan load balancing
7. **Secure token** - Ganti `PLAYLIST_TOKEN` dari default
8. **Limit connections** - Gunakan rate limiting di proxy

## Support

Jika masalah masih berlanjut:
1. Enable DEBUG_IP=true
2. Capture logs: `journalctl -u iptv-server -n 100 > debug.log`
3. Check network: `ip addr show && ip route show`
4. Test connectivity dari client ke server
