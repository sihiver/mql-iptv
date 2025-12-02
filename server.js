const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const os = require('os');

// Database imports
const { testConnection, syncDatabase, Channel, Client, StreamLog, SystemLog } = require('./models');
const DatabaseService = require('./services/databaseService');
const GeoService = require('./services/geoService');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy configuration for both WSL and Linux server
// Trust loopback and private networks (common in router/proxy setups)
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal', 
                        '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Data storage
const CACHE_DIR = path.join(__dirname, 'data', 'stream_cache');
fs.ensureDirSync(CACHE_DIR);

// Stream Cache Class dengan Auto On-Demand
class StreamCache {
  constructor() {
    this.cache = new Map();
    this.clientCounts = new Map();
    this.clientSessions = new Map(); // Track unique clients by IP
    this.clientTimestamps = new Map(); // Track last activity per client IP
    this.cleanupIntervals = new Map();
    this.autoStopDelay = 300000; // 5 minutes - longer delay before auto-stop
    this.clientTimeout = 90000; // Remove client after 90s inactivity (3x playlist refresh)
  }

  async startStream(channelId, sourceUrl) {
    if (this.cache.has(channelId)) {
      console.log(`✅ Stream ${channelId} already active, adding client`);
      return this.cache.get(channelId);
    }

    console.log(`🎬 STARTING STREAM: Channel ${channelId} from ${sourceUrl}`);
    
    const cachePath = path.join(CACHE_DIR, channelId.toString());
    fs.ensureDirSync(cachePath);

    const outputPath = path.join(cachePath, 'index.m3u8');
    
    // FFmpeg command with user-agent and copy mode for HLS sources
    const ffmpegArgs = [
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      '-headers', 'Referer: https://www.cnbcindonesia.com/',
      '-i', sourceUrl,
      '-c', 'copy', // Copy stream instead of re-encoding
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', path.join(cachePath, 'segment_%03d.ts'),
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    
    let ffmpegError = '';
    
    // Capture stderr for debugging
    ffmpegProcess.stderr.on('data', (data) => {
      const message = data.toString();
      ffmpegError += message;
      // Only log important messages
      if (message.includes('error') || message.includes('Error') || message.includes('failed')) {
        console.error(`⚠️ FFmpeg [${channelId}]:`, message.trim());
      }
    });
    
    const streamInfo = {
      channelId,
      process: ffmpegProcess,
      startTime: Date.now(),
      clientCount: 0,
      cachePath,
      outputPath,
      sourceUrl,
      lastActivity: Date.now()
    };

    this.cache.set(channelId, streamInfo);
    this.clientCounts.set(channelId, 0);

    // Log stream start
    await DatabaseService.createStreamLog({
      channelId,
      action: 'start',
      message: `Stream started from ${sourceUrl}`,
      clientCount: 0
    });

    // Setup cleanup interval - check every 30 seconds
    const cleanupInterval = setInterval(() => {
      this.checkAndCleanup(channelId);
    }, 30000);

    this.cleanupIntervals.set(channelId, cleanupInterval);

    ffmpegProcess.on('error', (error) => {
      console.error(`❌ FFmpeg spawn error for channel ${channelId}:`, error);
      DatabaseService.createStreamLog({
        channelId,
        action: 'error',
        message: `FFmpeg spawn error: ${error.message}`
      });
      this.stopStream(channelId);
    });

    ffmpegProcess.on('exit', (code, signal) => {
      // Check if this was intentional stop (signal 15 or message contains "received signal 15")
      const hasSignal15 = signal === 'SIGTERM' || signal === 15 || 
                          ffmpegError.includes('received signal 15') ||
                          ffmpegError.includes('Exiting normally');
      
      const isNormalStop = hasSignal15 || code === null || code === 0;
      
      if (!isNormalStop) {
        // Real error - FFmpeg crashed unexpectedly
        console.error(`❌ FFmpeg crashed for channel ${channelId} - Exit code: ${code}`);
        const errorMsg = ffmpegError.slice(-500);
        if (errorMsg && !errorMsg.includes('Exiting normally')) {
          console.error(`Error details: ${errorMsg}`);
        }
        DatabaseService.createStreamLog({
          channelId,
          action: 'error',
          message: `FFmpeg crashed with code ${code}. ${errorMsg.slice(-200)}`
        });
      } else {
        // Normal stop
        console.log(`✅ FFmpeg stopped normally for channel ${channelId}`);
      }
      this.stopStream(channelId);
    });

    // Wait for HLS playlist
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log(`✅ Stream ${channelId} successfully started`);
    return streamInfo;
  }

  stopStream(channelId) {
    const streamInfo = this.cache.get(channelId);
    if (streamInfo) {
      console.log(`🛑 STOPPING STREAM: Channel ${channelId}`);
      
      // Log stream stop
      DatabaseService.createStreamLog({
        channelId,
        action: 'stop',
        message: 'Stream stopped',
        clientCount: streamInfo.clientCount,
        duration: Date.now() - streamInfo.startTime
      });

      streamInfo.process.kill('SIGTERM');
      
      const interval = this.cleanupIntervals.get(channelId);
      if (interval) {
        clearInterval(interval);
        this.cleanupIntervals.delete(channelId);
      }
      
      try {
        fs.removeSync(streamInfo.cachePath);
      } catch (error) {
        console.log(`⚠️  Failed to cleanup cache for channel ${channelId}`);
      }
      
      this.cache.delete(channelId);
      this.clientCounts.delete(channelId);
      this.clientSessions.delete(channelId);
      this.clientTimestamps.delete(channelId);
    }
  }

  addClient(channelId, clientIp) {
    // Track unique clients by IP to avoid counting multiple requests from same client
    if (!this.clientSessions.has(channelId)) {
      this.clientSessions.set(channelId, new Set());
      this.clientTimestamps.set(channelId, new Map());
    }
    
    const sessions = this.clientSessions.get(channelId);
    const timestamps = this.clientTimestamps.get(channelId);
    const wasNew = !sessions.has(clientIp);
    
    sessions.add(clientIp);
    const oldTimestamp = timestamps.get(clientIp);
    timestamps.set(clientIp, Date.now()); // Update last activity
    
    const currentCount = sessions.size;
    this.clientCounts.set(channelId, currentCount);
    
    const streamInfo = this.cache.get(channelId);
    if (streamInfo) {
      streamInfo.clientCount = currentCount;
      streamInfo.lastActivity = Date.now();
    }
    
    if (wasNew) {
      console.log(`[${new Date().toLocaleTimeString()}] CLIENT_CONNECT: Channel ${channelId} - Client connected from ${clientIp} (${currentCount} clients)`);
    } else {
      const inactiveSecs = oldTimestamp ? Math.round((Date.now() - oldTimestamp) / 1000) : 0;
      console.log(`[${new Date().toLocaleTimeString()}] CLIENT_REFRESH: Channel ${channelId} - ${clientIp} refreshed playlist (inactive: ${inactiveSecs}s, total: ${currentCount} clients)`);
    }
  }

  removeClient(channelId, clientIp) {
    if (!this.clientSessions.has(channelId)) return;
    
    const sessions = this.clientSessions.get(channelId);
    sessions.delete(clientIp);
    
    const newCount = sessions.size;
    this.clientCounts.set(channelId, newCount);
    
    const streamInfo = this.cache.get(channelId);
    if (streamInfo) {
      streamInfo.clientCount = newCount;
      streamInfo.lastActivity = Date.now();
    }
    
    console.log(`👤 Client ${clientIp} disconnected from channel ${channelId}, remaining: ${newCount}`);
    
    // Don't auto-stop immediately - let checkAndCleanup handle it
    // This prevents premature stops when client is just refreshing playlist
  }

  checkAndCleanup(channelId) {
    const streamInfo = this.cache.get(channelId);
    if (!streamInfo) return;
    
    const now = Date.now();
    const idleTime = now - streamInfo.lastActivity;
    
    // Remove inactive clients (no activity for clientTimeout)
    if (this.clientTimestamps.has(channelId)) {
      const timestamps = this.clientTimestamps.get(channelId);
      const sessions = this.clientSessions.get(channelId);
      
      let removedCount = 0;
      for (const [clientIp, lastSeen] of timestamps.entries()) {
        const inactiveTime = now - lastSeen;
        if (inactiveTime > this.clientTimeout) {
          sessions.delete(clientIp);
          timestamps.delete(clientIp);
          removedCount++;
          console.log(`🧹 Removed inactive client ${clientIp} from channel ${channelId} (inactive: ${Math.round(inactiveTime/1000)}s)`);
        }
      }
      
      // Update count
      const newCount = sessions.size;
      this.clientCounts.set(channelId, newCount);
      streamInfo.clientCount = newCount;
      
      if (removedCount > 0) {
        console.log(`📊 Channel ${channelId}: ${newCount} active clients remaining`);
      }
    }
    
    // Only stop stream if truly idle (no clients AND no activity for autoStopDelay)
    if (streamInfo.clientCount === 0 && idleTime > this.autoStopDelay) {
      console.log(`🔄 Auto-stopping channel ${channelId} (no clients, idle: ${Math.round(idleTime/1000)}s)`);
      this.stopStream(channelId);
    } else if (streamInfo.clientCount > 0) {
      // Stream is active, log status
      const uptime = now - streamInfo.startTime;
      console.log(`✅ Channel ${channelId}: ${streamInfo.clientCount} clients, uptime: ${Math.round(uptime/1000)}s, last activity: ${Math.round(idleTime/1000)}s ago`);
    }
  }

  getStreamUrl(channelId) {
    return `/stream/${channelId}/index.m3u8`;
  }

  getStats() {
    const stats = {
      totalCachedStreams: this.cache.size,
      totalClients: Array.from(this.clientCounts.values()).reduce((a, b) => a + b, 0),
      streams: []
    };

    for (const [channelId, streamInfo] of this.cache) {
      stats.streams.push({
        channelId,
        clientCount: streamInfo.clientCount,
        uptime: Date.now() - streamInfo.startTime,
        idleTime: Date.now() - streamInfo.lastActivity
      });
    }

    return stats;
  }

  getActiveStreams() {
    return Array.from(this.cache.values()).map(stream => ({
      channelId: stream.channelId,
      clientCount: stream.clientCount,
      uptime: Date.now() - stream.startTime,
      sourceUrl: stream.sourceUrl
    }));
  }
}

const streamCache = new StreamCache();

// Utility functions
function detectDeviceType(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod/.test(ua)) return 'Mobile';
  if (/tablet|ipad/.test(ua)) return 'Tablet';
  if (/smart-tv|smarttv|hbbtv|netcast|roku/.test(ua)) return 'Smart TV';
  if (/bot|crawler|spider/.test(ua)) return 'Bot';
  return 'Desktop';
}

