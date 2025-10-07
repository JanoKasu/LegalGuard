// glossary_tooltip.js

// Load glossary JSON
async function loadGlossary() {
    const res = await fetch('glossary.json');
    const glossary = await res.json();
    return glossary;
}

// Escape regex special characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight a single text node with Bulma tooltip and blue text
function highlightTextNode(node, glossary) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const parent = node.parentNode;
    const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);

    let text = node.textContent;
    let frag = document.createDocumentFragment();

    while (text.length > 0) {
        let matchIndex = -1;
        let matchedTerm = null;

        for (const term of terms) {
            const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
            const match = regex.exec(text);
            if (match && (matchIndex === -1 || match.index < matchIndex)) {
                matchIndex = match.index;
                matchedTerm = term;
            }
        }

        if (matchIndex === -1) {
            frag.appendChild(document.createTextNode(text));
            break;
        }

        if (matchIndex > 0) {
            frag.appendChild(document.createTextNode(text.slice(0, matchIndex)));
        }

        const span = document.createElement('span');
        span.className = 'has-tooltip-multiline has-text-info is-underlined';
        span.setAttribute('data-tooltip', glossary[matchedTerm]);
        span.textContent = text.substr(matchIndex, matchedTerm.length);

        frag.appendChild(span);

        text = text.slice(matchIndex + matchedTerm.length);
    }

    parent.replaceChild(frag, node);
}

// Traverse all text nodes in a container
function highlightTermsInContainer(container, glossary) {
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    const nodes = [];
    while (node = walker.nextNode()) nodes.push(node);

    nodes.forEach(node => highlightTextNode(node, glossary));
}

// Initialization
(async () => {
    const glossary = await loadGlossary();
    const container = document.getElementById('originalText');
    if (!container) return;

    // Listen for the custom event fired by result.js
    container.addEventListener('originalTextReady', () => {
        highlightTermsInContainer(container, glossary);
    }, { once: true });
})();