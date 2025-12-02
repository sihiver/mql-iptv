class StatisticsManager {
    constructor() {
        this.bandwidthHistory = [];
        this.bandwidthChart = null;
        this.stats = {};
        this.updateInterval = null;
    }

    init() {
        this.setupChart();
        this.startAutoUpdate();
    }

    setupChart() {
        const ctx = document.getElementById('bandwidthChart')?.getContext('2d');
        if (!ctx) return;

        this.bandwidthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Bandwidth Savings (Mbps)',
                    data: [],
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Mbps Saved'
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });
    }

    async updateStatistics() {
        try {
            const response = await Utils.fetchWithTimeout('/api/stats/comprehensive');
            if (!response.ok) throw new Error('Failed to fetch stats');
            
            this.stats = await response.json();
            this.updateDisplay();
            this.updateChart();
            
        } catch (error) {
            console.error('Error updating statistics:', error);
            if (!error.message.includes('abort')) {
                Utils.showNotification('Failed to update statistics', 'error');
            }
        }
    }

    updateDisplay() {
        if (!this.stats.system) return;
        
        // Update header stats
        this.updateElement('total-channels', this.stats.system.totalChannels);
        this.updateElement('active-streams', this.stats.cache.totalCachedStreams);
        this.updateElement('connected-clients', this.stats.cache.totalClients);
        
        // Update stat cards
        this.updateElement('stat-total-channels', this.stats.system.totalChannels);
        this.updateElement('stat-active-streams', this.stats.cache.totalCachedStreams);
        this.updateElement('stat-total-clients', this.stats.system.totalClients);
        this.updateElement('stat-today-clients', this.stats.system.todayClients);
        
        // Update bandwidth stats
        this.updateElement('bandwidth-savings', `${this.stats.bandwidth.savings} Mbps`);
        this.updateElement('savings-percentage', `${this.stats.bandwidth.savingsPercentage.toFixed(1)}%`);
        this.updateElement('potential-bandwidth', `${this.stats.bandwidth.potentialBandwidth} Mbps`);
        this.updateElement('actual-bandwidth', `${this.stats.bandwidth.actualBandwidth} Mbps`);
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    updateChart() {
        if (!this.bandwidthChart || !this.stats.bandwidth) return;

        const now = new Date();
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        this.bandwidthHistory.push({
            time: time,
            savings: this.stats.bandwidth.savings
        });
        
        // Keep only last 15 entries for better visibility
        if (this.bandwidthHistory.length > 15) {
            this.bandwidthHistory.shift();
        }
        
        this.bandwidthChart.data.labels = this.bandwidthHistory.map(d => d.time);
        this.bandwidthChart.data.datasets[0].data = this.bandwidthHistory.map(d => d.savings);
        this.bandwidthChart.update('none');
    }

    startAutoUpdate() {
        // Update immediately
        this.updateStatistics();
        
        // Then update every 5 seconds
        this.updateInterval = setInterval(() => {
            this.updateStatistics();
        }, 5000);
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    destroy() {
        this.stopAutoUpdate();
        if (this.bandwidthChart) {
            this.bandwidthChart.destroy();
        }
    }
}