// Get real client IP from headers (for clients behind proxy/router/VLAN)
function getRealClientIP(req) {
  const DEBUG_IP = process.env.DEBUG_IP === 'true';
  
  // Check X-Forwarded-For header (set by reverse proxy/router)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
    // Take the first IP which is the original client
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    const clientIp = ips[0];
    if (clientIp && clientIp !== '::1' && clientIp !== '127.0.0.1') {
      if (DEBUG_IP) console.log(`🔍 Real IP from X-Forwarded-For: ${clientIp}`);
      return clientIp;
    }
  }
  
  // Check X-Real-IP header (set by some proxies like nginx)
  const realIp = req.headers['x-real-ip'];
  if (realIp && realIp !== '::1' && realIp !== '127.0.0.1') {
    if (DEBUG_IP) console.log(`🔍 Real IP from X-Real-IP: ${realIp}`);
    return realIp;
  }
  
  // Fallback to connection info
  let ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'Unknown';
  
  // Clean up IPv6 localhost and IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7); // Remove ::ffff: prefix
  }
  
  // Convert IPv6 localhost to IPv4
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  
  if (DEBUG_IP) console.log(`🔍 IP detected: ${ip}`);
  return ip;
}

async function trackClient(req, channelId = null) {
  const clientId = uuidv4();
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = getRealClientIP(req);
  const deviceType = detectDeviceType(userAgent);
  
  // Enrich with geo data
  const clientData = await GeoService.enrichClientData({
    clientId,
    ip,
    userAgent,
    deviceType,
    channelId
  });

  try {
    await DatabaseService.createClient(clientData);
    
    // Log client connection
    if (channelId) {
      await DatabaseService.createStreamLog({
        channelId,
        action: 'client_connect',
        message: `Client connected from ${ip}`,
        clientCount: streamCache.clientCounts.get(channelId) || 0
      });
    }

    await DatabaseService.createSystemLog({
      level: 'info',
      module: 'tracking',
      message: `New client connection: ${ip} - ${deviceType}`,
      ip
    });

    return clientId;
  } catch (error) {
    console.error('Error tracking client:', error);
    return clientId;
  }
}

