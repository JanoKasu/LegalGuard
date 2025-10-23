// glossary_toast.js — scan page for legal keywords and show a toast


if (
  location.protocol === 'chrome-extension:' ||
  location.hostname === 'chrome.google.com' ||
  document.contentType === 'application/pdf'
) {
  // do nothing
} else (async function () {
 
  async function loadGlossary() {
    try {
      // 用你的最终文件名（确保和 manifest 的 web_accessible_resources 一致）
      const res = await fetch(chrome.runtime.getURL('glossary_tri.json'));
      return await res.json(); // 形如 { category: [ "indemnify", ... ] }
    } catch (e) {
      console.warn('[LegalGuard] failed to load glossary json', e);
      return null;
    }
  }

 
  const ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mkPattern = (arr) => new RegExp(`\\b(?:${arr.map(p => ESC(p)).join('|')})\\b`, 'i');

  const isVisible = (node) => {
    const el = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  };
  const shouldSkip = (el) => {
    const tag = (el.tagName || '').toLowerCase();
    return ['script','style','noscript','template','textarea','input','select'].includes(tag) || el.isContentEditable;
  };

 
  function ensureToastRoot() {
    let root = document.querySelector('.lg-toast-wrapper');
    if (!root) {
      root = document.createElement('div');
      root.className = 'lg-toast-wrapper';
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function showToast({ title, message }) {
    const root = ensureToastRoot();

    // 先清除旧 toast（同一时间只显示一个，避免吵）
    root.innerHTML = '';

    const el = document.createElement('div');
    el.className = 'lg-toast';
    el.innerHTML = `
      <div class="lg-toast-content">
        <div class="lg-toast-icon">⚖️</div>
        <div class="lg-toast-body">
          <div class="lg-toast-title">${title}</div>
          <div class="lg-toast-message">${message}</div>
          <div class="lg-toast-actions">
            <button class="lg-btn lg-btn-primary" id="lg-view">See context</button>
            <button class="lg-btn lg-btn-ghost" id="lg-mute">Mute site</button>
          </div>
          <button class="lg-toast-dismiss" id="lg-dismiss">Dismiss</button>
        </div>
        <button class="lg-toast-close" id="lg-close">✕</button>
      </div>
    `;
    root.appendChild(el);

    const close = () => root.innerHTML = '';
    el.querySelector('#lg-close').onclick = close;
    el.querySelector('#lg-dismiss').onclick = close;

    
    el.querySelector('#lg-mute').onclick = () => {
      try {
        localStorage.setItem('lg:mute:' + location.host, '1');
      } catch {}
      close();
    };

   
    el.querySelector('#lg-view').onclick = () => {
      if (showToast._lastTarget && showToast._lastTarget.scrollIntoView) {
        showToast._lastTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
       
        const mark = document.createElement('mark');
        mark.textContent = showToast._lastText || '';
        mark.style.background = '#fffbcc';
        mark.style.padding = '0 2px';

        const sel = window.getSelection();
        sel?.removeAllRanges?.();
      }
      close();
    };

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(close, 8000);
  }

  
  const glossary = await loadGlossary();
  if (!glossary) return;

  
  try {
    if (localStorage.getItem('lg:mute:' + location.host) === '1') return;
  } catch {}

  const matchers = Object.entries(glossary).map(([cat, list]) => ({
    cat, list, re: mkPattern(list.sort((a,b)=>b.length-a.length))
  }));

  function scanOnce() {
    let found = null; // {cat, phrase, context, node}
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const p = node.parentElement;
          if (!p || shouldSkip(p)) return NodeFilter.FILTER_REJECT;
          const t = node.nodeValue;
          if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      while (!found) {
        const node = walker.nextNode();
        if (!node) break;
        if (!isVisible(node)) continue;
        const text = node.nodeValue;

        for (const {cat, list, re} of matchers) {
          const m = text.match(re);
          if (m) {
            const phrase = list.find(p => new RegExp(`\\b${ESC(p)}\\b`, 'i').test(text)) || m[0];
            const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
            const start = Math.max(0, idx - 40);
            const end = Math.min(text.length, idx + phrase.length + 40);
            const snippet = text.slice(start, end).replace(/\s+/g, ' ');
            found = { cat, phrase, context: snippet, node };
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[LegalGuard] scan error', e);
    }

    if (found) {
      const title = `Keyword detected: ${found.phrase}`;
      const message = `[${found.cat.replace(/_/g, ' ')}] “… ${found.context} …”`;
      showToast._lastTarget = found.node?.parentElement || null;
      showToast._lastText = found.phrase;
      showToast({ title, message });
    }
  }

  const debounce = (fn, wait=400) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
  const debouncedScan = debounce(scanOnce, 400);

 
  debouncedScan();


  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) { debouncedScan(); break; }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  
  let last = location.href;
  setInterval(() => {
    if (last !== location.href) { last = location.href; debouncedScan(); }
  }, 800);
})();
