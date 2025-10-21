// background.js

// ---------------------- Initialization ----------------------
try {
    console.log('background.js: initializing service worker', {
        chromeDefined: typeof chrome !== 'undefined',
        runtime: typeof chrome !== 'undefined' ? !!chrome.runtime : false,
        action: typeof chrome !== 'undefined' ? !!chrome.action : false,
        contextMenus: typeof chrome !== 'undefined' ? !!chrome.contextMenus : false
    });

    if (chrome?.runtime?.onInstalled?.addListener) {
        chrome.runtime.onInstalled.addListener(() => {
            chrome.contextMenus.create({
                id: "simplifyText",
                title: "Simplify selected text",
                contexts: ["selection"]
            });
        });
    } else {
        console.error('background.js: chrome.runtime.onInstalled not available');
    }
} catch (err) {
    console.error('background.js: initialization failed', err);
}

// ---------------------- Utilities ----------------------

// Heuristic paragraph reconstruction
function reconstructParagraphs(text) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\n/g, " ").replace(/[ \t]+/g, " ").trim();
    const sentences = normalized.match(/[^.!?]+[.!?]+/g) || [normalized];

    const paragraphs = [];
    let current = "";
    for (const sentence of sentences) {
        current += sentence + " ";
        if ((current.match(/[.!?]/g) || []).length >= 3 || current.length >= 500) {
            paragraphs.push(current.trim());
            current = "";
        }
    }
    if (current.trim()) paragraphs.push(current.trim());
    return paragraphs;
}

// ---------------------- Extension Icon Click ----------------------
if (chrome?.action?.onClicked?.addListener) {
    chrome.action.onClicked.addListener(async (tab) => {
        try {
            let tabId = tab?.id;
            if (!tabId) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                tabId = tabs?.[0]?.id;
            }
            if (!tabId) return console.warn('background.js: no tab available for toast');

            // Inject toast.js
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ["scripts/toast.js"]
            });

            // Show toast
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    try {
                        if (typeof showToast === "function") {
                            showToast('legal', { example: 'data' });
                            return;
                        }
                        // Minimal fallback toast
                        let wrapper = document.getElementById('toast-wrapper');
                        if (!wrapper) {
                            wrapper = document.createElement('div');
                            wrapper.id = 'toast-wrapper';
                            Object.assign(wrapper.style, {
                                position: 'fixed',
                                bottom: '20px',
                                right: '20px',
                                zIndex: '2147483647',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                width: '300px'
                            });
                            document.body.appendChild(wrapper);
                        }
                        const toast = document.createElement('div');
                        toast.className = 'notification is-success';
                        toast.textContent = 'Test toast from extension icon!';
                        toast.style.opacity = '0';
                        toast.style.transform = 'translateY(20px)';
                        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        wrapper.appendChild(toast);
                        requestAnimationFrame(() => {
                            toast.style.opacity = '1';
                            toast.style.transform = 'translateY(0)';
                        });
                        setTimeout(() => {
                            toast.style.opacity = '0';
                            toast.style.transform = 'translateY(20px)';
                            toast.addEventListener('transitionend', () => toast.remove());
                        }, 4000);
                    } catch (e) {
                        console.error('background.js: toast fallback error', e);
                    }
                }
            });
        } catch (e) {
            console.error('background.js: action click handler error', e);
        }
    });
} else {
    console.warn('background.js: chrome.action.onClicked not available');
}

// ---------------------- Context Menu Click ----------------------
if (chrome?.contextMenus?.onClicked?.addListener) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId !== "simplifyText" || !info.selectionText) return;
        if (!tab?.id || tab.id === -1) return console.error("No valid tab found for side panel");

        const paragraphs = reconstructParagraphs(info.selectionText);

        chrome.sidePanel.setOptions({
            tabId: tab.id,
            path: "html/result.html",
            enabled: true
        });
        chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);

        chrome.runtime.onMessage.addListener(function listener(msg) {
            if (msg.action === "sidePanelReady") {
                chrome.runtime.onMessage.removeListener(listener);
                chrome.runtime.sendMessage({
                    action: "setText",
                    originalText: paragraphs,
                    simplifiedText: "Rewriting..."
                });
                rewriteParagraphs(paragraphs);
            }
        });
    });
} else {
    console.warn('background.js: chrome.contextMenus.onClicked not available');
}

// ---------------------- Rewriter ----------------------
async function rewriteParagraphs(paragraphs) {
    try {
        if (!('Rewriter' in self)) throw new Error("Rewriter API not available");
        const availability = await Rewriter.availability();
        if (!['available', 'downloadable'].includes(availability))
            throw new Error(`Rewriter API not ready: ${availability}`);

        const rewriter = await Rewriter.create({
            tone: 'more-casual',
            length: 'shorter',
            prompt: "Write this in very simple language for a person with low literacy. Include only the rewrite."
        });

        const simplified = [];
        for (const para of paragraphs) {
            const rewritten = await rewriter.rewrite(para);
            simplified.push(rewritten);
            chrome.runtime.sendMessage({ action: 'updateText', simplifiedText: [...simplified] });
        }

        rewriter.destroy();
    } catch (e) {
        console.error("Error during rewriting:", e);
        chrome.runtime.sendMessage({ action: 'updateText', simplifiedText: ['Error: Could not rewrite text.'] });
    }
}


// ---------------------- Side Panel Message Listener ----------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzePage') {
        analyzeDocument(request.content)
            .then(result => {
                sendResponse({
                    success: true,
                    shouldShowToast: true,
                    docType: result.docType,
                    analysisData: result
                })
            })
            .catch(error => {
                console.error('Analysis Fail:', error)
                sendResponse({ success: false, error: error.message })
            })
        return true
    }

    if (request.action === 'highlightRisks') {
        console.log('Highlight Risk:', request.data)
        sendResponse({ success: true })
        return true
    }

    // if (request.action === 'openFullAnalysis') { ... }

    // openSidePanel
    if (request.action === 'openSidePanel') {
        chrome.sidePanel.open({ windowId: sender.tab.windowId })
        sendResponse({ success: true })
        return true
    }
})

// ---------------------- Toast Listener ----------------------
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId })
})

// ---------------------- Document Analysis ----------------------
async function analyzeDocument(content) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const docType = detectDocumentType(content)
    return {
        docType: docType,
        summary: `This is a summary of a ${docType}document。The following key clauses were detected...`,
        risks: [
            { text: "Perpetual Confidentiality Obligation", severity: "high" },
            { text: "Unilateraal Indemnification Clause", severity: "medium" },
            { text: "Intellectual Property Assignment", severity: "high" }
        ],
        fullAnalysis: `View Full Analysis:\n\nDocType: ${docType}\n\n${content.substring(0, 800)}...`
    }
}