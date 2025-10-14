chrome.runtime.onInstalled.addListener(() =>
    chrome.contextMenus.create({
        id: "simplifyText",
        title: "Simplify selected text",
        contexts: ["selection"]
    })
);

// Heuristic paragraph reconstruction
function reconstructParagraphs(text) {
    let normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/\n/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim();

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

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "simplifyText" || !info.selectionText) return;

    // Ensure we have a valid tab
    if (!tab || tab.id === undefined || tab.id === -1) {
        console.error("No valid tab found for side panel.");
        return;
    }

    const reconstructed = reconstructParagraphs(info.selectionText);

    // Must be called synchronously in response to user gesture
    chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "result.html",
        enabled: true
    });

    // Open the side panel (still inside the user gesture)
    chrome.sidePanel.open({ tabId: tab.id }).catch(err => {
        console.error("Failed to open side panel:", err);
    });

    // Handle messaging asynchronously afterward
    chrome.runtime.onMessage.addListener(function listener(message) {
        if (message.action === "sidePanelReady") {
            chrome.runtime.onMessage.removeListener(listener);

            chrome.runtime.sendMessage({
                action: "setText",
                originalText: reconstructed,
                simplifiedText: "Rewriting..."
            });

            rewriteParagraphs(reconstructed);
        }
    });
});

// Rewrite each paragraph individually and update UI incrementally
const rewriteParagraphs = async (paragraphs) => {
    try {
        if (!('Rewriter' in self)) throw new Error("Rewriter API is not available.");

        const availability = await Rewriter.availability();
        if (!['available', 'downloadable'].includes(availability)) {
            throw new Error(`Rewriter API not ready (status: ${availability})`);
        }

        const rewriter = await Rewriter.create({
            tone: 'more-casual',
            length: 'shorter',
            prompt: "Write this in very simple language for a person with low literacy. Include only the rewrite in your response."
        });

        const simplifiedParagraphs = [];

        // Rewrite each paragraph one by one
        for (const paragraph of paragraphs) {
            const rewritten = await rewriter.rewrite(paragraph);
            simplifiedParagraphs.push(rewritten);

            // Send incremental updates to the side panel
            chrome.runtime.sendMessage({
                action: 'updateText',
                simplifiedText: [...simplifiedParagraphs]
            });
        }

        rewriter.destroy();

    } catch (e) {
        console.error("Error during rewriting:", e);
        chrome.runtime.sendMessage({
            action: 'updateText',
            simplifiedText: ['Error: Could not rewrite text.']
        });
    }
};