// API Routes dengan Database

// Get all channels
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await DatabaseService.getAllChannels();
    const channelsWithStatus = channels.map(channel => {
      const channelData = channel.toJSON();
      const cacheInfo = streamCache.cache.get(channelData.id);
      return {
        ...channelData,
        status: cacheInfo ? 'active' : 'inactive',
        clientCount: cacheInfo ? cacheInfo.clientCount : 0,
        isCached: !!cacheInfo
      };
    });
    res.json(channelsWithStatus);
  } catch (error) {
    console.error('Error getting channels:', error);
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

// Add new channel
app.post('/api/channels', async (req, res) => {
  try {
    const { name, source, category, logo, bitrate, resolution } = req.body;
    
    if (!name || !source) {
      return res.status(400).json({ error: 'Name and source are required' });
    }
    
    const newChannel = await DatabaseService.createChannel({
      name,
      source,
      category: category || 'General',
      logo: logo || '',
      bitrate: bitrate || 2000,
      resolution: resolution || '720p',
      status: 'inactive'
    });

    await DatabaseService.createSystemLog({
      level: 'success',
      module: 'channels',
      message: `Channel created: ${name}`
    });

    res.json(newChannel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Update channel
app.put('/api/channels/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const channel = await DatabaseService.updateChannel(id, req.body);

    await DatabaseService.createSystemLog({
      level: 'info',
      module: 'channels',
      message: `Channel updated: ${channel.name}`
    });

    res.json(channel);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// Delete channel
app.delete('/api/channels/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const channel = await DatabaseService.getChannelById(id);
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Stop stream if active
    streamCache.stopStream(id);
    
    await DatabaseService.deleteChannel(id);

    await DatabaseService.createSystemLog({
      level: 'warning',
      module: 'channels',
      message: `Channel deleted: ${channel.name}`
    });

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// Import M3U playlist
app.post('/api/import/m3u', async (req, res) => {
  try {
    const { url, content } = req.body;
    let m3uContent = content;

    // Fetch from URL if provided
    if (url) {
      console.log(`📥 Fetching M3U from URL: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch M3U: HTTP ${response.status}`);
      }
      m3uContent = await response.text();
    }

    if (!m3uContent) {
      return res.status(400).json({ error: 'No M3U content provided' });
    }

    // Parse M3U content
    const lines = m3uContent.split('\n');
    const channels = [];
    let currentChannel = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Parse EXTINF line
      if (line.startsWith('#EXTINF:')) {
        currentChannel = {
          name: '',
          source: '',
          category: 'Imported',
          logo: '',
          bitrate: 2000,
          resolution: '720p'
        };

        // Extract channel name (after last comma)
        const nameMatch = line.match(/,(.+)$/);
        if (nameMatch) {
          currentChannel.name = nameMatch[1].trim();
        }

        // Extract logo
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) {
          currentChannel.logo = logoMatch[1];
        }

        // Extract category/group
        const groupMatch = line.match(/group-title="([^"]+)"/);
        if (groupMatch) {
          currentChannel.category = groupMatch[1];
        }
      }
      // Get stream URL (next non-comment line after EXTINF)
      else if (currentChannel && line && !line.startsWith('#')) {
        currentChannel.source = line;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }

    // Save channels to database
    let imported = 0;
    let failed = 0;

    for (const channel of channels) {
      try {
        if (channel.name && channel.source) {
          await DatabaseService.createChannel(channel);
          imported++;
        }
      } catch (error) {
        console.error(`Failed to import channel: ${channel.name}`, error);
        failed++;
      }
    }

    await DatabaseService.createSystemLog({
      level: 'success',
      module: 'import',
      message: `M3U import completed: ${imported} channels imported, ${failed} failed`
    });

    res.json({
      message: `Successfully imported ${imported} channels${failed > 0 ? `, ${failed} failed` : ''}`,
      imported,
      failed,
      total: channels.length
    });

  } catch (error) {
    console.error('Error importing M3U:', error);
    
    await DatabaseService.createSystemLog({
      level: 'error',
      module: 'import',
      message: `M3U import failed: ${error.message}`
    });
    
    res.status(500).json({ error: 'Failed to import M3U playlist', details: error.message });
  }
});

// Manually start stream
app.post('/api/streams/start/:channelId', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId);
    const channel = await DatabaseService.getChannelById(channelId);
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if already active
    if (streamCache.cache.has(channelId)) {
      return res.json({ 
        message: 'Stream already active',
        stream: streamCache.cache.get(channelId)
      });
    }

    // Start the stream
    const streamInfo = await streamCache.startStream(channelId, channel.source);
    
    // Update channel status
    await DatabaseService.updateChannel(channelId, { status: 'active' });

    await DatabaseService.createSystemLog({
      level: 'success',
      module: 'streaming',
      message: `Stream manually started for channel: ${channel.name}`
    });

    res.json({ 
      message: 'Stream started successfully',
      stream: {
        channelId: streamInfo.channelId,
        streamUrl: streamCache.getStreamUrl(channelId)
      }
    });
  } catch (error) {
    console.error('Error starting stream:', error);
    
    await DatabaseService.createSystemLog({
      level: 'error',
      module: 'streaming',
      message: `Failed to start stream: ${error.message}`
    });
    
    res.status(500).json({ error: 'Failed to start stream', details: error.message });
  }
});

// Manually stop stream
app.post('/api/streams/stop/:channelId', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId);
    const channel = await DatabaseService.getChannelById(channelId);
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if stream is active
    if (!streamCache.cache.has(channelId)) {
      return res.json({ message: 'Stream already inactive' });
    }

    // Stop the stream
    streamCache.stopStream(channelId);
    
    // Update channel status
    await DatabaseService.updateChannel(channelId, { status: 'inactive', clientCount: 0 });

    await DatabaseService.createSystemLog({
      level: 'info',
      module: 'streaming',
      message: `Stream manually stopped for channel: ${channel.name}`
    });

    res.json({ message: 'Stream stopped successfully' });
  } catch (error) {
    console.error('Error stopping stream:', error);
    
    await DatabaseService.createSystemLog({
      level: 'error',
      module: 'streaming',
      message: `Failed to stop stream: ${error.message}`
    });
    
    res.status(500).json({ error: 'Failed to stop stream', details: error.message });
  }
});

