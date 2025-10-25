// sidepanel.js - LegalGuard Side Panel
class LegalGuardSidePanel {
    constructor() {
        this.currentData = null;
        this.currentMatchIndex = 0;
        this.totalMatches = 0;
        this.init();
    }

    async init() {
        console.log('[LegalGuard] Side panel DOM ready and initialized');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Request data from content script
        await this.requestPageData();
        
        // Load mute state
        await this.loadMuteState();
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('prevBtn')?.addEventListener('click', () => this.navigateMatch(-1));
        document.getElementById('nextBtn')?.addEventListener('click', () => this.navigateMatch(1));
        document.getElementById('clearBtn')?.addEventListener('click', () => this.clearHighlights());
        
        // Mute toggle
        document.getElementById('muteToggle')?.addEventListener('change', (e) => {
            this.toggleMute(e.target.checked);
        });
    }

    async requestPageData() {
        try {
            // Get the current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showEmptyState('No active tab found');
                return;
            }

            console.log('[LegalGuard] Requesting data for tab:', tab.id);

            // Get analysis data from storage first
            const result = await chrome.storage.local.get([`lg:analysis:${tab.id}`]);
            const analysisData = result[`lg:analysis:${tab.id}`];

            if (analysisData) {
                console.log('[LegalGuard] Found stored analysis data:', analysisData);
                this.currentData = analysisData;
                this.renderAnalysis();
            } else {
                // Try to get data from content script by asking for highlighted terms
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, { 
                        type: 'GET_HIGHLIGHTED_TERMS' 
                    });

                    if (response && response.success) {
                        console.log('[LegalGuard] Got highlighted terms from content script:', response.data);
                        this.currentData = response.data;
                        this.renderAnalysis();
                    } else {
                        this.showEmptyState('No legal terms detected on this page');
                    }
                } catch (error) {
                    console.warn('[LegalGuard] Could not get highlighted terms:', error);
                    this.showEmptyState('Unable to analyze this page');
                }
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not get page data:', error);
            this.showEmptyState('Unable to analyze this page');
        }
    }

    renderAnalysis() {
        if (!this.currentData) {
            this.showEmptyState('No analysis data available');
            return;
        }

        console.log('[LegalGuard] Rendering analysis:', this.currentData);
        this.debugData(); // Add this line

        // Render page summary
        this.renderPageSummary();
        
        // Render categories
        this.renderCategories();
        
        // Update highlight controls
        this.updateHighlightControls();
    }

    renderPageSummary() {
        const summaryElement = document.getElementById('pageSummary');
        if (!summaryElement) return;

        const { pageSummary, categories, totalTerms, foundTerms, detectedAt, detectionDetails } = this.currentData;
        
        summaryElement.innerHTML = `
            <p><strong>Analysis Summary:</strong></p>
            <p>${pageSummary || 'Legal terms analysis completed.'}</p>
            <p style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                Found ${totalTerms || 0} legal terms across ${Object.keys(categories || {}).length} categories.
                ${detectedAt ? `Detected at ${new Date(detectedAt).toLocaleTimeString()}` : ''}
            </p>
            ${foundTerms && foundTerms.length > 0 ? `
                <div style="margin-top: 12px; padding: 8px; background: #f0f9ff; border-radius: 8px; font-size: 12px;">
                    <strong>Recent detections:</strong><br>
                    ${foundTerms.slice(-3).map(term => `• ${term.phrase} (${term.cat})`).join('<br>')}
                </div>
            ` : ''}
            ${detectionDetails ? `
                <div style="margin-top: 8px; padding: 8px; background: #f0fdf4; border-radius: 8px; font-size: 12px;">
                    <strong>Detection Details:</strong><br>
                    Total: ${detectionDetails.totalDetections} terms<br>
                    Categories: ${detectionDetails.categoriesFound.join(', ')}
                </div>
            ` : ''}
        `;
    }

    renderCategories() {
        const categoriesList = document.getElementById('categoriesList');
        if (!categoriesList) return;

        const { categories, detectionDetails } = this.currentData;
        
        if (!categories || Object.keys(categories).length === 0) {
            categoriesList.innerHTML = '<div class="empty-state">No legal terms detected on this page.</div>';
            return;
        }

        console.log('[LegalGuard] Rendering categories:', categories);

        const categoryIcons = {
            'Data & Privacy': '🔒',
            'Rights & Obligations': '⚖️',
            'Payment & Subscription': '💳',
            'Legal Risks & Disclaimer': '⚠️',
            'Intellectual Property': '📝',
            'User Conduct': '👤',
            'Miscellaneous': '📋'
        };

        const severityMap = {
            'Data & Privacy': 'high',
            'Rights & Obligations': 'high',
            'Payment & Subscription': 'medium',
            'Legal Risks & Disclaimer': 'medium',
            'Intellectual Property': 'medium',
            'User Conduct': 'low',
            'Miscellaneous': 'low'
        };

        categoriesList.innerHTML = Object.entries(categories).map(([category, terms]) => {
            const icon = categoryIcons[category] || '📋';
            const severity = severityMap[category] || 'low';
            const severityClass = `badge-${severity}`;
            const severityText = severity.charAt(0).toUpperCase() + severity.slice(1);

            // Show actual terms found in this category
            const uniqueTerms = [...new Set(terms)];
            const termsList = uniqueTerms.slice(0, 3).join(', ') + (uniqueTerms.length > 3 ? '...' : '');

            return `
                <div class="risk-item">
                    <span class="risk-icon">${icon}</span>
                    <div class="risk-content">
                        <div class="risk-header">
                            <span class="risk-name">${category}</span>
                            <span class="badge ${severityClass}">${severityText}</span>
                        </div>
                        <p class="risk-description">${terms.length} term${terms.length !== 1 ? 's' : ''} detected: ${termsList}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateHighlightControls() {
        const controls = document.getElementById('highlightControls');
        if (!controls) return;

        const { totalTerms } = this.currentData;
        this.totalMatches = totalTerms || 0;

        if (this.totalMatches > 0) {
            controls.style.display = 'flex';
            this.updateMatchCounter();
        } else {
            controls.style.display = 'none';
        }
    }

    updateMatchCounter() {
        const counter = document.getElementById('matchCounter');
        if (counter) {
            counter.textContent = `${this.currentMatchIndex + 1} of ${this.totalMatches}`;
        }
    }

    async navigateMatch(direction) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            this.currentMatchIndex = Math.max(0, Math.min(this.currentMatchIndex + direction, this.totalMatches - 1));
            
            // Send message to content script to scroll to match
            await chrome.tabs.sendMessage(tab.id, {
                type: 'SCROLL_TO_MATCH',
                index: this.currentMatchIndex
            });

            this.updateMatchCounter();
        } catch (error) {
            console.warn('[LegalGuard] Navigation failed:', error);
        }
    }

    async clearHighlights() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            await chrome.tabs.sendMessage(tab.id, {
                type: 'CLEAR_HIGHLIGHTS'
            });

            this.currentMatchIndex = 0;
            this.updateMatchCounter();
        } catch (error) {
            console.warn('[LegalGuard] Clear highlights failed:', error);
        }
    }

    async loadMuteState() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const host = new URL(tab.url).host;
            const result = await chrome.storage.local.get([`lg:mute:${host}`]);
            const isMuted = result[`lg:mute:${host}`] === '1';
            
            const muteToggle = document.getElementById('muteToggle');
            if (muteToggle) {
                muteToggle.checked = isMuted;
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not load mute state:', error);
        }
    }

    async toggleMute(isMuted) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const host = new URL(tab.url).host;
            const key = `lg:mute:${host}`;
            
            if (isMuted) {
                await chrome.storage.local.set({ [key]: '1' });
            } else {
                await chrome.storage.local.remove([key]);
            }

            console.log(`[LegalGuard] Mute ${isMuted ? 'enabled' : 'disabled'} for ${host}`);
        } catch (error) {
            console.warn('[LegalGuard] Could not toggle mute state:', error);
        }
    }

    showEmptyState(message) {
        const categoriesList = document.getElementById('categoriesList');
        if (categoriesList) {
            categoriesList.innerHTML = `<div class="empty-state">${message}</div>`;
        }
        
        const controls = document.getElementById('highlightControls');
        if (controls) {
            controls.style.display = 'none';
        }
    }

    // Add this method to debug the data
    debugData() {
        console.log('[LegalGuard] Current data:', this.currentData);
        console.log('[LegalGuard] Categories:', this.currentData?.categories);
        console.log('[LegalGuard] Total terms:', this.currentData?.totalTerms);
        console.log('[LegalGuard] Found terms:', this.currentData?.foundTerms);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new LegalGuardSidePanel());
} else {
    new LegalGuardSidePanel();
}
