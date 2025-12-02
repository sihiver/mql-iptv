// Utility functions
class Utils {
    static showNotification(message, type = 'info', duration = 4000) {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }

    static getDeviceIcon(deviceType) {
        switch(deviceType) {
            case 'Mobile': return '📱';
            case 'Tablet': return '📱';
            case 'Smart TV': return '📺';
            case 'Desktop': return '💻';
            case 'Bot': return '🤖';
            default: return '❓';
        }
    }

    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    static formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static setLoading(button, isLoading, loadingText = 'Loading...') {
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = `<div class="loading"></div> ${loadingText}`;
        } else {
            button.disabled = false;
            // Reset to original content - this should be handled by the caller
        }
    }

    static async fetchWithTimeout(resource, options = {}) {
        const { timeout = 8000 } = options;
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal  
        });
        
        clearTimeout(id);
        return response;
    }
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    Utils.showNotification('An error occurred: ' + e.error?.message, 'error');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    Utils.showNotification('An error occurred: ' + e.reason?.message, 'error');
    e.preventDefault();
});