// Get active streams
app.get('/api/streams/active', async (req, res) => {
  try {
    const activeStreams = streamCache.getActiveStreams();
    res.json(activeStreams);
  } catch (error) {
    console.error('Error getting active streams:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});

// Stream endpoint dengan auto on-demand
app.get('/stream/:channelId/:file', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId);
    const channel = await DatabaseService.getChannelById(channelId);
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Track client
    await trackClient(req, channelId);
    
    // Start stream jika belum aktif (on-demand)
    let streamInfo = streamCache.cache.get(channelId);
    if (!streamInfo) {
      console.log(`🎬 Starting on-demand stream for channel ${channelId}`);
      streamInfo = await streamCache.startStream(channelId, channel.source);
      
      // Update channel status
      await DatabaseService.updateChannel(channelId, { status: 'active' });
    }
    
    const clientIp = getRealClientIP(req);
    
    const filePath = path.join(streamInfo.cachePath, req.params.file);
    
    // Check jika file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Stream segment not found' });
    }
    
    // Set content type
    if (req.params.file.endsWith('.m3u8')) {
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (req.params.file.endsWith('.ts')) {
      res.set('Content-Type', 'video/MP2T');
    }
    
    // Track client ONLY on playlist request, not segments
    // This prevents counting same client multiple times
    const isPlaylistRequest = req.params.file.endsWith('.m3u8');
    if (isPlaylistRequest) {
      streamCache.addClient(channelId, clientIp);
      
      // Update activity timestamp
      const streamInfo = streamCache.cache.get(channelId);
      if (streamInfo) {
        streamInfo.lastActivity = Date.now();
      }
    }
    
    // Serve file
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('Error serving stream:', error);
    
    await DatabaseService.createSystemLog({
      level: 'error',
      module: 'streaming',
      message: `Stream error: ${error.message}`,
      ip: getRealClientIP(req)
    });
    
    res.status(500).json({ error: 'Stream not available' });
  }
});

// Get clients data
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await DatabaseService.getRecentClients(100);
    res.json(clients);
  } catch (error) {
    console.error('Error getting clients:', error);
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

// Get client statistics
app.get('/api/clients/stats', async (req, res) => {
  try {
    const stats = await DatabaseService.getClientStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting client stats:', error);
    res.status(500).json({ error: 'Failed to get client statistics' });
  }
});

// Get system logs
app.get('/api/logs/system', async (req, res) => {
  try {
    const { level, limit } = req.query;
    const logs = await DatabaseService.getSystemLogs(level, parseInt(limit) || 100);
    res.json(logs);
  } catch (error) {
    console.error('Error getting system logs:', error);
    res.status(500).json({ error: 'Failed to get system logs' });
  }
});

// Get stream logs
app.get('/api/logs/stream', async (req, res) => {
  try {
    const { channelId, limit } = req.query;
    const logs = channelId 
      ? await DatabaseService.getChannelStreamLogs(parseInt(channelId), parseInt(limit) || 50)
      : await DatabaseService.getStreamLogs(parseInt(limit) || 100);
    res.json(logs);
  } catch (error) {
    console.error('Error getting stream logs:', error);
    res.status(500).json({ error: 'Failed to get stream logs' });
  }
});

// Get comprehensive statistics
app.get('/api/stats/comprehensive', async (req, res) => {
  try {
    const [systemStats, clientStats, cacheStats] = await Promise.all([
      DatabaseService.getSystemStats(),
      DatabaseService.getClientStats(),
      Promise.resolve(streamCache.getStats())
    ]);

    const bandwidthStats = {
      potentialBandwidth: cacheStats.totalClients * 2,
      actualBandwidth: cacheStats.totalCachedStreams * 2,
      savings: (cacheStats.totalClients * 2) - (cacheStats.totalCachedStreams * 2),
      savingsPercentage: cacheStats.totalClients > 0 
        ? (((cacheStats.totalClients * 2) - (cacheStats.totalCachedStreams * 2)) / (cacheStats.totalClients * 2)) * 100 
        : 0
    };

    res.json({
      system: systemStats,
      clients: clientStats,
      cache: cacheStats,
      bandwidth: bandwidthStats,
      server: {
        uptime: os.uptime(),
        memory: {
          free: os.freemem(),
          total: os.totalmem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
        },
        load: os.loadavg()
      }
    });
  } catch (error) {
    console.error('Error getting comprehensive stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Cleanup old data
app.post('/api/maintenance/cleanup', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const result = await DatabaseService.cleanupOldData(parseInt(days));
    
    await DatabaseService.createSystemLog({
      level: 'info',
      module: 'maintenance',
      message: `Data cleanup completed: ${JSON.stringify(result)}`
    });
    
    res.json({
      message: 'Cleanup completed successfully',
      ...result
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// Generate M3U8 playlist
app.get('/playlist.m3u8', async (req, res) => {
  const token = req.query.token || 'default123';
  
  await trackClient(req);
  
  try {
    const channels = await DatabaseService.getAllChannels();
    
    let playlist = '#EXTM3U\n';
    playlist += '#EXTVLCOPT:network-caching=1000\n\n';
    
    channels.forEach((channel, index) => {
      const channelData = channel.toJSON();
      const channelNumber = index + 1;
      
      // Format sesuai contoh yang berhasil di VLC
      // #EXTINF:-1 attributes,Channel Name
      // http://url
      playlist += `#EXTINF:-1 tvg-chno="${channelNumber}" tvg-id="${channelData.id}" tvg-name="${channelData.name}" tvg-logo="${channelData.logo}" group-title="${channelData.category}",${channelData.name}\n`;
      playlist += `${req.protocol}://${req.get('host')}/stream/${channelData.id}/index.m3u8\n\n`;
    });
    
    // Set proper headers for VLC
    res.set('Content-Type', 'application/x-mpegURL'); // Standard MIME type untuk M3U
    res.set('Content-Disposition', 'inline; filename="IPTV-Channels.m3u"'); // .m3u bukan .m3u8
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(playlist);
  } catch (error) {
    console.error('Error generating playlist:', error);
    res.status(500).json({ error: 'Failed to generate playlist' });
  }
});

// Initialize server
async function initializeServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Sync database
    await syncDatabase(false); // false = jangan force recreate

    console.log('✅ Database initialized successfully');
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
🎉 IPTV Rebroadcast Server with Database Started Successfully!
📍 Server URL: http://0.0.0.0:${PORT}
📊 Admin Panel: http://0.0.0.0:${PORT}/admin  
🎬 Playlist: http://0.0.0.0:${PORT}/playlist.m3u8?token=default123
🗃️  Database: SQLite (./data/iptv.db)
⚡ Mode: AUTO ON-DEMAND with Database
      `);
    });

  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    process.exit(1);
  }
}

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server, cleaning up...');
  
  // Stop all streams
  streamCache.cache.forEach((streamInfo, channelId) => {
    streamCache.stopStream(channelId);
  });
  
  // Log shutdown
  await DatabaseService.createSystemLog({
    level: 'info',
    module: 'system',
    message: 'Server shutdown initiated'
  });
  
  process.exit(0);
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>IPTV Rebroadcast Server with Database</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .links a { display: block; padding: 10px; margin: 10px 0; background: #007cba; color: white; text-decoration: none; border-radius: 5px; text-align: center; }
            .links a:hover { background: #005a87; }
            .db-info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🗃️ IPTV Rebroadcast Server with Database</h1>
                <p>Enhanced server with SQLite database for better data management</p>
            </div>
            
            <div class="db-info">
                <h3>🗃️ Database Features:</h3>
                <ul>
                    <li>Persistent channel storage</li>
                    <li>Client tracking with geo-location</li>
                    <li>Comprehensive logging system</li>
                    <li>Advanced statistics and analytics</li>
                    <li>Auto data cleanup</li>
                </ul>
            </div>
            
            <div class="status">
                <h3>✅ Server Status: Running</h3>
                <p>Port: ${PORT} | Database: SQLite | Mode: Auto On-Demand</p>
            </div>
            
            <div class="links">
                <a href="/admin">📊 Admin Control Panel</a>
                <a href="/playlist.m3u8?token=default123">🎬 IPTV Playlist (M3U8)</a>
                <a href="/api/stats/comprehensive">📈 Advanced Statistics</a>
                <a href="/api/clients/stats">👥 Client Analytics</a>
                <a href="/api/logs/system">📋 System Logs</a>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Start the server
initializeServer();
