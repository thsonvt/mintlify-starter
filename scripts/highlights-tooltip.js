/**
 * Highlights Selection Tooltip
 * Shows tooltip on text selection with Highlight/Add Note options
 * Medium-style UX
 */

(function() {
  // Configuration
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://thought-leadership-api.thsonvt.workers.dev';

  const MAX_SELECTION_LENGTH = 500;

  // State
  let tooltip = null;
  let currentSelection = null;
  let isNoteMode = false;

  // Inject styles
  function injectStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
      .hl-tooltip {
        position: absolute;
        z-index: 999998;
        background: #1f2937;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        padding: 6px;
        display: flex;
        gap: 4px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(8px);
        transition: all 0.15s ease;
      }

      .hl-tooltip.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .hl-tooltip-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #f9fafb;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s;
      }

      .hl-tooltip-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .hl-tooltip-btn svg {
        width: 16px;
        height: 16px;
      }

      .hl-tooltip-divider {
        width: 1px;
        background: #374151;
        margin: 4px 0;
      }

      .hl-tooltip-note {
        display: none;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        min-width: 280px;
      }

      .hl-tooltip.note-mode .hl-tooltip-actions {
        display: none;
      }

      .hl-tooltip.note-mode .hl-tooltip-note {
        display: flex;
      }

      .hl-tooltip-note textarea {
        width: 100%;
        min-height: 80px;
        padding: 10px;
        border: 1px solid #374151;
        border-radius: 6px;
        background: #111827;
        color: #f9fafb;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        outline: none;
      }

      .hl-tooltip-note textarea:focus {
        border-color: #10b981;
      }

      .hl-tooltip-note-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .hl-tooltip-note-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }

      .hl-tooltip-note-btn.cancel {
        background: transparent;
        color: #9ca3af;
      }

      .hl-tooltip-note-btn.cancel:hover {
        color: #f9fafb;
      }

      .hl-tooltip-note-btn.save {
        background: #10b981;
        color: white;
      }

      .hl-tooltip-note-btn.save:hover {
        background: #059669;
      }

      .hl-tooltip-arrow {
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 12px;
        height: 12px;
        background: #1f2937;
        transform: translateX(-50%) rotate(45deg);
      }

      .hl-tooltip-error {
        color: #f87171;
        font-size: 12px;
        padding: 0 4px;
      }

      .hl-tooltip-signin {
        padding: 12px 16px;
        color: #9ca3af;
        font-size: 13px;
      }

      .hl-tooltip-signin a {
        color: #10b981;
        cursor: pointer;
        text-decoration: none;
      }

      .hl-tooltip-signin a:hover {
        text-decoration: underline;
      }

      /* Highlight mark styles */
      .user-highlight {
        background: linear-gradient(to bottom, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.3));
        border-bottom: 2px solid #10b981;
        cursor: pointer;
        transition: background 0.15s;
      }

      .user-highlight:hover {
        background: linear-gradient(to bottom, rgba(16, 185, 129, 0.5), rgba(16, 185, 129, 0.5));
      }

      .user-highlight.has-note {
        border-bottom-style: dashed;
      }
    `;
    document.head.appendChild(styles);
  }

  // Create tooltip element
  function createTooltip() {
    const el = document.createElement('div');
    el.className = 'hl-tooltip';
    el.innerHTML = `
      <div class="hl-tooltip-actions">
        <button class="hl-tooltip-btn" data-action="highlight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
          Highlight
        </button>
        <div class="hl-tooltip-divider"></div>
        <button class="hl-tooltip-btn" data-action="note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Add Note
        </button>
      </div>
      <div class="hl-tooltip-note">
        <textarea placeholder="Add your note..."></textarea>
        <div class="hl-tooltip-note-actions">
          <button class="hl-tooltip-note-btn cancel">Cancel</button>
          <button class="hl-tooltip-note-btn save">Save with Note</button>
        </div>
      </div>
      <div class="hl-tooltip-error"></div>
      <div class="hl-tooltip-arrow"></div>
    `;

    // Event handlers
    el.querySelector('[data-action="highlight"]').onclick = () => saveHighlight();
    el.querySelector('[data-action="note"]').onclick = () => enterNoteMode();
    el.querySelector('.cancel').onclick = () => exitNoteMode();
    el.querySelector('.save').onclick = () => saveHighlight(el.querySelector('textarea').value);

    // Prevent clicks from closing
    el.onclick = (e) => e.stopPropagation();

    document.body.appendChild(el);
    return el;
  }

  // Get article ID from current page
  function getArticleId() {
    const path = window.location.pathname;
    // Match /kb/articles/slug-id pattern
    const match = path.match(/\/kb\/articles\/(.+)$/);
    if (match) {
      return match[1]; // Return the full slug-id
    }
    return null;
  }

  // Check if we're on an article page
  function isArticlePage() {
    return window.location.pathname.startsWith('/kb/articles/');
  }

  // Get XPath for an element
  function getXPath(element) {
    if (!element) return '';
    if (element.id) return `//*[@id="${element.id}"]`;
    if (element === document.body) return '/html/body';

    let ix = 0;
    const siblings = element.parentNode?.childNodes || [];
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        const tagName = element.tagName.toLowerCase();
        const parentPath = getXPath(element.parentNode);
        return `${parentPath}/${tagName}[${ix + 1}]`;
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        ix++;
      }
    }
    return '';
  }

  // Get selection info (XPath, offsets, text)
  function getSelectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    if (!text || text.length > MAX_SELECTION_LENGTH) {
      return null;
    }

    // Find the container element
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentElement;
    }

    // Check if selection is in an excluded area (nav, sidebar, toc, etc.)
    const isExcludedArea = container.closest('nav') ||
                           container.closest('header') ||
                           container.closest('footer') ||
                           container.closest('[class*="sidebar"]') ||
                           container.closest('[class*="toc"]') ||
                           container.closest('[class*="navigation"]');

    if (isExcludedArea) {
      return null;
    }

    // Get XPath to the start container's element
    let startElement = range.startContainer;
    if (startElement.nodeType === Node.TEXT_NODE) {
      startElement = startElement.parentElement;
    }

    const xpath = getXPath(startElement);

    // Calculate offset within the element
    const startOffset = range.startOffset;
    const endOffset = startOffset + text.length;

    return {
      xpath,
      startOffset,
      endOffset,
      text,
      range,
    };
  }

  // Position tooltip near selection
  function positionTooltip(range) {
    if (!tooltip) return;

    const rect = range.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Position above the selection, centered
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 10 + window.scrollY;

    // Keep within viewport horizontally
    const padding = 10;
    if (left < padding) left = padding;
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }

    // If not enough space above, show below
    if (top < window.scrollY + padding) {
      top = rect.bottom + 10 + window.scrollY;
      tooltip.querySelector('.hl-tooltip-arrow').style.cssText =
        'top: -6px; bottom: auto; transform: translateX(-50%) rotate(45deg);';
    } else {
      tooltip.querySelector('.hl-tooltip-arrow').style.cssText = '';
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  // Show tooltip
  function showTooltip() {
    if (!tooltip) {
      tooltip = createTooltip();
    }

    const selectionInfo = getSelectionInfo();

    if (!selectionInfo) {
      hideTooltip();
      return;
    }

    currentSelection = selectionInfo;

    // Check auth
    const isAuthed = window.highlightsAuth?.isAuthenticated();

    if (!isAuthed) {
      tooltip.innerHTML = `
        <div class="hl-tooltip-signin">
          <a onclick="window.highlightsAuth?.openModal('signin')">Sign in</a> to save highlights
        </div>
        <div class="hl-tooltip-arrow"></div>
      `;
    } else {
      // Ensure tooltip has the correct content (may have been showing sign-in message)
      if (!tooltip.querySelector('[data-action="highlight"]')) {
        // Recreate the tooltip content
        tooltip.remove();
        tooltip = createTooltip();
      }

      // Reset to default state
      tooltip.classList.remove('note-mode');
      const textarea = tooltip.querySelector('textarea');
      if (textarea) textarea.value = '';
      const errorEl = tooltip.querySelector('.hl-tooltip-error');
      if (errorEl) errorEl.textContent = '';
    }

    positionTooltip(selectionInfo.range);
    tooltip.classList.add('visible');
  }

  // Hide tooltip
  function hideTooltip() {
    if (tooltip) {
      tooltip.classList.remove('visible');
      tooltip.classList.remove('note-mode');
      isNoteMode = false;
    }
    currentSelection = null;
  }

  // Enter note mode
  function enterNoteMode() {
    if (!tooltip) return;
    tooltip.classList.add('note-mode');
    isNoteMode = true;

    // Reposition (note mode is larger)
    setTimeout(() => {
      if (currentSelection) {
        positionTooltip(currentSelection.range);
      }
      tooltip.querySelector('textarea')?.focus();
    }, 50);
  }

  // Exit note mode
  function exitNoteMode() {
    if (!tooltip) return;
    tooltip.classList.remove('note-mode');
    isNoteMode = false;
    tooltip.querySelector('textarea').value = '';
  }

  // Show error in tooltip
  function showError(message) {
    const errorEl = tooltip?.querySelector('.hl-tooltip-error');
    if (errorEl) {
      errorEl.textContent = message;
      setTimeout(() => { errorEl.textContent = ''; }, 3000);
    }
  }

  // Save highlight to API
  async function saveHighlight(note = null) {
    if (!currentSelection) return;

    const articleId = getArticleId();
    if (!articleId) {
      showError('Could not determine article ID');
      return;
    }

    const token = await window.highlightsAuth?.getToken();
    if (!token) {
      showError('Please sign in first');
      return;
    }

    const payload = {
      article_id: articleId,
      xpath: currentSelection.xpath,
      start_offset: currentSelection.startOffset,
      end_offset: currentSelection.endOffset,
      selected_text: currentSelection.text,
      note: note || undefined,
    };

    try {
      const response = await fetch(`${API_URL}/api/highlights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save highlight');
      }

      const data = await response.json();
      const { highlight } = data;

      // Render the highlight immediately
      renderHighlight(highlight);

      // Dispatch event for sidebar
      window.dispatchEvent(new CustomEvent('highlight-created', { detail: highlight }));

      hideTooltip();
      window.getSelection()?.removeAllRanges();

    } catch (err) {
      console.error('Save highlight error:', err);
      showError(err.message || 'Failed to save');
    }
  }

  // Render a single highlight on the page
  function renderHighlight(highlight) {
    try {
      // Find element by XPath
      const result = document.evaluate(
        highlight.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const element = result.singleNodeValue;
      if (!element) return;

      // Collect all text nodes that need highlighting
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let currentOffset = 0;
      let node;
      const nodesToHighlight = [];

      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent.length;
        const nodeStart = currentOffset;
        const nodeEnd = currentOffset + nodeLength;

        // Check if this node overlaps with the highlight range
        if (nodeEnd > highlight.start_offset && nodeStart < highlight.end_offset) {
          // Calculate offsets within this node
          const startInNode = Math.max(0, highlight.start_offset - nodeStart);
          const endInNode = Math.min(nodeLength, highlight.end_offset - nodeStart);

          nodesToHighlight.push({ node, startInNode, endInNode });
        }

        // Stop if we've passed the highlight end
        if (nodeStart >= highlight.end_offset) break;

        currentOffset = nodeEnd;
      }

      // Wrap each text node segment (process in reverse to avoid offset issues)
      let firstMark = null;
      for (let i = nodesToHighlight.length - 1; i >= 0; i--) {
        const { node, startInNode, endInNode } = nodesToHighlight[i];

        try {
          const range = document.createRange();
          range.setStart(node, startInNode);
          range.setEnd(node, endInNode);

          // Create mark element
          const mark = document.createElement('mark');
          mark.className = 'user-highlight' + (highlight.note ? ' has-note' : '');
          mark.dataset.highlightId = highlight.id;

          range.surroundContents(mark);
          firstMark = mark;

          // Add click handler for popover
          mark.onclick = (e) => {
            e.stopPropagation();
            showHighlightPopover(highlight, mark);
          };
        } catch (wrapErr) {
          // surroundContents can fail if range crosses element boundaries
        }
      }

      return firstMark;
    } catch (err) {
      console.error('Render highlight error:', err);
    }
  }

  // Show highlight popover (for viewing/editing/deleting)
  function showHighlightPopover(highlight, element) {
    // Dispatch event for sidebar to handle
    window.dispatchEvent(new CustomEvent('highlight-clicked', {
      detail: { highlight, element }
    }));
  }

  // Handle mouseup to show tooltip
  function handleMouseUp(e) {
    // Ignore if clicking inside tooltip
    if (tooltip?.contains(e.target)) return;

    // Small delay to let selection finalize
    setTimeout(() => {
      const selection = window.getSelection();
      const hasSelection = selection && !selection.isCollapsed && selection.toString().trim();

      if (hasSelection) {
        showTooltip();
      } else {
        hideTooltip();
      }
    }, 10);
  }

  // Handle clicks outside to hide tooltip
  function handleClick(e) {
    if (tooltip && !tooltip.contains(e.target)) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideTooltip();
      }
    }
  }

  // Track if we've set up global listeners
  let globalListenersSetup = false;
  let currentPath = '';

  // Initialize or re-initialize on navigation
  function init() {
    // Always inject styles (idempotent)
    injectStyles();

    // Set up global listeners once
    if (!globalListenersSetup) {
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('click', handleClick);

      // Handle scroll
      let scrollTimeout;
      window.addEventListener('scroll', () => {
        if (tooltip?.classList.contains('visible') && !isNoteMode) {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(hideTooltip, 100);
        }
      }, { passive: true });

      // Keyboard shortcut: Escape to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && tooltip?.classList.contains('visible')) {
          hideTooltip();
        }
      });

      // Watch for client-side navigation (Mintlify SPA)
      const observer = new MutationObserver(() => {
        if (window.location.pathname !== currentPath) {
          currentPath = window.location.pathname;
          // Small delay to let page render
          setTimeout(checkAndLoadHighlights, 100);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Also listen for popstate (browser back/forward)
      window.addEventListener('popstate', () => {
        setTimeout(checkAndLoadHighlights, 100);
      });

      globalListenersSetup = true;
    }

    currentPath = window.location.pathname;
    checkAndLoadHighlights();
  }

  // Check if we're on article page and load highlights
  function checkAndLoadHighlights() {
    if (!isArticlePage()) return;
    // Tooltip functionality is already active via global listeners
  }

  // Public API
  window.highlightsTooltip = {
    init,
    renderHighlight,
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
