/**
 * Global Date Formatter
 * Normalizes visible YYYY-MM-DD dates to DD/MM/YYYY across docs pages.
 */

(function() {
  const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  let scanScheduled = false;

  function isIgnoredNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script, style, pre, code, textarea, input, select, option, kbd, samp, .no-date-format');
  }

  function formatIsoDate(_, year, month, day) {
    return `${day}/${month}/${year}`;
  }

  function normalizeTextNode(node) {
    if (!node || !node.nodeValue || isIgnoredNode(node)) return;

    const original = node.nodeValue;
    ISO_DATE_RE.lastIndex = 0;
    if (!ISO_DATE_RE.test(original)) return;

    ISO_DATE_RE.lastIndex = 0;
    const normalized = original.replace(ISO_DATE_RE, formatIsoDate);
    if (normalized !== original) {
      node.nodeValue = normalized;
    }
  }

  function normalizeTree(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      normalizeTextNode(root);
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      normalizeTextNode(node);
    }
  }

  function scheduleFullScan() {
    if (scanScheduled) return;
    scanScheduled = true;

    setTimeout(() => {
      scanScheduled = false;
      normalizeTree(document.body);
    }, 80);
  }

  function init() {
    normalizeTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          normalizeTextNode(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          normalizeTree(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener('popstate', scheduleFullScan);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
