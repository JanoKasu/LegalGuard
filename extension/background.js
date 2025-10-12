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
chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "simplifyText" && info.selectionText) {
        const reconstructed = reconstructParagraphs(info.selectionText);
        const resultsPageUrl = chrome.runtime.getURL('result.html');

        chrome.tabs.create({ url: resultsPageUrl }, (newTab) => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);

                    // Send original paragraphs as array
                    chrome.tabs.sendMessage(newTab.id, {
                        action: 'setText',
                        originalText: reconstructed,
                        simplifiedText: 'Rewriting...'
                    });

                    // Rewrite each paragraph separately
                    rewriteParagraphs(reconstructed, newTab.id);
                }
            });
        });
    }
});

// Rewrite each paragraph individually and update UI incrementally
const rewriteParagraphs = async (paragraphs, tabId) => {
    try {
        if (!('Rewriter' in self)) throw new Error("Rewriter API is not available.");
        const availability = await Rewriter.availability();
        if (!['available', 'downloadable'].includes(availability)) throw new Error("Rewriter API not ready.");

        const rewriter = await Rewriter.create({
            tone: 'more-casual',
            length: 'shorter',
            prompt: "Write this in very simple language for a person with low literacy. Include only the rewrite in your response."
        });

        const simplifiedParagraphs = [];

        // Iterate over each paragraph and rewrite separately
        for (const paragraph of paragraphs) {
            const rewritten = await rewriter.rewrite(paragraph);
            simplifiedParagraphs.push(rewritten);

            // Send incremental update to result page
            chrome.tabs.sendMessage(tabId, {
                action: 'updateText',
                simplifiedText: [...simplifiedParagraphs] // send array of rewritten paragraphs
            });
        }

        rewriter.destroy();
    } catch (e) {
        console.error("Error during rewriting:", e);
        chrome.tabs.sendMessage(tabId, {
            action: 'updateText',
            simplifiedText: ['Error: Could not rewrite text.']
        });
    }
};
