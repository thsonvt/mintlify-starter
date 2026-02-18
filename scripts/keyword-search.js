/**
 * Custom Search Modal for Mintlify
 * - Intercepts Cmd+K to bypass Mintlify's "Not available on local preview"
 * - Uses local API (localhost:8787) when on localhost, production API otherwise
 * - Falls back to offline Fuse.js search when API unavailable
 *
 * Include this script in docs.json customJs or via script tag
 */

(function() {
  // API Configuration - detect localhost vs production
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://thought-leadership-api.thsonvt.workers.dev';

  // State
  let isOpen = false;
  let searchResults = [];
  let searchIndex = null; // Loaded on demand for offline search
  let fuse = null; // Fuse.js instance
  let recentSearches = JSON.parse(localStorage.getItem('ai-conductor-recent-searches') || '[]');

  // Create and inject styles
  const styles = document.createElement('style');
  styles.textContent = `
    /* Hide Mintlify's native search when our search is open */
    body.ai-search-open [data-radix-portal],
    body.ai-search-open [cmdk-root],
    body.ai-search-open [data-cmdk-root] {
      display: none !important;
    }

    .kw-search-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .kw-search-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    .kw-search-modal {
      position: fixed;
      top: 12%;
      left: 50%;
      transform: translateX(-50%) translateY(-10px);
      width: 560px;
      max-width: calc(100vw - 40px);
      max-height: 65vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      opacity: 0;
      transition: all 0.2s ease-out;
      z-index: 1000000;
    }

    @media (prefers-color-scheme: dark) {
      .kw-search-modal {
        background: #1f2937;
        color: #f9fafb;
      }
      .kw-search-input {
        color: #f9fafb;
      }
      .kw-search-input-wrapper {
        border-bottom-color: #374151;
      }
      .kw-search-result:hover,
      .kw-search-result.active {
        background: #374151;
      }
      .kw-search-footer {
        background: #111827;
        border-top-color: #374151;
      }
    }

    .kw-search-overlay.open .kw-search-modal {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    .kw-search-input-wrapper {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      gap: 12px;
    }

    .kw-search-icon {
      width: 20px;
      height: 20px;
      color: #9ca3af;
      flex-shrink: 0;
    }

    .kw-search-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 16px;
      color: #111827;
      background: transparent;
    }

    .kw-search-input::placeholder {
      color: #9ca3af;
    }

    .kw-search-kbd {
      background: #f3f4f6;
      color: #6b7280;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-family: ui-monospace, monospace;
    }

    .kw-search-results {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .kw-search-empty {
      padding: 40px 20px;
      text-align: center;
      color: #6b7280;
    }

    .kw-search-empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      opacity: 0.5;
    }

    .kw-search-section {
      padding: 8px 12px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #9ca3af;
      letter-spacing: 0.5px;
    }

    .kw-search-result {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      transition: background 0.1s;
    }

    .kw-search-result:hover,
    .kw-search-result.active {
      background: #f3f4f6;
    }

    .kw-search-result-icon {
      width: 20px;
      height: 20px;
      color: #6b7280;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .kw-search-result-content {
      flex: 1;
      min-width: 0;
    }

    .kw-search-result-title {
      font-weight: 500;
      color: #111827;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kw-search-result-path {
      font-size: 12px;
      color: #6b7280;
    }

    .kw-search-result-snippet {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .kw-search-result-type {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: #e5e7eb;
      color: #6b7280;
      text-transform: uppercase;
      font-weight: 600;
    }

    .kw-search-result-type.framework {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .kw-search-result-type.knowledge-base {
      background: #dcfce7;
      color: #15803d;
    }

    .kw-search-result-type.offline {
      background: #fef3c7;
      color: #92400e;
    }

    .kw-search-result-meta {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 2px;
    }

    .kw-search-footer {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: #6b7280;
      background: #f9fafb;
    }

    .kw-search-footer-keys {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .kw-search-footer-key {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .kw-search-footer-key kbd {
      background: white;
      border: 1px solid #e5e7eb;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
    }

    .kw-search-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 40px;
      color: #6b7280;
    }

    .kw-search-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #e5e7eb;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: kw-spin 0.6s linear infinite;
    }

    @keyframes kw-spin {
      to { transform: rotate(360deg); }
    }

    .kw-search-highlight {
      background: #fef08a;
      color: #854d0e;
      padding: 0 2px;
      border-radius: 2px;
    }

    .kw-search-offline-badge {
      font-size: 10px;
      padding: 2px 6px;
      background: #fef3c7;
      color: #92400e;
      border-radius: 4px;
      margin-left: 8px;
    }
  `;
  document.head.appendChild(styles);

  // Create the search modal HTML
  const container = document.createElement('div');
  container.className = 'kw-search-overlay';
  container.id = 'kw-search-overlay';
  container.innerHTML = `
    <div class="kw-search-modal" id="kw-search-modal">
      <div class="kw-search-input-wrapper">
        <svg class="kw-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          class="kw-search-input"
          id="kw-search-input"
          placeholder="Search documentation and articles..."
          autocomplete="off"
        />
        <span class="kw-search-kbd">ESC</span>
      </div>

      <div class="kw-search-results" id="kw-search-results">
        <div class="kw-search-empty" id="kw-search-empty">
          <svg class="kw-search-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>Search for pages, topics, or keywords</p>
        </div>
      </div>

      <div class="kw-search-footer">
        <div class="kw-search-footer-keys">
          <span class="kw-search-footer-key"><kbd>↵</kbd> select</span>
          <span class="kw-search-footer-key"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span class="kw-search-footer-key"><kbd>ESC</kbd> close</span>
        </div>
        <span id="kw-search-status">AI Conductor</span>
      </div>
    </div>
  `;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  let debounceTimer = null;
  let activeIndex = -1;

  function init() {
    document.body.appendChild(container);

    const overlay = document.getElementById('kw-search-overlay');
    const input = document.getElementById('kw-search-input');

    // Intercept Mintlify's search
    interceptMintlifySearch();

    // Keyboard shortcut (Cmd+K / Ctrl+K)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openSearch();
        return false;
      }

      if (e.key === 'Escape' && isOpen) {
        closeSearch();
      }

      if (isOpen && searchResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIndex = Math.min(activeIndex + 1, searchResults.length - 1);
          updateActiveResult();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIndex = Math.max(activeIndex - 1, 0);
          updateActiveResult();
        } else if (e.key === 'Enter' && activeIndex >= 0) {
          e.preventDefault();
          const result = searchResults[activeIndex];
          if (result) {
            navigateToResult(result);
          }
        }
      }
    }, true);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeSearch();
      }
    });

    // Search input handler
    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      clearTimeout(debounceTimer);

      if (query.length < 2) {
        showRecentSearches();
        return;
      }

      debounceTimer = setTimeout(() => {
        performSearch(query);
      }, 200);
    });

    // Click on result
    document.getElementById('kw-search-results').addEventListener('click', (e) => {
      const resultEl = e.target.closest('.kw-search-result');
      if (resultEl) {
        const index = parseInt(resultEl.dataset.index);
        if (!isNaN(index) && searchResults[index]) {
          navigateToResult(searchResults[index]);
        }
      }
    });

    // Preload search index for offline use
    preloadSearchIndex();
  }

  function interceptMintlifySearch() {
    const tryIntercept = () => {
      const headerSearch = document.querySelector('button:has(kbd), [class*="SearchButton"], input[placeholder*="Search"]');
      if (headerSearch && !headerSearch.dataset.aiSearchIntercepted) {
        headerSearch.dataset.aiSearchIntercepted = 'true';
        headerSearch.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openSearch();
        }, true);
      }
    };

    tryIntercept();
    setTimeout(tryIntercept, 500);
    setTimeout(tryIntercept, 1500);

    const observer = new MutationObserver(tryIntercept);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function preloadSearchIndex() {
    // Check for inline search index first (loaded via search-index-data.js)
    if (window.AI_SEARCH_INDEX && Array.isArray(window.AI_SEARCH_INDEX)) {
      searchIndex = window.AI_SEARCH_INDEX;
      console.log('[AI Search] Search index loaded from inline data:', searchIndex.length, 'entries');
      return;
    }

    // Fallback: try fetching from JSON file
    try {
      const response = await fetch('/search-index.json');
      if (response.ok) {
        searchIndex = await response.json();
        console.log('[AI Search] Search index loaded:', searchIndex.length, 'entries');
      }
    } catch (err) {
      console.log('[AI Search] Search index not available (will use API only)');
    }
  }

  function initFuse() {
    if (fuse || !searchIndex) return;

    // Dynamically load Fuse.js from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js';
    script.onload = () => {
      fuse = new Fuse(searchIndex, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'summary', weight: 1 },
          { name: 'author', weight: 0.5 },
          { name: 'topics', weight: 1 }
        ],
        threshold: 0.4,
        includeScore: true,
        includeMatches: true,
      });
      console.log('[AI Search] Fuse.js initialized for offline search');
    };
    document.head.appendChild(script);
  }

  function openSearch() {
    isOpen = true;
    document.body.classList.add('ai-search-open');
    container.classList.add('open');
    const input = document.getElementById('kw-search-input');
    input.value = '';
    input.focus();
    searchResults = [];
    activeIndex = -1;
    showRecentSearches();
    initFuse(); // Initialize Fuse.js on first open
  }

  function closeSearch() {
    isOpen = false;
    document.body.classList.remove('ai-search-open');
    container.classList.remove('open');
    searchResults = [];
    activeIndex = -1;
  }

  function showRecentSearches() {
    const resultsContainer = document.getElementById('kw-search-results');

    if (recentSearches.length === 0) {
      resultsContainer.innerHTML = `
        <div class="kw-search-empty">
          <svg class="kw-search-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>Search for pages, topics, or keywords</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = `
      <div class="kw-search-section">Recent searches</div>
      ${recentSearches.map((search, i) => `
        <a href="${escapeHtml(search.path)}" class="kw-search-result" data-index="${i}">
          <svg class="kw-search-result-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="kw-search-result-content">
            <div class="kw-search-result-title">${escapeHtml(search.title)}</div>
            <div class="kw-search-result-path">${escapeHtml(search.path)}</div>
          </div>
        </a>
      `).join('')}
    `;

    searchResults = recentSearches;
  }

  async function performSearch(query) {
    const resultsContainer = document.getElementById('kw-search-results');
    const statusEl = document.getElementById('kw-search-status');

    resultsContainer.innerHTML = `
      <div class="kw-search-loading">
        <div class="kw-search-spinner"></div>
        <span>Searching...</span>
      </div>
    `;

    try {
      // Try API first
      const response = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 15 }),
      });

      if (!response.ok) throw new Error('API error');

      const data = await response.json();
      statusEl.textContent = 'AI Conductor';

      if (!data.results || data.results.length === 0) {
        // Try offline search as fallback
        return performOfflineSearch(query);
      }

      searchResults = data.results.map(r => ({
        ...r,
        // Use local MDX path if available, otherwise external URL
        path: r.mdx_path || r.url,
      }));
      activeIndex = 0;

      renderResults(query, false);

    } catch (error) {
      console.log('[AI Search] API unavailable, using offline search');
      performOfflineSearch(query);
    }
  }

  function performOfflineSearch(query) {
    const resultsContainer = document.getElementById('kw-search-results');
    const statusEl = document.getElementById('kw-search-status');

    if (!fuse || !searchIndex) {
      resultsContainer.innerHTML = `
        <div class="kw-search-empty">
          <p>Search unavailable offline</p>
          <p style="font-size: 12px; margin-top: 8px;">Run the API locally or connect to the internet</p>
        </div>
      `;
      return;
    }

    statusEl.innerHTML = 'AI Conductor <span class="kw-search-offline-badge">Offline</span>';

    const results = fuse.search(query, { limit: 15 });

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="kw-search-empty">
          <p>No results found for "${escapeHtml(query)}"</p>
        </div>
      `;
      searchResults = [];
      return;
    }

    searchResults = results.map(r => ({
      ...r.item,
      similarity: 1 - (r.score || 0),
      source_type: 'knowledge-base',
      path: r.item.path,
    }));
    activeIndex = 0;

    renderResults(query, true);
  }

  function renderResults(query, isOffline) {
    const resultsContainer = document.getElementById('kw-search-results');

    // Group by source type
    const framework = searchResults.filter(r => r.source_type === 'framework');
    const knowledgeBase = searchResults.filter(r => r.source_type === 'knowledge-base');

    let html = '';

    if (framework.length > 0) {
      html += `<div class="kw-search-section">Framework Documentation</div>`;
      framework.forEach((result, i) => {
        html += renderResult(result, i, query, isOffline);
      });
    }

    if (knowledgeBase.length > 0) {
      html += `<div class="kw-search-section">Knowledge Base</div>`;
      knowledgeBase.forEach((result, i) => {
        html += renderResult(result, framework.length + i, query, isOffline);
      });
    }

    resultsContainer.innerHTML = html;
    updateActiveResult();
  }

  function renderResult(result, index, query, isOffline) {
    const isFramework = result.source_type === 'framework';
    const typeClass = isFramework ? 'framework' : (isOffline ? 'offline' : 'knowledge-base');
    const typeLabel = isFramework ? 'Framework' : (isOffline ? 'Offline' : 'KB');
    const title = highlightMatch(result.title, query);
    const snippet = result.summary ? highlightMatch(result.summary.slice(0, 150), query) : '';
    const path = result.path || '#';
    const matchScore = result.similarity ? Math.round(result.similarity * 100) + '%' : '';

    return `
      <a href="${escapeHtml(path)}" class="kw-search-result ${index === activeIndex ? 'active' : ''}" data-index="${index}">
        <svg class="kw-search-result-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isFramework ? 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' : 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z'}" />
        </svg>
        <div class="kw-search-result-content">
          <div class="kw-search-result-title">
            ${title}
            <span class="kw-search-result-type ${typeClass}">${typeLabel}</span>
          </div>
          <div class="kw-search-result-meta">${escapeHtml(result.author || '')} ${matchScore ? '· ' + matchScore + ' match' : ''}</div>
          ${snippet ? `<div class="kw-search-result-snippet">${snippet}...</div>` : ''}
        </div>
      </a>
    `;
  }

  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<span class="kw-search-highlight">$1</span>');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function updateActiveResult() {
    const results = document.querySelectorAll('.kw-search-result');
    results.forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
      if (i === activeIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function navigateToResult(result) {
    const path = result.path || result.url || '#';

    // Save to recent searches
    const existing = recentSearches.findIndex(s => s.path === path);
    if (existing !== -1) {
      recentSearches.splice(existing, 1);
    }
    recentSearches.unshift({
      title: result.title,
      path: path,
      source_type: result.source_type,
    });
    recentSearches = recentSearches.slice(0, 5);
    localStorage.setItem('ai-conductor-recent-searches', JSON.stringify(recentSearches));

    closeSearch();

    // Navigate locally (all results should link to local MDX now)
    window.location.href = path;
  }
})();
