// sidepanel.js - LegalGuard Side Panel with AI Chat
class LegalGuardSidePanel {
    constructor() {
        this.currentData = null;
        this.currentMatchIndex = 0;
        this.totalMatches = 0;
        this.aiSession = null;
        this.aiAvailable = false;
        this.currentTabId = null;
        this.conversationHistory = [];
        this.isStreaming = false;
        
        // Translation state
        this.translatorAvailable = false;
        this.userLanguage = 'auto';
        this.autoTranslate = true;
        this.translationCache = new Map();
        this.detectedLanguage = 'en';
        this.translatorToEnglish = null;
        this.translatorFromEnglish = null;
        
        // Content formatting
        this.currentTone = 'normal'; // 'normal' or 'eli3'
        this.markdownRenderer = null;
        
        this.init();
    }

    async init() {
        console.log('[LegalGuard] Side panel DOM ready and initialized');
        
        // Get current tab ID
        await this.getCurrentTab();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize AI
        await this.initializeAI();
        
        // Initialize Translation
        await this.initializeTranslation();
        
        // Initialize markdown rendering
        await this.initializeMarkdownRenderer();
        
        // Request data from content script
        await this.requestPageData();
        
        // Load conversation history
        await this.loadConversationHistory();
        
        // Load language preferences
        await this.loadLanguagePreferences();
        
        // Load mute state
        await this.loadMuteState();
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTabId = tab?.id;
        } catch (error) {
            console.warn('[LegalGuard] Could not get current tab:', error);
        }
    }

    async initializeAI() {
        try {
            // Check if LanguageModel is available
            if (typeof LanguageModel === 'undefined') {
                this.updateAPIStatus('unavailable', 'AI not available in this browser');
                return;
            }

            // Check availability
            const availability = await LanguageModel.availability();
            console.log('[LegalGuard] AI availability:', availability);

            if (availability === 'unavailable') {
                this.updateAPIStatus('unavailable', 'AI not available on this device');
                return;
            }

            if (availability === 'downloadable' || availability === 'downloading') {
                this.updateAPIStatus('downloading', 'Downloading AI model...');
                
                // Create session to trigger download with progress monitoring
                try {
                    this.aiSession = await LanguageModel.create({
                        monitor(m) {
                            m.addEventListener('downloadprogress', (e) => {
                                console.log(`Downloaded ${e.loaded * 100}%`);
                            });
                        },
                    });
                    this.aiAvailable = true;
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                } catch (error) {
                    console.warn('[LegalGuard] Could not create AI session:', error);
                    this.updateAPIStatus('unavailable', 'Failed to initialize AI');
                    return;
                }
            } else if (availability === 'available') {
                try {
                    this.aiSession = await LanguageModel.create();
                    this.aiAvailable = true;
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                } catch (error) {
                    console.warn('[LegalGuard] Could not create AI session:', error);
                    this.updateAPIStatus('unavailable', 'Failed to initialize AI');
                    return;
                }
            }

            // Enable send button
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) {
                sendBtn.disabled = !this.aiAvailable;
            }

        } catch (error) {
            console.warn('[LegalGuard] AI initialization failed:', error);
            this.updateAPIStatus('unavailable', 'AI initialization failed');
        }
    }

    async initializeTranslation() {
        try {
            // Check if Translator API is available
            if (typeof Translator === 'undefined') {
                console.log('[LegalGuard] Translator API not available');
                this.updateTranslationStatus('Translator API not available');
                return;
            }

            // Check general availability with required arguments
            const availability = await Translator.availability({
                sourceLanguage: 'en',
                targetLanguage: 'es'
            });
            console.log('[LegalGuard] Translator availability:', availability);

            if (availability === 'unavailable') {
                this.updateTranslationStatus('Translation not available on this device');
                return;
            }

            this.translatorAvailable = true;
            this.updateTranslationStatus('Translation ready');

        } catch (error) {
            console.warn('[LegalGuard] Translation initialization failed:', error);
            this.updateTranslationStatus('Translation initialization failed');
        }
    }

    async initializeMarkdownRenderer() {
        try {
            // Check if marked is available
            if (typeof marked !== 'undefined') {
                // Configure marked with security options
                marked.setOptions({
                    breaks: true,
                    gfm: true,
                    sanitize: false, // We'll use DOMPurify instead
                    smartLists: true,
                    smartypants: true
                });
                this.markdownRenderer = marked;
                console.log('[LegalGuard] Markdown renderer initialized');
            } else {
                console.warn('[LegalGuard] Marked library not available');
            }
        } catch (error) {
            console.warn('[LegalGuard] Markdown renderer initialization failed:', error);
        }
    }

    getResponseSchema(tone = 'normal') {
        const baseSchema = {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "A clear, concise title for the response"
                },
                summary: {
                    type: "string",
                    description: "A brief 1-2 sentence summary"
                },
                sections: {
                    type: "array",
                    description: "Array of content sections",
                    items: {
                        type: "object",
                        properties: {
                            heading: {
                                type: "string",
                                description: "Section heading"
                            },
                            content: {
                                type: "string",
                                description: "Section content in markdown format"
                            },
                            points: {
                                type: "array",
                                description: "Key points as an array of strings",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: ["heading", "content"]
                    }
                },
                key_takeaways: {
                    type: "array",
                    description: "Important takeaways as bullet points",
                    items: {
                        type: "string"
                    }
                },
                tone: {
                    type: "string",
                    enum: ["normal", "eli3"],
                    description: "The tone used in the response"
                }
            },
            required: ["title", "summary", "sections", "tone"]
        };

        if (tone === 'eli3') {
            // Add emoji requirements for ELI3 mode
            baseSchema.properties.sections.items.properties.points.items.description = 
                "Key point with exactly one emoji at the start (e.g., '🎯 This is important')";
            baseSchema.properties.key_takeaways.items.description = 
                "Takeaway with exactly one emoji at the start (e.g., '💡 Remember this')";
        }

        return baseSchema;
    }

    async translateStructuredResponse(jsonData, sourceLanguage, targetLanguage) {
        try {
            const translatedData = { ...jsonData };
            
            // Translate title
            if (translatedData.title) {
                translatedData.title = await this.translateText(translatedData.title, sourceLanguage, targetLanguage);
            }
            
            // Translate summary
            if (translatedData.summary) {
                translatedData.summary = await this.translateText(translatedData.summary, sourceLanguage, targetLanguage);
            }
            
            // Translate sections
            if (translatedData.sections && Array.isArray(translatedData.sections)) {
                for (const section of translatedData.sections) {
                    if (section.heading) {
                        section.heading = await this.translateText(section.heading, sourceLanguage, targetLanguage);
                    }
                    if (section.content) {
                        section.content = await this.translateText(section.content, sourceLanguage, targetLanguage);
                    }
                    if (section.points && Array.isArray(section.points)) {
                        for (let i = 0; i < section.points.length; i++) {
                            section.points[i] = await this.translateText(section.points[i], sourceLanguage, targetLanguage);
                        }
                    }
                }
            }
            
            // Translate key takeaways
            if (translatedData.key_takeaways && Array.isArray(translatedData.key_takeaways)) {
                for (let i = 0; i < translatedData.key_takeaways.length; i++) {
                    translatedData.key_takeaways[i] = await this.translateText(translatedData.key_takeaways[i], sourceLanguage, targetLanguage);
                }
            }
            
            return translatedData;
        } catch (error) {
            console.warn('[LegalGuard] Failed to translate structured response:', error);
            return jsonData; // Return original if translation fails
        }
    }

    createStructuredPrompt(userMessage, tone = 'normal') {
        let systemPrompt = `You are a helpful legal assistant. Your role is to explain legal terms and clauses in clear, structured language.

CRITICAL REQUIREMENTS:
- Respond in MARKDOWN format (NOT JSON)
- Maximum 150 words total
- Use this exact structure:

# [Short Title]

**Summary:** [2 sentences maximum]

## [Bold Heading 1]
[1-2 short lines]

## [Bold Heading 2] 
[1-2 short lines]

## [Bold Heading 3]
[1-2 short lines]

**Key Points:**
- [Risk/Next-step bullet 1]
- [Risk/Next-step bullet 2] 
- [Risk/Next-step bullet 3]
- [Risk/Next-step bullet 4]

WORD COUNT: Count your words. If over 150 words, compress until ≤150 words.`;

        if (tone === 'eli3') {
            systemPrompt += `

ELI3 MODE REQUIREMENTS:
- Use simple, kid-friendly language
- Add exactly ONE emoji to each bullet point
- Use words a 3-year-old would understand
- Keep sentences short and clear
- Use fun analogies when possible
- Examples: "🎯 This means..." "💡 Remember..." "⚠️ Watch out for..."`;
        }

        systemPrompt += `

Current page context:`;
        
        // Add page context if available
        if (this.currentData) {
            if (this.currentData.pageSummary) {
                systemPrompt += `\nPage Summary: ${this.currentData.pageSummary}`;
            }
            if (this.currentData.categories) {
                const categories = Object.keys(this.currentData.categories).join(', ');
                systemPrompt += `\nLegal categories detected: ${categories}`;
            }
        }

        systemPrompt += `\n\nUser question: ${userMessage}`;
        
        return systemPrompt;
    }

    renderMarkdown(markdownText, isELI3 = false) {
        try {
            if (!this.markdownRenderer) {
                // Fallback: basic HTML escaping and simple formatting
                return this.basicMarkdownRender(markdownText);
            }

            // Render markdown to HTML
            let html = this.markdownRenderer.parse(markdownText);
            
            // Sanitize HTML locally (replacing DOMPurify)
            html = this.sanitizeHTML(html);
            
            return html;
        } catch (error) {
            console.warn('[LegalGuard] Markdown rendering failed:', error);
            return this.basicMarkdownRender(markdownText);
        }
    }

    sanitizeHTML(html) {
        // Simple HTML sanitization - remove potentially dangerous elements
        const allowedTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'];
        
        // Create a temporary div to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Remove any script tags or dangerous attributes
        const scripts = tempDiv.querySelectorAll('script');
        scripts.forEach(script => script.remove());
        
        // Remove any elements with dangerous attributes
        const elementsWithAttrs = tempDiv.querySelectorAll('*');
        elementsWithAttrs.forEach(element => {
            // Remove all attributes except for basic ones
            const attrs = Array.from(element.attributes);
            attrs.forEach(attr => {
                if (!['class', 'id'].includes(attr.name)) {
                    element.removeAttribute(attr.name);
                }
            });
        });
        
        return tempDiv.innerHTML;
    }

    countWords(text) {
        // Simple word count function
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    validateWordCount(text, maxWords = 150) {
        const wordCount = this.countWords(text);
        if (wordCount > maxWords) {
            console.warn(`[LegalGuard] Response exceeds ${maxWords} words (${wordCount} words). Consider compression.`);
            return false;
        }
        return true;
    }

    basicMarkdownRender(text) {
        // Basic markdown rendering fallback
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(.*)$/, '<p>$1</p>');
    }

    renderStructuredContent(jsonResponse, isELI3 = false) {
        try {
            const data = typeof jsonResponse === 'string' ? JSON.parse(jsonResponse) : jsonResponse;
            
            let html = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">`;
            
            // Title
            if (data.title) {
                html += `<h1>${data.title}</h1>`;
            }
            
            // Summary
            if (data.summary) {
                html += `<p><strong>Summary:</strong> ${data.summary}</p>`;
            }
            
            // Sections
            if (data.sections && Array.isArray(data.sections)) {
                data.sections.forEach(section => {
                    html += `<h2>${section.heading}</h2>`;
                    
                    if (section.content) {
                        html += this.renderMarkdown(section.content, isELI3);
                    }
                    
                    if (section.points && Array.isArray(section.points)) {
                        html += '<ul>';
                        section.points.forEach(point => {
                            html += `<li>${this.renderMarkdown(point, isELI3)}</li>`;
                        });
                        html += '</ul>';
                    }
                });
            }
            
            // Key takeaways
            if (data.key_takeaways && Array.isArray(data.key_takeaways)) {
                html += '<h3>Key Takeaways</h3><ul>';
                data.key_takeaways.forEach(takeaway => {
                    html += `<li>${this.renderMarkdown(takeaway, isELI3)}</li>`;
                });
                html += '</ul>';
            }
            
            html += '</div>';
            return html;
            
        } catch (error) {
            console.warn('[LegalGuard] Structured content rendering failed:', error);
            // Fallback to basic rendering
            return `<div class="structured-content">${this.renderMarkdown(jsonResponse, isELI3)}</div>`;
        }
    }

    async detectLanguage(text) {
        try {
            if (typeof LanguageDetector === 'undefined') {
                return 'en'; // Default to English if detection not available
            }

            const detector = await LanguageDetector.create();
            const result = await detector.detect(text);
            return result.language || 'en';
        } catch (error) {
            console.warn('[LegalGuard] Language detection failed:', error);
            return 'en';
        }
    }

    async createTranslator(sourceLanguage, targetLanguage) {
        try {
            const cacheKey = `${sourceLanguage}-${targetLanguage}`;
            
            // Check cache first
            if (this.translationCache.has(cacheKey)) {
                return this.translationCache.get(cacheKey);
            }

            // Check availability for this language pair
            const availability = await Translator.availability({
                sourceLanguage,
                targetLanguage
            });

            if (availability === 'unavailable') {
                throw new Error(`Translation not available for ${sourceLanguage} to ${targetLanguage}`);
            }

            // Create translator with progress monitoring
            const translator = await Translator.create({
                sourceLanguage,
                targetLanguage,
                monitor(m) {
                    m.addEventListener('downloadprogress', (e) => {
                        console.log(`Downloaded ${e.loaded * 100}% for ${sourceLanguage}-${targetLanguage}`);
                    });
                },
            });

            // Cache the translator
            this.translationCache.set(cacheKey, translator);
            return translator;

        } catch (error) {
            console.warn('[LegalGuard] Failed to create translator:', error);
            throw error;
        }
    }

    async translateText(text, sourceLanguage, targetLanguage) {
        try {
            if (sourceLanguage === targetLanguage) {
                return text; // No translation needed
            }

            const translator = await this.createTranslator(sourceLanguage, targetLanguage);
            return await translator.translate(text);

        } catch (error) {
            console.warn('[LegalGuard] Translation failed:', error);
            return text; // Return original text if translation fails
        }
    }

    updateTranslationStatus(message) {
        const statusElement = document.getElementById('translationStatus');
        if (!statusElement) return;

        statusElement.textContent = message;
        
        if (message.includes('not available') || message.includes('failed')) {
            statusElement.style.color = '#dc2626';
        } else if (message.includes('ready')) {
            statusElement.style.color = '#059669';
        } else {
            statusElement.style.color = '#64748b';
        }
    }

    updateAPIStatus(status, message) {
        const statusElement = document.getElementById('apiStatus');
        if (!statusElement) return;

        statusElement.style.display = 'block';
        statusElement.className = `api-status ${status}`;
        statusElement.textContent = message;

        // Hide status after a delay if available
        if (status === 'available') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 3000);
        }
    }

    setupEventListeners() {
        // Chat input
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            chatInput.addEventListener('input', () => {
                const hasText = chatInput.value.trim().length > 0;
                if (sendBtn) {
                    sendBtn.disabled = !hasText || !this.aiAvailable;
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // Quick action buttons
        document.getElementById('explain-btn')?.addEventListener('click', () => {
            this.sendQuickAction('explain');
        });

        document.getElementById('eli3-btn')?.addEventListener('click', () => {
            this.sendQuickAction('eli3');
        });

        document.getElementById('clear-btn')?.addEventListener('click', () => {
            this.clearConversation();
        });

        // Language controls
        document.getElementById('userLanguage')?.addEventListener('change', (e) => {
            this.userLanguage = e.target.value;
            this.saveLanguagePreferences();
            this.updateTranslationStatus();
        });

        document.getElementById('autoTranslate')?.addEventListener('change', (e) => {
            this.autoTranslate = e.target.checked;
            this.saveLanguagePreferences();
            this.updateTranslationStatus();
        });

        // Mute toggle
        document.getElementById('muteToggle')?.addEventListener('change', (e) => {
            this.toggleMute(e.target.checked);
        });
    }

    async sendMessage() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput || !this.aiAvailable || this.isStreaming) return;

        const originalMessage = chatInput.value.trim();
        if (!originalMessage) return;

        // Clear input
        chatInput.value = '';
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.disabled = true;

        // Detect language if auto-detect is enabled
        let sourceLanguage = this.userLanguage;
        if (sourceLanguage === 'auto') {
            sourceLanguage = await this.detectLanguage(originalMessage);
            this.detectedLanguage = sourceLanguage;
        }

        // Translate to English if needed and auto-translate is enabled
        let messageToSend = originalMessage;
        let translatedMessage = originalMessage;
        
        if (this.autoTranslate && this.translatorAvailable && sourceLanguage !== 'en') {
            try {
                messageToSend = await this.translateText(originalMessage, sourceLanguage, 'en');
                translatedMessage = messageToSend;
            } catch (error) {
                console.warn('[LegalGuard] Failed to translate user message:', error);
                // Continue with original message if translation fails
            }
        }

        // Add user message (show original if translated)
        const displayMessage = this.autoTranslate && sourceLanguage !== 'en' ? originalMessage : originalMessage;
        const messageElement = this.addMessage('user', displayMessage);
        
        // Add translation controls if message was translated
        if (this.autoTranslate && sourceLanguage !== 'en' && translatedMessage !== originalMessage) {
            this.addTranslationControls(messageElement, originalMessage, translatedMessage, 'user');
        }
        
        // Add to conversation history (store both original and translated)
        this.conversationHistory.push({ 
            role: 'user', 
            content: originalMessage,
            translated: translatedMessage,
            sourceLanguage: sourceLanguage
        });
        await this.saveConversationHistory();

        // Generate AI response using English message
        await this.generateAIResponse(messageToSend, sourceLanguage, this.currentTone);
    }

    async sendQuickAction(action) {
        if (!this.aiAvailable || this.isStreaming) return;

        const chatInput = document.getElementById('chat-input');
        const selectedText = chatInput.value.trim();
        
        // Set tone based on action
        this.currentTone = action === 'eli3' ? 'eli3' : 'normal';
        
        let prompt = '';
        switch (action) {
            case 'explain':
                prompt = selectedText ? 
                    `Please explain this legal clause in simple terms: "${selectedText}"` :
                    'Please explain the legal terms detected on this page in simple terms.';
                break;
            case 'eli3':
                prompt = selectedText ?
                    `Explain this legal clause like I'm 3 years old: "${selectedText}"` :
                    'Explain the legal terms on this page like I\'m 3 years old.';
                break;
        }

        if (prompt) {
            chatInput.value = '';
            
            // Detect language and translate if needed
            let sourceLanguage = this.userLanguage;
            if (sourceLanguage === 'auto') {
                sourceLanguage = await this.detectLanguage(prompt);
            }
            
            let messageToSend = prompt;
            let translatedPrompt = prompt;
            
            if (this.autoTranslate && this.translatorAvailable && sourceLanguage !== 'en') {
                try {
                    messageToSend = await this.translateText(prompt, sourceLanguage, 'en');
                    translatedPrompt = messageToSend;
                } catch (error) {
                    console.warn('[LegalGuard] Failed to translate quick action prompt:', error);
                }
            }
            
            const messageElement = this.addMessage('user', prompt);
            
            // Add translation controls if prompt was translated
            if (this.autoTranslate && sourceLanguage !== 'en' && translatedPrompt !== prompt) {
                this.addTranslationControls(messageElement, prompt, translatedPrompt, 'user');
            }
            
            this.conversationHistory.push({ 
                role: 'user', 
                content: prompt,
                translated: translatedPrompt,
                sourceLanguage: sourceLanguage
            });
            await this.saveConversationHistory();
            await this.generateAIResponse(messageToSend, sourceLanguage);
        }
    }

    async generateAIResponse(userMessage, sourceLanguage = 'en', tone = 'normal') {
        if (!this.aiSession || this.isStreaming) return;

        this.isStreaming = true;
        const assistantMessageElement = this.addMessage('assistant', '', true);

        try {
            // Create structured prompt with Markdown output
            const structuredPrompt = this.createStructuredPrompt(userMessage, tone);
            
            // Use streaming without JSON constraints (Markdown output)
            const stream = this.aiSession.promptStreaming(structuredPrompt, {
                outputLanguage: "en"
            });
            
            let fullResponse = '';
            for await (const chunk of stream) {
                fullResponse += chunk;
                // Show streaming indicator
                assistantMessageElement.innerHTML = '<div class="message-streaming">Generating response...</div>';
                this.scrollToBottom();
            }

            // Remove streaming class and render markdown content
            assistantMessageElement.classList.remove('message-streaming');
            
            // Validate word count
            const wordCount = this.countWords(fullResponse);
            console.log(`[LegalGuard] Response word count: ${wordCount}`);
            
            // Render the markdown response directly
            const isELI3 = tone === 'eli3';
            const renderedContent = this.renderMarkdown(fullResponse, isELI3);
            assistantMessageElement.innerHTML = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${renderedContent}</div>`;
            
            // Translate response back to user's language if needed
            let translatedResponse = fullResponse;
            if (this.autoTranslate && this.translatorAvailable && sourceLanguage !== 'en') {
                try {
                    // Translate the markdown text
                    translatedResponse = await this.translateText(fullResponse, 'en', sourceLanguage);
                    
                    // Re-render with translated content
                    const translatedRenderedContent = this.renderMarkdown(translatedResponse, isELI3);
                    assistantMessageElement.innerHTML = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${translatedRenderedContent}</div>`;
                    
                    // Add translation controls
                    this.addTranslationControls(assistantMessageElement, renderedContent, translatedRenderedContent, 'assistant');
                } catch (error) {
                    console.warn('[LegalGuard] Failed to translate markdown AI response:', error);
                    // Keep original English response if translation fails
                }
            }
            
            // Add to conversation history (store both original and translated)
            this.conversationHistory.push({ 
                role: 'assistant', 
                content: fullResponse,
                translated: translatedResponse,
                sourceLanguage: sourceLanguage,
                tone: tone,
                isStructured: true,
                isMarkdown: true
            });
            await this.saveConversationHistory();

        } catch (error) {
            console.error('[LegalGuard] AI response error:', error);
            assistantMessageElement.classList.remove('message-streaming');
            assistantMessageElement.innerHTML = '<div class="structured-content"><p>Sorry, I encountered an error. Please try again.</p></div>';
        } finally {
            this.isStreaming = false;
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    createContextPrompt(userMessage) {
        let contextPrompt = `You are a helpful legal assistant. Your role is to explain legal terms and clauses in simple, understandable language. `;
        
        // Add page context if available
        if (this.currentData) {
            contextPrompt += `\n\nCurrent page context:\n`;
            if (this.currentData.pageSummary) {
                contextPrompt += `Page Summary: ${this.currentData.pageSummary}\n`;
            }
            if (this.currentData.categories) {
                const categories = Object.keys(this.currentData.categories).join(', ');
                contextPrompt += `Legal categories detected: ${categories}\n`;
            }
        }

        contextPrompt += `\n\nUser question: ${userMessage}`;
        
        return contextPrompt;
    }

    addMessage(role, content, isStreaming = false) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return null;

        // Remove empty state if it exists
        const emptyState = messagesContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message message-${role}`;
        if (isStreaming) {
            messageElement.classList.add('message-streaming');
        }
        messageElement.textContent = content;

        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        return messageElement;
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    addTranslationControls(messageElement, originalText, translatedText, role) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'translation-controls';
        
        const originalBtn = document.createElement('button');
        originalBtn.className = 'translation-btn';
        originalBtn.textContent = 'Original';
        originalBtn.addEventListener('click', () => {
            messageElement.textContent = originalText;
            originalBtn.classList.add('active');
            translatedBtn.classList.remove('active');
        });
        
        const translatedBtn = document.createElement('button');
        translatedBtn.className = 'translation-btn active';
        translatedBtn.textContent = 'Translated';
        translatedBtn.addEventListener('click', () => {
            messageElement.textContent = translatedText;
            translatedBtn.classList.add('active');
            originalBtn.classList.remove('active');
        });
        
        controlsDiv.appendChild(originalBtn);
        controlsDiv.appendChild(translatedBtn);
        
        // Insert controls after the message
        messageElement.parentNode.insertBefore(controlsDiv, messageElement.nextSibling);
    }

    async loadLanguagePreferences() {
        try {
            const result = await chrome.storage.local.get(['lg:userLanguage', 'lg:autoTranslate']);
            this.userLanguage = result['lg:userLanguage'] || 'auto';
            this.autoTranslate = result['lg:autoTranslate'] !== false; // Default to true
            
            // Update UI
            const userLanguageSelect = document.getElementById('userLanguage');
            const autoTranslateCheckbox = document.getElementById('autoTranslate');
            
            if (userLanguageSelect) {
                userLanguageSelect.value = this.userLanguage;
            }
            if (autoTranslateCheckbox) {
                autoTranslateCheckbox.checked = this.autoTranslate;
            }
            
            // Only update translation status if the method exists
            if (typeof this.updateTranslationStatus === 'function') {
                this.updateTranslationStatus();
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not load language preferences:', error);
            // Set defaults if loading fails
            this.userLanguage = 'auto';
            this.autoTranslate = true;
        }
    }

    async saveLanguagePreferences() {
        try {
            await chrome.storage.local.set({
                'lg:userLanguage': this.userLanguage,
                'lg:autoTranslate': this.autoTranslate
            });
        } catch (error) {
            console.warn('[LegalGuard] Could not save language preferences:', error);
        }
    }

    async loadConversationHistory() {
        if (!this.currentTabId) return;

        try {
            const result = await chrome.storage.local.get([`lg:conversation:${this.currentTabId}`]);
            const history = result[`lg:conversation:${this.currentTabId}`] || [];
            
            this.conversationHistory = history;
            
            // Restore messages to UI
            const messagesContainer = document.getElementById('messages');
            if (messagesContainer && history.length > 0) {
                messagesContainer.innerHTML = '';
                
                history.forEach(msg => {
                    if (msg.isStructured) {
                        // Render structured content (Markdown or JSON)
                        const displayContent = (msg.translated && this.autoTranslate) ? msg.translated : msg.content;
                        const isELI3 = msg.tone === 'eli3';
                        
                        let renderedContent;
                        if (msg.isMarkdown) {
                            // Render as Markdown
                            renderedContent = this.renderMarkdown(displayContent, isELI3);
                            renderedContent = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${renderedContent}</div>`;
                        } else {
                            // Render as JSON (legacy)
                            renderedContent = this.renderStructuredContent(displayContent, isELI3);
                        }
                        
                        const messageElement = this.addMessage(msg.role, '');
                        messageElement.innerHTML = renderedContent;
                        
                        // Add translation controls if message has translation
                        if (msg.translated && msg.translated !== msg.content) {
                            let originalRendered;
                            if (msg.isMarkdown) {
                                originalRendered = this.renderMarkdown(msg.content, isELI3);
                                originalRendered = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${originalRendered}</div>`;
                            } else {
                                originalRendered = this.renderStructuredContent(msg.content, isELI3);
                            }
                            this.addTranslationControls(messageElement, originalRendered, renderedContent, msg.role);
                        }
                    } else {
                        // Show translated version if available and auto-translate is enabled
                        const displayContent = (msg.translated && this.autoTranslate) ? msg.translated : msg.content;
                        const messageElement = this.addMessage(msg.role, displayContent);
                        
                        // Add translation controls if message has translation
                        if (msg.translated && msg.translated !== msg.content) {
                            this.addTranslationControls(messageElement, msg.content, msg.translated, msg.role);
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not load conversation history:', error);
        }
    }

    async saveConversationHistory() {
        if (!this.currentTabId) return;

        try {
            await chrome.storage.local.set({
                [`lg:conversation:${this.currentTabId}`]: this.conversationHistory
            });
        } catch (error) {
            console.warn('[LegalGuard] Could not save conversation history:', error);
        }
    }

    async clearConversation() {
        this.conversationHistory = [];
        await this.saveConversationHistory();
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    Start by highlighting a clause or asking a question below.<br>
                    <small>All processing happens locally on your device.</small>
                </div>
            `;
        }
    }

    async requestPageData() {
        try {
            if (!this.currentTabId) {
                this.showEmptyState('No active tab found');
                return;
            }

            console.log('[LegalGuard] Requesting data for tab:', this.currentTabId);

            // Get analysis data from storage first
            const result = await chrome.storage.local.get([`lg:analysis:${this.currentTabId}`]);
            const analysisData = result[`lg:analysis:${this.currentTabId}`];

            if (analysisData) {
                console.log('[LegalGuard] Found stored analysis data:', analysisData);
                this.currentData = analysisData;
                this.renderAnalysis();
            } else {
                // Try to get data from content script
                try {
                    const response = await chrome.tabs.sendMessage(this.currentTabId, { 
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
                    // Don't show error state, just show empty state
                    this.showEmptyState('No legal terms detected on this page');
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
            if (!this.currentTabId) return;

            this.currentMatchIndex = Math.max(0, Math.min(this.currentMatchIndex + direction, this.totalMatches - 1));
            
            // Send message to content script to scroll to match
            await chrome.tabs.sendMessage(this.currentTabId, {
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
            if (!this.currentTabId) return;

            await chrome.tabs.sendMessage(this.currentTabId, {
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
            if (!this.currentTabId) return;

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
            if (!this.currentTabId) return;

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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new LegalGuardSidePanel());
} else {
    new LegalGuardSidePanel();
}