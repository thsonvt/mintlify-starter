/**
 * Highlights Pages
 * Route-specific page logic for /kb/highlights and /kb/shared.
 */

(function() {
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://thought-leadership-api.thsonvt.workers.dev';

  let currentRoute = '';
  let highlightsPageCleanup = null;
  let sharedPageCleanup = null;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB').format(date);
  }

  function isHighlightsPage() {
    return window.location.pathname === '/kb/highlights';
  }

  function isSharedPage() {
    return window.location.pathname === '/kb/shared';
  }

  async function waitForGlobal(key, retries = 50, intervalMs = 100) {
    let count = 0;
    while (!window[key] && count < retries) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      count += 1;
    }
    return window[key];
  }

  async function initHighlightsPage() {
    const app = document.getElementById('highlights-app');
    if (!app || app.dataset.hlMounted === 'true') return;
    app.dataset.hlMounted = 'true';

    const isOffline = () => window.highlightsStorage && !window.highlightsStorage.isOnline();

    function renderSignIn() {
      app.innerHTML = `
        <div style="padding: 60px 20px; text-align: center;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" style="margin-bottom: 16px;">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 20px;">Sign in to view highlights</h2>
          <p style="margin: 0 0 20px 0; color: #6b7280;">Your highlights are synced across devices when signed in.</p>
          <button id="hl-signin-btn" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">
            Sign in
          </button>
        </div>
      `;

      document.getElementById('hl-signin-btn')?.addEventListener('click', () => {
        window.highlightsAuth?.openModal('signin');
      });
    }

    function showOfflineBanner() {
      const existing = document.querySelector('.hl-offline-banner');
      if (existing) return;

      const banner = document.createElement('div');
      banner.className = 'hl-offline-banner';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 1l22 22"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        </svg>
        You're offline. Showing cached highlights.
      `;
      banner.style.cssText = 'padding: 10px 16px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin-bottom: 16px; font-size: 13px; color: #92400e; display: flex; align-items: center; gap: 8px;';
      app.insertBefore(banner, app.firstChild);
    }

    function renderHighlights(highlights) {
      if (highlights.length === 0) {
        app.innerHTML = `
          <div style="padding: 60px 20px; text-align: center;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" style="margin-bottom: 16px;">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 20px;">No highlights yet</h2>
            <p style="margin: 0; color: #6b7280;">Start reading articles and highlight passages that resonate with you.</p>
            <a href="/kb/browse" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #10b981; color: white; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Browse articles
            </a>
          </div>
        `;
        return;
      }

      const byArticle = {};
      highlights.forEach((h) => {
        if (!byArticle[h.article_id]) {
          byArticle[h.article_id] = [];
        }
        byArticle[h.article_id].push(h);
      });

      const articleCount = Object.keys(byArticle).length;

      app.innerHTML = `
        <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <span style="font-size: 24px; font-weight: 600; color: #111827;">${highlights.length}</span>
            <span style="color: #6b7280; margin-left: 4px;">highlights across</span>
            <span style="font-weight: 600; color: #111827;">${articleCount}</span>
            <span style="color: #6b7280;">articles</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="hl-search" placeholder="Search highlights..." style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; width: 200px;">
            <select id="hl-filter" style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; background: white;">
              <option value="all">All highlights</option>
              <option value="with-notes">With notes</option>
            </select>
          </div>
        </div>
        <div id="hl-list"></div>
      `;

      const listEl = document.getElementById('hl-list');
      const searchEl = document.getElementById('hl-search');
      const filterEl = document.getElementById('hl-filter');

      function render(filtered) {
        listEl.innerHTML = filtered.map((h) => {
          const isPending = h._pending || (h.id && h.id.startsWith('temp_'));
          return `
            <div style="padding: 16px; border: 1px solid ${isPending ? '#fef3c7' : '#e5e7eb'}; border-radius: 8px; margin-bottom: 12px; background: ${isPending ? '#fffbeb' : 'white'};">
              ${isPending ? '<div style="font-size: 11px; color: #92400e; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Pending sync</div>' : ''}
              <div style="font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 8px;">
                <span style="color: #10b981;">"</span>${escapeHtml(h.selected_text)}<span style="color: #10b981;">"</span>
              </div>
              ${h.note ? `<div style="padding: 8px 12px; background: #f9fafb; border-radius: 6px; font-size: 13px; color: #6b7280; font-style: italic; margin-bottom: 8px;">${escapeHtml(h.note)}</div>` : ''}
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #9ca3af;">
                <a href="/kb/articles/${h.article_id}" style="color: #10b981; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  View article
                </a>
                <span>${formatDate(h.created_at)}</span>
              </div>
            </div>
          `;
        }).join('') || '<div style="padding: 40px; text-align: center; color: #6b7280;">No matching highlights</div>';
      }

      function applyFilters() {
        const search = searchEl.value.toLowerCase();
        const filter = filterEl.value;

        let filtered = highlights;
        if (filter === 'with-notes') {
          filtered = filtered.filter((h) => h.note);
        }

        if (search) {
          filtered = filtered.filter((h) =>
            h.selected_text.toLowerCase().includes(search) ||
            (h.note && h.note.toLowerCase().includes(search))
          );
        }

        render(filtered);
      }

      searchEl.oninput = applyFilters;
      filterEl.onchange = applyFilters;
      render(highlights);
    }

    async function loadHighlights() {
      app.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #6b7280;">Loading...</div>';

      if (!window.highlightsAuth?.isAuthenticated()) {
        renderSignIn();
        return;
      }

      try {
        const storage = await waitForGlobal('highlightsStorage');
        if (!storage) {
          throw new Error('Storage not available');
        }

        const highlights = await storage.getAllHighlights();
        if (isOffline()) {
          showOfflineBanner();
        }

        renderHighlights(highlights);
      } catch (err) {
        console.error('Load highlights error:', err);
        app.innerHTML = '<div style="padding: 40px; text-align: center; color: #dc2626;">Failed to load highlights: ' + (err.message || 'Unknown error') + '</div>';
      }
    }

    const auth = await waitForGlobal('highlightsAuth');
    if (!auth) {
      app.innerHTML = '<div style="padding: 40px; text-align: center; color: #dc2626;">Auth system failed to load. Please refresh the page.</div>';
      return;
    }

    const onAuthChange = (e) => {
      if (e.detail.user) {
        loadHighlights();
      } else {
        renderSignIn();
      }
    };
    const onSynced = () => loadHighlights();
    const onFullSynced = () => loadHighlights();
    const onOnline = () => {
      const banner = document.querySelector('.hl-offline-banner');
      if (banner) banner.remove();
      loadHighlights();
    };

    window.addEventListener('highlights-auth-change', onAuthChange);
    window.addEventListener('highlights-synced', onSynced);
    window.addEventListener('highlights-full-synced', onFullSynced);
    window.addEventListener('highlights-online', onOnline);

    highlightsPageCleanup = () => {
      window.removeEventListener('highlights-auth-change', onAuthChange);
      window.removeEventListener('highlights-synced', onSynced);
      window.removeEventListener('highlights-full-synced', onFullSynced);
      window.removeEventListener('highlights-online', onOnline);
      app.dataset.hlMounted = '';
    };

    if (auth.isAuthenticated()) {
      loadHighlights();
    } else {
      renderSignIn();
    }
  }

  function initSharedPage() {
    const app = document.getElementById('shared-highlight-app');
    if (!app || app.dataset.hlMounted === 'true') return;
    app.dataset.hlMounted = 'true';

    function renderError(message) {
      app.innerHTML = `
        <div style="padding: 60px 20px; text-align: center;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" style="margin-bottom: 16px;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 20px;">Highlight not found</h2>
          <p style="margin: 0 0 20px 0; color: #6b7280;">${escapeHtml(message)}</p>
          <a href="/kb/browse" style="display: inline-block; padding: 10px 20px; background: #10b981; color: white; border-radius: 8px; text-decoration: none; font-weight: 500;">
            Browse articles
          </a>
        </div>
      `;
    }

    function renderHighlight(highlight) {
      const date = formatDate(highlight.created_at);

      app.innerHTML = `
        <div style="max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05)); border-left: 4px solid #10b981; padding: 24px; border-radius: 0 12px 12px 0; margin-bottom: 20px;">
            <blockquote style="margin: 0; font-size: 18px; line-height: 1.7; color: #1f2937; font-style: italic;">
              "${escapeHtml(highlight.selected_text)}"
            </blockquote>
          </div>

          ${highlight.note ? `
            <div style="padding: 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 20px;">
              <div style="font-size: 12px; font-weight: 500; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Note</div>
              <p style="margin: 0; color: #374151; font-size: 15px;">${escapeHtml(highlight.note)}</p>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <span style="font-size: 13px; color: #9ca3af;">Highlighted on ${date}</span>
            <a href="/kb/articles/${highlight.article_id}" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: #10b981; color: white; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Read full article
            </a>
          </div>
        </div>

        <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;">Want to save your own highlights?</p>
          <button id="hl-shared-signup-btn" style="padding: 10px 20px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; color: #374151;">
            Create an account
          </button>
        </div>
      `;

      document.getElementById('hl-shared-signup-btn')?.addEventListener('click', () => {
        window.highlightsAuth?.openModal('signup');
      });
    }

    async function loadSharedHighlight() {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get('id');

      if (!shareId) {
        renderError('No highlight ID provided');
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/shared/${shareId}`);
        if (response.status === 404) {
          renderError('This highlight was not found or is no longer shared.');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load');
        }

        const data = await response.json();
        renderHighlight(data.highlight);
      } catch (err) {
        console.error('Load error:', err);
        renderError('Failed to load the shared highlight.');
      }
    }

    sharedPageCleanup = () => {
      app.dataset.hlMounted = '';
    };

    loadSharedHighlight();
  }

  function handleRouteChange() {
    const routeKey = `${window.location.pathname}${window.location.search}`;
    if (routeKey === currentRoute) return;

    const previousPath = currentRoute.split('?')[0];
    currentRoute = routeKey;

    if (previousPath === '/kb/highlights' && highlightsPageCleanup) {
      highlightsPageCleanup();
      highlightsPageCleanup = null;
    }
    if (previousPath === '/kb/shared' && sharedPageCleanup) {
      sharedPageCleanup();
      sharedPageCleanup = null;
    }

    setTimeout(() => {
      if (isHighlightsPage()) {
        initHighlightsPage();
      } else if (isSharedPage()) {
        initSharedPage();
      }
    }, 100);
  }

  function init() {
    handleRouteChange();

    const observer = new MutationObserver(() => {
      handleRouteChange();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('popstate', handleRouteChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
