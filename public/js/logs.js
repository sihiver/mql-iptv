class LogsManager {
    constructor() {
        this.systemLogs = [];
        this.streamLogs = [];
        this.autoRefresh = true;
    }

    init() {
        this.loadSystemLogs();
        this.loadStreamLogs();
        this.setupEventListeners();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.getElementById('refresh-logs')?.addEventListener('click', () => this.refreshAllLogs());
        document.getElementById('clear-logs')?.addEventListener('click', () => this.clearLogsDisplay());
        
        // Tab switching
        document.querySelectorAll('.tab[data-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                if (tabName.includes('logs')) {
                    this.refreshAllLogs();
                }
            });
        });
    }

    async loadSystemLogs() {
        try {
            const response = await Utils.fetchWithTimeout('/api/logs/system?limit=50');
            if (!response.ok) throw new Error('Failed to fetch system logs');
            
            this.systemLogs = await response.json();
            this.renderSystemLogs();
        } catch (error) {
            console.error('Error loading system logs:', error);
        }
    }

    async loadStreamLogs() {
        try {
            const response = await Utils.fetchWithTimeout('/api/logs/stream?limit=50');
            if (!response.ok) throw new Error('Failed to fetch stream logs');
            
            this.streamLogs = await response.json();
            this.renderStreamLogs();
        } catch (error) {
            console.error('Error loading stream logs:', error);
        }
    }

    renderSystemLogs() {
        const container = document.getElementById('system-logs-container');
        if (!container) return;

        if (this.systemLogs.length === 0) {
            container.innerHTML = '<div class="log-entry">No system logs available</div>';
            return;
        }
        
        // Reverse order - newest at bottom
        const reversedLogs = [...this.systemLogs].reverse();
        
        container.innerHTML = reversedLogs.map(log => `
            <div class="log-entry">
                <span class="log-time">[${new Date(log.createdAt).toLocaleTimeString()}]</span>
                <span class="log-${log.level}">${log.level.toUpperCase()}:</span> 
                ${this.escapeHtml(log.message)}
                ${log.details ? `<br><small>Details: ${this.escapeHtml(log.details)}</small>` : ''}
                ${log.ip ? `<br><small>IP: ${this.escapeHtml(log.ip)}</small>` : ''}
            </div>
        `).join('');
        
        this.scrollToBottom(container);
    }

    renderStreamLogs() {
        const container = document.getElementById('stream-logs-container');
        if (!container) return;

        if (this.streamLogs.length === 0) {
            container.innerHTML = '<div class="log-entry">No stream logs available</div>';
            return;
        }
        
        // Reverse order - newest at bottom
        const reversedLogs = [...this.streamLogs].reverse();
        
        container.innerHTML = reversedLogs.map(log => `
            <div class="log-entry">
                <span class="log-time">[${new Date(log.createdAt).toLocaleTimeString()}]</span>
                <span class="log-${log.action === 'error' ? 'error' : 'info'}">${log.action.toUpperCase()}:</span> 
                Channel ${log.channelId} - ${this.escapeHtml(log.message)}
                ${log.clientCount > 0 ? ` (${log.clientCount} clients)` : ''}
                ${log.duration ? ` - Duration: ${Utils.formatTime(log.duration)}` : ''}
            </div>
        `).join('');
        
        this.scrollToBottom(container);
    }

    scrollToBottom(container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    refreshAllLogs() {
        this.loadSystemLogs();
        this.loadStreamLogs();
        Utils.showNotification('Logs refreshed', 'info');
    }

    clearLogsDisplay() {
        if (confirm('Clear all logs from display?')) {
            this.systemLogs = [];
            this.streamLogs = [];
            this.renderSystemLogs();
            this.renderStreamLogs();
            Utils.showNotification('Logs cleared from display', 'warning');
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            if (this.autoRefresh) {
                this.loadSystemLogs();
                this.loadStreamLogs();
            }
        }, 10000); // Refresh every 10 seconds
    }

    setAutoRefresh(enabled) {
        this.autoRefresh = enabled;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
