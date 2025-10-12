document.addEventListener("DOMContentLoaded", () => {
    const originalEl = document.getElementById("originalText"),
        simplifiedEl = document.getElementById("simplifiedText"),
        loadingEl = document.getElementById("loadingIndicator");

    const storedOriginal = sessionStorage.getItem('originalText'),
        storedSimplified = sessionStorage.getItem('simplifiedText');

    // Utility: render paragraphs into Bulma-style "bubbles"
    const renderParagraphs = (container, paragraphs, prefixLabel) => {
        container.innerHTML = "";
        paragraphs.forEach((p, i) => {
            const bubble = document.createElement("div");
            bubble.className = "box has-background-light mb-3";
            bubble.style.border = "1px solid #dbdbdb";
            bubble.style.borderRadius = "6px";

            const label = document.createElement("p");
            label.className = "has-text-weight-semibold mb-1";
            label.textContent = `${prefixLabel} ${i + 1}`;

            const text = document.createElement("p");
            text.className = "mb-0";
            text.textContent = p.trim();

            bubble.appendChild(label);
            bubble.appendChild(text);
            container.appendChild(bubble);
        });
    };

    if (storedOriginal) {
        const originalArray = JSON.parse(storedOriginal);
        const simplifiedArray = JSON.parse(storedSimplified);

        renderParagraphs(originalEl, originalArray, "Original Paragraph");
        renderParagraphs(simplifiedEl, simplifiedArray, "Simplified Paragraph");

        if (storedSimplified !== "Rewriting...") {
            loadingEl.classList.add("is-hidden");
            simplifiedEl.classList.remove("is-hidden");
        }

        const event = new Event('originalTextReady');
        originalEl.dispatchEvent(event);
    }

    const showSimplified = paragraphs => {
        renderParagraphs(simplifiedEl, paragraphs, "Simplified Paragraph");
        loadingEl.classList.add("is-hidden");
        simplifiedEl.classList.remove("is-hidden");
        const event = new Event('originalTextReady');
        originalEl.dispatchEvent(event);
    };

    chrome.runtime.onMessage.addListener(msg => {
        if (msg.action === 'setText') {
            // Expect arrays of paragraphs
            sessionStorage.setItem('originalText', JSON.stringify(msg.originalText));
            sessionStorage.setItem('simplifiedText', JSON.stringify(msg.simplifiedText));

            renderParagraphs(originalEl, msg.originalText, "Original Paragraph");
            if (msg.simplifiedText !== "Rewriting...") {
                showSimplified(msg.simplifiedText);
            } else {
                simplifiedEl.innerText = msg.simplifiedText;
            }

            const event = new Event('originalTextReady');
            originalEl.dispatchEvent(event);

        } else if (msg.action === 'updateText') {
            sessionStorage.setItem('simplifiedText', JSON.stringify(msg.simplifiedText));
            showSimplified(msg.simplifiedText);
        }
    });
});
