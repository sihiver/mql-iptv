class ChannelsManager {
    constructor() {
        this.channels = [];
        this.editingChannelId = null;
    }

    init() {
        this.loadChannels();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Channel form
        document.getElementById('save-channel')?.addEventListener('click', () => this.saveChannel());
        document.getElementById('add-channel')?.addEventListener('click', () => this.focusChannelForm());
        document.getElementById('refresh-channels')?.addEventListener('click', () => this.loadChannels());
        document.getElementById('stop-all')?.addEventListener('click', () => this.stopAllChannels());
        document.getElementById('import-m3u')?.addEventListener('click', () => this.importM3U());
        
        // Bulk delete
        document.getElementById('select-all-channels')?.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        document.getElementById('delete-selected')?.addEventListener('click', () => this.deleteSelected());
    }

    async loadChannels() {
        try {
            const response = await Utils.fetchWithTimeout('/api/channels');
            if (!response.ok) throw new Error('Failed to fetch channels');
            
            this.channels = await response.json();
            this.renderChannels();
            Utils.showNotification('Channels loaded successfully', 'success');
            
        } catch (error) {
            console.error('Error loading channels:', error);
            Utils.showNotification('Failed to load channels', 'error');
        }
    }

    async renderChannels() {
        const container = document.getElementById('channel-list-container');
        if (!container) return;

        if (this.channels.length === 0) {
            container.innerHTML = `
                <div class="channel-item">
                    <div class="channel-info">
                        <span>No channels found. Add your first channel above.</span>
                    </div>
                </div>
            `;
            return;
        }
        
        // Render in batches for better performance with large channel lists
        const batchSize = 50;
        container.innerHTML = '<div class="loading">Loading channels...</div>';
        
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI to update
        
        const fragments = [];
        for (let i = 0; i < this.channels.length; i += batchSize) {
            const batch = this.channels.slice(i, i + batchSize);
            const html = batch.map(channel => `
                <div class="channel-item" data-channel-id="${channel.id}">
                    <div class="channel-info">
                        <input type="checkbox" class="channel-checkbox" data-channel-id="${channel.id}" style="width: 18px; height: 18px; margin-right: 10px;">
                        <div class="channel-status ${channel.status}"></div>
                        <span><strong>${this.escapeHtml(channel.name)}</strong></span>
                        <small>(${this.escapeHtml(channel.category)})</small>
                        <span class="channel-meta">
                            ${channel.clientCount || 0} clients | 
                            ${channel.bitrate || 2000}kbps | 
                            ${channel.resolution || '720p'}
                        </span>
                    </div>
                    <div class="channel-actions">
                        <button class="action-btn btn-${channel.status === 'active' ? 'danger' : 'success'}" 
                                onclick="channelsManager.toggleChannel(${channel.id})">
                            <i class="fas fa-${channel.status === 'active' ? 'stop' : 'play'}"></i>
                            ${channel.status === 'active' ? 'Stop' : 'Start'}
                        </button>
                        <button class="action-btn btn-primary" onclick="channelsManager.editChannel(${channel.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="action-btn btn-danger" onclick="channelsManager.deleteChannel(${channel.id})">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `).join('');
            fragments.push(html);
            
            // Yield to browser between batches
            if (i + batchSize < this.channels.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        container.innerHTML = fragments.join('');
        
        // Setup checkbox listeners
        this.setupCheckboxListeners();
    }

    async saveChannel() {
        const formData = this.getFormData();
        
        if (!formData.name || !formData.source) {
            Utils.showNotification('Channel name and source URL are required', 'error');
            return;
        }

        const button = document.getElementById('save-channel');
        const originalText = button.innerHTML;
        
        Utils.setLoading(button, true, this.editingChannelId ? 'Updating...' : 'Saving...');

        try {
            let response;
            
            if (this.editingChannelId) {
                // Update existing channel
                response = await Utils.fetchWithTimeout(`/api/channels/${this.editingChannelId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
            } else {
                // Create new channel
                response = await Utils.fetchWithTimeout('/api/channels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
            }
            
            if (!response.ok) throw new Error('Failed to save channel');
            
            await this.loadChannels();
            this.clearForm();
            
            const message = this.editingChannelId ? 
                `Channel "${formData.name}" updated successfully` : 
                `Channel "${formData.name}" added successfully`;
                
            Utils.showNotification(message, 'success');
            
        } catch (error) {
            console.error('Error saving channel:', error);
            Utils.showNotification('Failed to save channel', 'error');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    async toggleChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        try {
            if (channel.status === 'active') {
                await this.stopChannel(channelId);
            } else {
                await this.startChannel(channelId);
            }
        } catch (error) {
            console.error('Error toggling channel:', error);
            Utils.showNotification('Failed to toggle channel', 'error');
        }
    }

    async startChannel(channelId) {
        try {
            const response = await Utils.fetchWithTimeout(`/api/streams/start/${channelId}`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('Failed to start stream');
            
            await this.loadChannels();
            Utils.showNotification(`Stream started for channel`, 'success');
            
        } catch (error) {
            console.error('Error starting stream:', error);
            Utils.showNotification('Failed to start stream', 'error');
        }
    }

    async stopChannel(channelId) {
        try {
            const response = await Utils.fetchWithTimeout(`/api/streams/stop/${channelId}`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('Failed to stop stream');
            
            await this.loadChannels();
            Utils.showNotification(`Stream stopped for channel`, 'warning');
            
        } catch (error) {
            console.error('Error stopping stream:', error);
            Utils.showNotification('Failed to stop stream', 'error');
        }
    }

    async stopAllChannels() {
        if (!confirm('Are you sure you want to stop all channels?')) return;

        const button = document.getElementById('stop-all');
        const originalText = button.innerHTML;
        Utils.setLoading(button, true, 'Stopping...');

        try {
            for (const channel of this.channels) {
                if (channel.status === 'active') {
                    await this.stopChannel(channel.id);
                }
            }
            Utils.showNotification('All channels stopped', 'warning');
        } catch (error) {
            console.error('Error stopping all channels:', error);
            Utils.showNotification('Failed to stop all channels', 'error');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    editChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) return;

        this.editingChannelId = channelId;
        
        // Fill form with channel data
        this.setFormData({
            name: channel.name,
            source: channel.source,
            category: channel.category,
            logo: channel.logo || '',
            bitrate: channel.bitrate || 2000,
            resolution: channel.resolution || '720p'
        });

        // Update UI for edit mode
        const saveButton = document.getElementById('save-channel');
        saveButton.innerHTML = '<i class="fas fa-edit"></i> Update Channel';
        
        Utils.showNotification(`Editing channel "${channel.name}"`, 'info');
    }

    async deleteChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel) {
            Utils.showNotification('Channel not found', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to delete "${channel.name}"?`)) return;

        const channelName = channel.name;

        try {
            const response = await Utils.fetchWithTimeout(`/api/channels/${channelId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to delete channel`);
            }
            
            const result = await response.json();
            console.log('Delete result:', result);
            
            // Reload channels list
            await this.loadChannels();
            
            Utils.showNotification(`Channel "${channelName}" deleted successfully`, 'success');
            
        } catch (error) {
            console.error('Error deleting channel:', error);
            Utils.showNotification(`Failed to delete channel: ${error.message}`, 'error');
        }
    }

    async importM3U() {
        const url = document.getElementById('m3u-url')?.value;
        const content = document.getElementById('m3u-content')?.value;
        
        if (!url && !content) {
            Utils.showNotification('URL or M3U content is required', 'error');
            return;
        }

        const button = document.getElementById('import-m3u');
        const originalText = button.innerHTML;
        Utils.setLoading(button, true, 'Importing...');

        try {
            const response = await Utils.fetchWithTimeout('/api/import/m3u', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, content })
            });
            
            if (!response.ok) throw new Error('Failed to import playlist');
            
            const result = await response.json();
            await this.loadChannels();
            
            // Clear form
            document.getElementById('m3u-url').value = '';
            document.getElementById('m3u-content').value = '';
            
            Utils.showNotification(result.message, 'success');
            
        } catch (error) {
            console.error('Error importing M3U:', error);
            Utils.showNotification('Failed to import playlist', 'error');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    getFormData() {
        return {
            name: document.getElementById('channel-name')?.value || '',
            source: document.getElementById('source-url')?.value || '',
            category: document.getElementById('channel-category')?.value || 'general',
            logo: document.getElementById('channel-logo')?.value || '',
            bitrate: parseInt(document.getElementById('channel-bitrate')?.value || '2000'),
            resolution: document.getElementById('channel-resolution')?.value || '720p'
        };
    }

    setFormData(data) {
        document.getElementById('channel-name').value = data.name || '';
        document.getElementById('source-url').value = data.source || '';
        document.getElementById('channel-category').value = data.category || 'general';
        document.getElementById('channel-logo').value = data.logo || '';
        document.getElementById('channel-bitrate').value = data.bitrate || '2000';
        document.getElementById('channel-resolution').value = data.resolution || '720p';
    }

    clearForm() {
        this.editingChannelId = null;
        this.setFormData({});
        
        // Reset save button
        const saveButton = document.getElementById('save-channel');
        saveButton.innerHTML = '<i class="fas fa-save"></i> Save Channel';
    }

    focusChannelForm() {
        document.getElementById('channel-name')?.focus();
    }

    setupCheckboxListeners() {
        const checkboxes = document.querySelectorAll('.channel-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => this.updateDeleteButton());
        });
        this.updateDeleteButton();
    }

    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.channel-checkbox');
        checkboxes.forEach(cb => cb.checked = checked);
        this.updateDeleteButton();
    }

    updateDeleteButton() {
        const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
        const deleteBtn = document.getElementById('delete-selected');
        const countSpan = document.getElementById('selected-count');
        
        if (checkboxes.length > 0) {
            deleteBtn.style.display = 'inline-block';
            countSpan.textContent = checkboxes.length;
        } else {
            deleteBtn.style.display = 'none';
        }
        
        // Update select all checkbox state
        const allCheckboxes = document.querySelectorAll('.channel-checkbox');
        const selectAllCb = document.getElementById('select-all-channels');
        if (selectAllCb) {
            selectAllCb.checked = allCheckboxes.length > 0 && checkboxes.length === allCheckboxes.length;
        }
    }

    async deleteSelected() {
        const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
        const channelIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.channelId));
        
        if (channelIds.length === 0) {
            Utils.showNotification('No channels selected', 'warning');
            return;
        }

        if (!confirm(`Are you sure you want to delete ${channelIds.length} selected channels?`)) return;

        const deleteBtn = document.getElementById('delete-selected');
        const originalText = deleteBtn.innerHTML;
        Utils.setLoading(deleteBtn, true, 'Deleting...');

        let deleted = 0;
        let failed = 0;

        try {
            for (const channelId of channelIds) {
                try {
                    const response = await Utils.fetchWithTimeout(`/api/channels/${channelId}`, {
                        method: 'DELETE'
                    });
                    
                    if (response.ok) {
                        deleted++;
                    } else {
                        failed++;
                    }
                } catch (error) {
                    console.error(`Failed to delete channel ${channelId}:`, error);
                    failed++;
                }
            }

            await this.loadChannels();
            
            const message = `Deleted ${deleted} channels${failed > 0 ? `, ${failed} failed` : ''}`;
            Utils.showNotification(message, failed > 0 ? 'warning' : 'success');
            
        } catch (error) {
            console.error('Error deleting channels:', error);
            Utils.showNotification('Failed to delete channels', 'error');
        } finally {
            deleteBtn.innerHTML = originalText;
            deleteBtn.disabled = false;
            this.updateDeleteButton();
        }
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
