// Global instances
let statsManager;
let channelsManager;
let logsManager;

class IPTVAdminApp {
    constructor() {
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        console.log('🔄 Initializing IPTV Admin Panel...');
        
        try {
            // Initialize managers
            statsManager = new StatisticsManager();
            channelsManager = new ChannelsManager();
            logsManager = new LogsManager();

            // Start components
            statsManager.init();
            channelsManager.init();
            logsManager.init();

            // Setup global event listeners
            this.setupGlobalEventListeners();
            
            // Setup tabs
            this.setupTabs();
            
            // Initialize playlist
            this.initializePlaylist();

            this.isInitialized = true;
            console.log('✅ IPTV Admin Panel initialized successfully');
            Utils.showNotification('Admin panel initialized successfully', 'success');
            
        } catch (error) {
            console.error('❌ Failed to initialize admin panel:', error);
            Utils.showNotification('Failed to initialize admin panel', 'error');
        }
    }

    setupGlobalEventListeners() {
        // Playlist management
        document.getElementById('generate-playlist')?.addEventListener('click', () => this.generatePlaylist());
        document.getElementById('update-playlist')?.addEventListener('click', () => this.updatePlaylist());
        
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + R to refresh
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                this.refreshAll();
            }
            
            // Escape to cancel edit
            if (e.key === 'Escape') {
                channelsManager.clearForm();
            }
        });
    }

    setupTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.target.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });
    }

    switchTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Deactivate all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Activate target tab
        document.getElementById(tabName)?.classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
        
        // Load tab-specific data
        this.loadTabData(tabName);
    }

    loadTabData(tabName) {
        switch(tabName) {
            case 'clients-tab':
                // You can add client analytics loading here
                break;
            case 'system-logs-tab':
                logsManager.loadSystemLogs();
                break;
            case 'stream-logs-tab':
                logsManager.loadStreamLogs();
                break;
        }
    }

    initializePlaylist() {
        const baseUrl = window.location.origin;
        const playlistUrl = `${baseUrl}/playlist.m3u8?token=default123`;
        document.getElementById('playlist-url-display').textContent = playlistUrl;
    }

    generatePlaylist() {
        const token = document.getElementById('playlist-token')?.value || 'default123';
        const baseUrl = window.location.origin;
        const playlistUrl = `${baseUrl}/playlist.m3u8?token=${token}`;
        document.getElementById('playlist-url-display').textContent = playlistUrl;
        Utils.showNotification('Playlist URL generated', 'success');
    }

    updatePlaylist() {
        const name = document.getElementById('playlist-name')?.value || 'My IPTV Playlist';
        const token = document.getElementById('playlist-token')?.value || 'default123';
        Utils.showNotification(`Playlist "${name}" updated with token: ${token}`, 'info');
    }

    refreshAll() {
        statsManager.updateStatistics();
        channelsManager.loadChannels();
        logsManager.refreshAllLogs();
        Utils.showNotification('All data refreshed', 'info');
    }

    destroy() {
        if (statsManager) {
            statsManager.destroy();
        }
        this.isInitialized = false;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new IPTVAdminApp();
    window.adminApp.init();
});

// Make managers globally available for HTML onclick handlers
window.channelsManager = channelsManager;
