/**
 * Highlights Sidebar
 * Shows highlights for the current article with edit/delete capabilities
 */

(function() {
  // State
  let sidebar = null;
  let highlights = [];
  let isOpen = false;
  let activePopover = null;

  // Inject styles
  function injectStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
      .hl-sidebar-toggle {
        position: fixed;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        width: 44px;
        height: 44px;
        border: 1px solid #e5e7eb;
        border-radius: 50%;
        background: white;
        color: #6b7280;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        z-index: 999990;
        transition: all 0.2s;
      }

      .hl-sidebar-toggle:hover {
        background: #f9fafb;
        color: #374151;
        border-color: #d1d5db;
      }

      .hl-sidebar-toggle.has-highlights {
        background: #ecfdf5;
        border-color: #a7f3d0;
        color: #059669;
      }

      .hl-sidebar-toggle .count {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        background: #10b981;
        color: white;
        font-size: 11px;
        font-weight: 600;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .hl-sidebar {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 360px;
        max-width: 100vw;
        background: white;
        border-left: 1px solid #e5e7eb;
        box-shadow: -4px 0 15px rgba(0, 0, 0, 0.05);
        z-index: 999995;
        transform: translateX(100%);
        transition: transform 0.25s ease;
        display: flex;
        flex-direction: column;
      }

      .hl-sidebar.open {
        transform: translateX(0);
      }

      .hl-sidebar-header {
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .hl-sidebar-title {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .hl-sidebar-title .count {
        font-size: 13px;
        font-weight: 500;
        color: #6b7280;
        background: #f3f4f6;
        padding: 2px 8px;
        border-radius: 10px;
      }

      .hl-sidebar-close {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        color: #9ca3af;
        font-size: 20px;
        cursor: pointer;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .hl-sidebar-close:hover {
        background: #f3f4f6;
        color: #374151;
      }

      .hl-sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }

      .hl-sidebar-empty {
        padding: 40px 20px;
        text-align: center;
        color: #6b7280;
      }

      .hl-sidebar-empty svg {
        width: 48px;
        height: 48px;
        color: #d1d5db;
        margin-bottom: 12px;
      }

      .hl-sidebar-empty p {
        margin: 0;
        font-size: 14px;
      }

      .hl-sidebar-item {
        padding: 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }

      .hl-sidebar-item:hover {
        border-color: #10b981;
        background: #f0fdf4;
      }

      .hl-sidebar-item-text {
        font-size: 14px;
        color: #374151;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .hl-sidebar-item-text::before {
        content: '"';
        color: #10b981;
      }

      .hl-sidebar-item-text::after {
        content: '"';
        color: #10b981;
      }

      .hl-sidebar-item-note {
        margin-top: 8px;
        padding: 8px;
        background: #f9fafb;
        border-radius: 6px;
        font-size: 13px;
        color: #6b7280;
        font-style: italic;
      }

      .hl-sidebar-item-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #f3f4f6;
      }

      .hl-sidebar-item-btn {
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #6b7280;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .hl-sidebar-item-btn:hover {
        background: #f3f4f6;
        color: #374151;
      }

      .hl-sidebar-item-btn.danger:hover {
        background: #fef2f2;
        color: #dc2626;
      }

      .hl-sidebar-item-btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .hl-sidebar-item.pending {
        border-color: #fef3c7;
        background: #fffbeb;
      }

      .hl-sidebar-item-pending {
        font-size: 11px;
        color: #92400e;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .hl-sidebar-item-btn svg {
        width: 14px;
        height: 14px;
      }

      /* Highlight popover */
      .hl-popover {
        position: absolute;
        z-index: 999997;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        padding: 12px;
        min-width: 200px;
        max-width: 300px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(8px);
        transition: all 0.15s;
      }

      .hl-popover.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .hl-popover-note {
        font-size: 13px;
        color: #6b7280;
        font-style: italic;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid #f3f4f6;
      }

      .hl-popover-actions {
        display: flex;
        gap: 8px;
      }

      .hl-popover-btn {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        color: #374151;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .hl-popover-btn:hover {
        background: #f9fafb;
      }

      .hl-popover-btn.danger {
        border-color: #fecaca;
        color: #dc2626;
      }

      .hl-popover-btn.danger:hover {
        background: #fef2f2;
      }

      /* Offline toast */
      .hl-offline-toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #1f2937;
        color: #f9fafb;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 999999;
        opacity: 0;
        transition: all 0.3s ease;
      }

      .hl-offline-toast.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }

      .hl-offline-toast svg {
        color: #fbbf24;
      }

      /* Sync status indicator */
      .hl-sidebar-sync-status {
        padding: 8px 12px;
        background: #fffbeb;
        border-bottom: 1px solid #fef3c7;
        font-size: 12px;
        color: #92400e;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .hl-sidebar-sync-status.synced {
        background: #ecfdf5;
        border-color: #d1fae5;
        color: #065f46;
      }

      .hl-sidebar-sync-status svg {
        width: 14px;
        height: 14px;
      }

      @media (prefers-color-scheme: dark) {
        .hl-sidebar-toggle {
          background: #1f2937;
          border-color: #374151;
          color: #9ca3af;
        }
        .hl-sidebar-toggle:hover {
          background: #374151;
          color: #f9fafb;
        }
        .hl-sidebar-toggle.has-highlights {
          background: #064e3b;
          border-color: #10b981;
        }
        .hl-sidebar {
          background: #1f2937;
          border-left-color: #374151;
        }
        .hl-sidebar-header {
          border-bottom-color: #374151;
        }
        .hl-sidebar-title {
          color: #f9fafb;
        }
        .hl-sidebar-title .count {
          background: #374151;
          color: #9ca3af;
        }
        .hl-sidebar-item {
          border-color: #374151;
          background: #111827;
        }
        .hl-sidebar-item:hover {
          background: #064e3b;
        }
        .hl-sidebar-item-text {
          color: #f9fafb;
        }
        .hl-sidebar-item-note {
          background: #374151;
          color: #9ca3af;
        }
        .hl-popover {
          background: #1f2937;
          border-color: #374151;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // Get article ID
  function getArticleId() {
    const path = window.location.pathname;
    const match = path.match(/\/kb\/articles\/(.+)$/);
    return match ? match[1] : null;
  }

  // Check if on article page
  function isArticlePage() {
    return window.location.pathname.startsWith('/kb/articles/');
  }

  // Create sidebar toggle button
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'hl-sidebar-toggle';
    btn.title = 'View highlights';
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    btn.onclick = toggleSidebar;
    document.body.appendChild(btn);
    return btn;
  }

  // Create sidebar
  function createSidebar() {
    const el = document.createElement('div');
    el.className = 'hl-sidebar';
    el.innerHTML = `
      <div class="hl-sidebar-header">
        <div class="hl-sidebar-title">
          Highlights <span class="count">0</span>
        </div>
        <button class="hl-sidebar-close">&times;</button>
      </div>
      <div class="hl-sidebar-content">
        <div class="hl-sidebar-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No highlights yet.<br>Select text to highlight.</p>
        </div>
      </div>
    `;

    el.querySelector('.hl-sidebar-close').onclick = closeSidebar;

    document.body.appendChild(el);
    return el;
  }

  // Toggle sidebar
  function toggleSidebar() {
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // Open sidebar
  function openSidebar() {
    if (!sidebar) {
      sidebar = createSidebar();
    }
    sidebar.classList.add('open');
    isOpen = true;

    // Always render current highlights when opening
    renderSidebar();

    // Show sync status if offline
    if (window.highlightsStorage && !window.highlightsStorage.isOnline()) {
      updateSyncStatus(false);
    }
  }

  // Close sidebar
  function closeSidebar() {
    sidebar?.classList.remove('open');
    isOpen = false;
    hidePopover();
  }

  // Update toggle button state
  function updateToggleButton() {
    const btn = document.querySelector('.hl-sidebar-toggle');
    if (!btn) return;

    const count = highlights.length;
    if (count > 0) {
      btn.classList.add('has-highlights');
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="count">${count}</span>
      `;
    } else {
      btn.classList.remove('has-highlights');
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    }
  }

  // Render sidebar content
  function renderSidebar() {
    if (!sidebar) return;

    const content = sidebar.querySelector('.hl-sidebar-content');
    const countEl = sidebar.querySelector('.count');

    countEl.textContent = highlights.length;

    if (highlights.length === 0) {
      content.innerHTML = `
        <div class="hl-sidebar-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No highlights yet.<br>Select text to highlight.</p>
        </div>
      `;
      return;
    }

    content.innerHTML = highlights.map(h => {
      const isPending = h._pending || (h.id && h.id.startsWith('temp_'));
      return `
      <div class="hl-sidebar-item${isPending ? ' pending' : ''}" data-id="${h.id}">
        ${isPending ? `<div class="hl-sidebar-item-pending">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          Pending sync
        </div>` : ''}
        <div class="hl-sidebar-item-text">${escapeHtml(h.selected_text)}</div>
        ${h.note ? `<div class="hl-sidebar-item-note">${escapeHtml(h.note)}</div>` : ''}
        <div class="hl-sidebar-item-actions">
          <button class="hl-sidebar-item-btn" data-action="edit" title="Edit note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button class="hl-sidebar-item-btn${isPending ? ' disabled' : ''}" data-action="share" title="${isPending ? 'Sync required to share' : 'Share'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
          <button class="hl-sidebar-item-btn danger" data-action="delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete
          </button>
        </div>
      </div>
    `}).join('');

    // Add click handlers
    content.querySelectorAll('.hl-sidebar-item').forEach(item => {
      const id = item.dataset.id;

      // Click on item scrolls to highlight
      item.querySelector('.hl-sidebar-item-text').onclick = () => scrollToHighlight(id);

      // Action buttons
      item.querySelectorAll('.hl-sidebar-item-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          handleAction(action, id);
        };
      });
    });
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Scroll to highlight in article
  function scrollToHighlight(id) {
    const mark = document.querySelector(`mark[data-highlight-id="${id}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash effect
      mark.style.transition = 'background 0.3s';
      mark.style.background = 'rgba(16, 185, 129, 0.6)';
      setTimeout(() => {
        mark.style.background = '';
      }, 1000);
    }
  }

  // Handle sidebar actions
  async function handleAction(action, id) {
    const highlight = highlights.find(h => h.id === id);
    if (!highlight) return;

    switch (action) {
      case 'edit':
        editHighlightNote(highlight);
        break;
      case 'share':
        shareHighlight(highlight);
        break;
      case 'delete':
        deleteHighlight(highlight);
        break;
    }
  }

  // Edit highlight note
  async function editHighlightNote(highlight) {
    const note = prompt('Edit note:', highlight.note || '');
    if (note === null) return; // Cancelled

    try {
      // Update via storage layer (works offline)
      const updated = await window.highlightsStorage.updateHighlight(highlight.id, { note: note || null });

      // Update local state
      const idx = highlights.findIndex(h => h.id === highlight.id);
      if (idx !== -1) {
        highlights[idx] = updated;
      }
      renderSidebar();

      // Update mark class
      const marks = document.querySelectorAll(`mark[data-highlight-id="${highlight.id}"]`);
      marks.forEach(mark => {
        mark.classList.toggle('has-note', !!note);
        mark.classList.toggle('pending-sync', updated._pending);
      });

      // Show offline indicator if not online
      if (!window.highlightsStorage.isOnline()) {
        showOfflineToast('Note updated offline');
      }

    } catch (err) {
      console.error('Edit note error:', err);
      alert('Failed to update note');
    }
  }

  // Share highlight (requires online - generates server-side URL)
  async function shareHighlight(highlight) {
    // Check if online
    if (!window.highlightsStorage?.isOnline()) {
      alert('Sharing requires an internet connection. Please try again when online.');
      return;
    }

    // Check if highlight is synced (not pending)
    if (highlight._pending || highlight.id.startsWith('temp_')) {
      alert('Please wait for this highlight to sync before sharing.');
      return;
    }

    const token = await window.highlightsAuth?.getToken();
    if (!token) return;

    const API_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:8787'
      : 'https://thought-leadership-api.thsonvt.workers.dev';

    try {
      const response = await fetch(`${API_URL}/api/highlights/${highlight.id}/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to share');

      const { share_url } = await response.json();
      const fullUrl = window.location.origin + share_url;

      // Copy to clipboard
      await navigator.clipboard.writeText(fullUrl);
      alert('Share link copied to clipboard!');

    } catch (err) {
      console.error('Share error:', err);
      alert('Failed to create share link');
    }
  }

  // Delete highlight
  async function deleteHighlight(highlight) {
    if (!confirm('Delete this highlight?')) return;

    try {
      // Delete via storage layer (works offline)
      await window.highlightsStorage.deleteHighlight(highlight.id);

      // Remove from local state
      highlights = highlights.filter(h => h.id !== highlight.id);
      renderSidebar();
      updateToggleButton();

      // Remove ALL marks from DOM (multi-node highlights have multiple marks)
      const marks = document.querySelectorAll(`mark[data-highlight-id="${highlight.id}"]`);
      marks.forEach(mark => {
        const text = document.createTextNode(mark.textContent);
        mark.parentNode.replaceChild(text, mark);
      });

      // Show offline indicator if not online
      if (!window.highlightsStorage.isOnline()) {
        showOfflineToast('Deleted offline');
      }

    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete highlight');
    }
  }

  // Show popover on highlight click
  function showPopover(highlight, element) {
    hidePopover();

    const popover = document.createElement('div');
    popover.className = 'hl-popover';
    popover.innerHTML = `
      ${highlight.note ? `<div class="hl-popover-note">"${escapeHtml(highlight.note)}"</div>` : ''}
      <div class="hl-popover-actions">
        <button class="hl-popover-btn" data-action="edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>
        <button class="hl-popover-btn danger" data-action="delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
      </div>
    `;

    // Position popover
    const rect = element.getBoundingClientRect();
    popover.style.left = `${rect.left + window.scrollX}px`;
    popover.style.top = `${rect.bottom + window.scrollY + 8}px`;

    // Action handlers
    popover.querySelectorAll('.hl-popover-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        handleAction(btn.dataset.action, highlight.id);
        hidePopover();
      };
    });

    document.body.appendChild(popover);
    activePopover = popover;

    // Show with animation
    requestAnimationFrame(() => {
      popover.classList.add('visible');
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', hidePopoverOnOutsideClick);
    }, 0);
  }

  // Hide popover
  function hidePopover() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
      document.removeEventListener('click', hidePopoverOnOutsideClick);
    }
  }

  function hidePopoverOnOutsideClick(e) {
    if (activePopover && !activePopover.contains(e.target)) {
      hidePopover();
    }
  }

  // Load highlights for current article (from local storage)
  async function loadHighlights() {
    const articleId = getArticleId();
    if (!articleId) return;

    if (!window.highlightsAuth?.isAuthenticated()) {
      highlights = [];
      updateToggleButton();
      renderSidebar();
      return;
    }

    try {
      // Wait for storage to be ready
      if (!window.highlightsStorage) {
        let waitCount = 0;
        while (!window.highlightsStorage && waitCount < 50) {
          await new Promise(r => setTimeout(r, 100));
          waitCount++;
        }
      }

      // Load from local storage (works offline)
      highlights = await window.highlightsStorage.getHighlights(articleId);

      updateToggleButton();
      renderSidebar();

      // Render highlights on page
      highlights.forEach(h => {
        window.highlightsTooltip?.renderHighlight(h);
      });

    } catch (err) {
      console.error('Load highlights error:', err);
    }
  }

  // Update sync status in sidebar header
  function updateSyncStatus(online) {
    if (!sidebar) return;

    let statusEl = sidebar.querySelector('.hl-sidebar-sync-status');

    if (online) {
      // Remove offline status if exists
      if (statusEl) statusEl.remove();
    } else {
      // Show offline status
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'hl-sidebar-sync-status';
        const header = sidebar.querySelector('.hl-sidebar-header');
        header.insertAdjacentElement('afterend', statusEl);
      }
      statusEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 1l22 22"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        </svg>
        Offline - changes will sync when connected
      `;
    }
  }

  // Show offline toast message
  function showOfflineToast(message) {
    const toast = document.createElement('div');
    toast.className = 'hl-offline-toast';
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 1l22 22"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
      ${message}
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // Initialize
  // Track initialization state
  let globalListenersSetup = false;
  let currentPath = '';

  function init() {
    injectStyles();

    // Set up global event listeners once
    if (!globalListenersSetup) {
      // Listen for auth changes
      window.addEventListener('highlights-auth-change', (e) => {
        if (e.detail.user) {
          if (isArticlePage()) loadHighlights();
        } else {
          highlights = [];
          updateToggleButton();
          renderSidebar();
          // Remove all highlights from DOM
          document.querySelectorAll('.user-highlight').forEach(mark => {
            const text = document.createTextNode(mark.textContent);
            mark.parentNode.replaceChild(text, mark);
          });
        }
      });

      // Listen for new highlights
      window.addEventListener('highlight-created', (e) => {
        highlights.unshift(e.detail);
        updateToggleButton();
        renderSidebar();
      });

      // Listen for highlight clicks
      window.addEventListener('highlight-clicked', (e) => {
        showPopover(e.detail.highlight, e.detail.element);
      });

      // Listen for sync events to refresh highlights
      window.addEventListener('highlights-synced', () => {
        if (isArticlePage() && window.highlightsAuth?.isAuthenticated()) {
          loadHighlights();
        }
      });

      window.addEventListener('highlights-full-synced', () => {
        if (isArticlePage() && window.highlightsAuth?.isAuthenticated()) {
          loadHighlights();
        }
      });

      // Listen for ID mapping (temp ID -> server ID)
      window.addEventListener('highlight-id-mapped', (e) => {
        const { tempId, serverId } = e.detail;
        // Update marks in DOM
        const marks = document.querySelectorAll(`mark[data-highlight-id="${tempId}"]`);
        marks.forEach(mark => {
          mark.dataset.highlightId = serverId;
          mark.classList.remove('pending-sync');
        });
        // Update local state
        const idx = highlights.findIndex(h => h.id === tempId);
        if (idx !== -1) {
          highlights[idx].id = serverId;
          highlights[idx]._pending = false;
        }
      });

      // Listen for online/offline status
      window.addEventListener('highlights-online', () => {
        updateSyncStatus(true);
      });

      window.addEventListener('highlights-offline', () => {
        updateSyncStatus(false);
      });

      // Watch for client-side navigation (Mintlify SPA)
      const observer = new MutationObserver(() => {
        if (window.location.pathname !== currentPath) {
          currentPath = window.location.pathname;
          setTimeout(handleNavigation, 100);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Also listen for popstate
      window.addEventListener('popstate', () => {
        setTimeout(handleNavigation, 100);
      });

      globalListenersSetup = true;
    }

    currentPath = window.location.pathname;
    handleNavigation();
  }

  // Handle navigation to new page
  function handleNavigation() {
    const toggleBtn = document.querySelector('.hl-sidebar-toggle');

    if (isArticlePage()) {
      // Show/create toggle button on article pages
      if (!toggleBtn) {
        createToggleButton();
      } else {
        toggleBtn.style.display = 'flex';
      }

      // Load highlights when auth is ready
      if (window.highlightsAuth?.isAuthenticated()) {
        loadHighlights();
      }
    } else {
      // Hide toggle button on non-article pages
      if (toggleBtn) {
        toggleBtn.style.display = 'none';
      }
      closeSidebar();
      highlights = [];
    }
  }

  // Public API
  window.highlightsSidebar = {
    init,
    open: openSidebar,
    close: closeSidebar,
    refresh: loadHighlights,
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
