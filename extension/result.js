document.addEventListener("DOMContentLoaded", () => {
    const originalEl = document.getElementById("originalText"),
        simplifiedEl = document.getElementById("simplifiedText"),
        loadingEl = document.getElementById("loadingIndicator");

    const storedOriginal = sessionStorage.getItem('originalText'),
        storedSimplified = sessionStorage.getItem('simplifiedText');

    if (storedOriginal) {
        originalEl.innerText = storedOriginal;
        simplifiedEl.innerText = storedSimplified;
        if (storedSimplified !== "Rewriting...") {
            loadingEl.classList.add("is-hidden");
            simplifiedEl.classList.remove("is-hidden");
        }
        // Fire event so glossary tooltips can run on stored content
        const event = new Event('originalTextReady');
        originalEl.dispatchEvent(event);
    }

    const showSimplified = text => {
        simplifiedEl.innerText = text;
        loadingEl.classList.add("is-hidden");
        simplifiedEl.classList.remove("is-hidden");
        // Fire event so glossary tooltips can run on newly inserted text
        const event = new Event('originalTextReady');
        originalEl.dispatchEvent(event);
    };

    chrome.runtime.onMessage.addListener(msg => {
        if (msg.action === 'setText') {
            sessionStorage.setItem('originalText', msg.originalText);
            sessionStorage.setItem('simplifiedText', msg.simplifiedText);
            originalEl.innerText = msg.originalText;
            msg.simplifiedText !== "Rewriting..." ? showSimplified(msg.simplifiedText) : simplifiedEl.innerText = msg.simplifiedText;
            // Fire event after setting original text
            const event = new Event('originalTextReady');
            originalEl.dispatchEvent(event);
        } else if (msg.action === 'updateText') {
            sessionStorage.setItem('simplifiedText', msg.simplifiedText);
            showSimplified(msg.simplifiedText);
        }
    });
});