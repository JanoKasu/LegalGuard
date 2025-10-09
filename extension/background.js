chrome.runtime.onInstalled.addListener(() =>
    chrome.contextMenus.create({
        id: "simplifyText",
        title: "Simplify selected text",
        contexts: ["selection"]
    })
);

function reconstructParagraphs(text) {
    // Step 1: Normalize spaces and line breaks
    let normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/\n/g, " ")       // flatten any line breaks
        .replace(/[ \t]+/g, " ")   // collapse extra spaces
        .trim();

    // Step 2: Split into “paragraphs” heuristically
    const sentences = normalized.match(/[^.!?]+[.!?]+/g) || [normalized];
    const paragraphs = [];
    let current = "";

    for (const sentence of sentences) {
        current += sentence + " ";
        // If current chunk has 3+ sentences or > 500 chars, commit as a paragraph
        if ((current.match(/[.!?]/g) || []).length >= 3 || current.length >= 500) {
            paragraphs.push(current.trim());
            current = "";
        }
    }

    // Add remaining text as last paragraph
    if (current.trim()) paragraphs.push(current.trim());

    return paragraphs;
}

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "simplifyText" && info.selectionText) {
        const reconstructed = reconstructParagraphs(info.selectionText);
        const resultsPageUrl = chrome.runtime.getURL('result.html');

        chrome.tabs.create({ url: resultsPageUrl }, (newTab) => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    chrome.tabs.sendMessage(newTab.id, {
                        action: 'setText',
                        originalText: reconstructed,
                        simplifiedText: 'Rewriting...'
                    });
                    rewriteText(reconstructed, newTab.id);
                }
            });
        });
    }
});


const rewriteText = async (originalText, tabId) => {
    try {
        if (!('Rewriter' in self)) throw new Error("Rewriter API is not available.");
        const availability = await Rewriter.availability();
        if (!['available', 'downloadable'].includes(availability)) throw new Error("Rewriter API not ready.");

        const rewriter = await Rewriter.create({
            tone: 'more-casual',
            length: 'shorter',
            prompt: "Write this in very simple language for a person with low literacy. Include only the rewrite in your response."
        });

        const rewrittenText = await rewriter.rewrite(originalText);
        rewriter.destroy();

        chrome.tabs.sendMessage(tabId, { action: 'updateText', simplifiedText: rewrittenText });
    } catch (e) {
        console.error('Rewriter API Error:', e);
        chrome.tabs.sendMessage(tabId, { action: 'updateText', simplifiedText: 'Error: Could not rewrite text.' });
    }
};
