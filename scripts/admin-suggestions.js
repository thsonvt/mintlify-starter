/**
 * Source Suggestions Admin UI
 * Mounts into elements with [data-source-suggestions-admin].
 */

(function() {
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://thought-leadership-api.thsonvt.workers.dev';

  const STATUS_VALUES = ['all', 'pending', 'approved', 'rejected'];

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB').format(d);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 60);
  }

  function normalizeUrl(raw) {
    if (!raw) return '';
    const candidate = raw.trim();
    if (!candidate) return '';

    try {
      const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
      const url = new URL(normalized);
      url.hash = '';
      if (url.pathname.length > 1) {
        url.pathname = url.pathname.replace(/\/+$/, '');
      }
      return url.toString();
    } catch {
      return candidate;
    }
  }

  function deriveName(item) {
    if (item.author_name && item.author_name.trim()) return item.author_name.trim();
    try {
      const hostname = new URL(normalizeUrl(item.url)).hostname.replace(/^www\./, '');
      return hostname.split('.')[0].replace(/[-_]+/g, ' ');
    } catch {
      return 'Unknown Source';
    }
  }

  function inferType(url) {
    const value = String(url || '').toLowerCase();
    if (value.includes('substack') || value.includes('newsletter')) return 'newsletter';
    return 'blog';
  }

  function yamlQuote(text) {
    return `'${String(text || '').replace(/'/g, "''")}'`;
  }

  function buildYamlSnippet(item) {
    const name = deriveName(item);
    const url = normalizeUrl(item.url);
    const id = slugify(name) || `source-${String(item.id || '').slice(0, 8)}`;

    return [
      `- name: ${yamlQuote(name)}`,
      `  id: ${id}`,
      `  url: ${yamlQuote(url)}`,
      `  type: ${inferType(url)}`,
      '  rss: null',
      '  tags: [community-submitted]',
      '  active: false',
    ].join('\n');
  }

  function injectStyles() {
    if (document.getElementById('ssa-styles')) return;

    const style = document.createElement('style');
    style.id = 'ssa-styles';
    style.textContent = `
      .ssa-wrap { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      .ssa-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .ssa-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .ssa-input, .ssa-select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
      .ssa-input { min-width: 220px; }
      .ssa-btn { border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; padding: 7px 10px; cursor: pointer; font-size: 13px; }
      .ssa-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
      .ssa-btn.success { background: #16a34a; border-color: #16a34a; color: #fff; }
      .ssa-btn.warn { background: #b45309; border-color: #b45309; color: #fff; }
      .ssa-btn.ghost { background: #f9fafb; }
      .ssa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .ssa-message { display: none; margin-bottom: 10px; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
      .ssa-message.show { display: block; }
      .ssa-message.success { background: #ecfdf3; border: 1px solid #86efac; color: #166534; }
      .ssa-message.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
      .ssa-message.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; }
      .ssa-list { display: grid; gap: 10px; }
      .ssa-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
      .ssa-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
      .ssa-url { color: #2563eb; text-decoration: none; font-size: 13px; }
      .ssa-meta { color: #6b7280; font-size: 12px; margin-top: 4px; }
      .ssa-badges { display: flex; gap: 6px; flex-wrap: wrap; }
      .ssa-badge { font-size: 11px; border-radius: 999px; padding: 2px 8px; border: 1px solid transparent; }
      .ssa-status-pending { background: #fef3c7; color: #92400e; border-color: #fde68a; }
      .ssa-status-approved { background: #dcfce7; color: #166534; border-color: #86efac; }
      .ssa-status-rejected { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
      .ssa-promoted-yes { background: #ecfeff; color: #155e75; border-color: #a5f3fc; }
      .ssa-promoted-no { background: #f3f4f6; color: #4b5563; border-color: #d1d5db; }
      .ssa-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .ssa-empty { padding: 24px; text-align: center; color: #6b7280; border: 1px dashed #d1d5db; border-radius: 10px; }
    `;
    document.head.appendChild(style);
  }

  async function waitForAuth(retries = 60, interval = 100) {
    let attempts = 0;
    while ((!window.highlightsAuth || !window.highlightsAuth.getToken) && attempts < retries) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts += 1;
    }
    return window.highlightsAuth;
  }

  function mount(el) {
    if (el.dataset.ssaMounted === 'true') return;
    el.dataset.ssaMounted = 'true';

    injectStyles();

    const state = {
      loading: false,
      rows: [],
      status: 'all',
      promoted: 'all',
      search: '',
    };

    el.innerHTML = `
      <div class="ssa-wrap">
        <div id="ssa-message" class="ssa-message"></div>
        <div id="ssa-top" class="ssa-top"></div>
        <div id="ssa-list" class="ssa-list"></div>
      </div>
    `;

    const messageEl = el.querySelector('#ssa-message');
    const topEl = el.querySelector('#ssa-top');
    const listEl = el.querySelector('#ssa-list');

    const setMessage = (type, text) => {
      messageEl.className = `ssa-message show ${type}`;
      messageEl.textContent = text;
    };

    const clearMessage = () => {
      messageEl.className = 'ssa-message';
      messageEl.textContent = '';
    };

    const getFilteredRows = () => {
      let rows = state.rows;

      if (state.status !== 'all') {
        rows = rows.filter((row) => row.status === state.status);
      }

      if (state.promoted === 'yes') {
        rows = rows.filter((row) => !!row.promoted_to_sources);
      }

      if (state.promoted === 'no') {
        rows = rows.filter((row) => !row.promoted_to_sources);
      }

      if (state.search) {
        const q = state.search.toLowerCase();
        rows = rows.filter((row) =>
          String(row.author_name || '').toLowerCase().includes(q) ||
          String(row.url || '').toLowerCase().includes(q) ||
          String(row.id || '').toLowerCase().includes(q)
        );
      }

      return rows;
    };

    const renderTop = () => {
      const pendingCount = state.rows.filter((row) => row.status === 'pending').length;
      const syncedCount = state.rows.filter((row) => row.promoted_to_sources).length;

      topEl.innerHTML = `
        <div style="font-size: 13px; color: #6b7280;">
          ${state.rows.length} suggestion(s) • ${pendingCount} pending • ${syncedCount} promoted
        </div>
        <div class="ssa-filters">
          <input id="ssa-search" class="ssa-input" type="text" placeholder="Search suggestions..." value="${escapeHtml(state.search)}">
          <select id="ssa-status" class="ssa-select">
            <option value="all" ${state.status === 'all' ? 'selected' : ''}>All status</option>
            <option value="pending" ${state.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="approved" ${state.status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="rejected" ${state.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
          <select id="ssa-promoted" class="ssa-select">
            <option value="all" ${state.promoted === 'all' ? 'selected' : ''}>All promotion</option>
            <option value="no" ${state.promoted === 'no' ? 'selected' : ''}>Not promoted</option>
            <option value="yes" ${state.promoted === 'yes' ? 'selected' : ''}>Promoted</option>
          </select>
          <button class="ssa-btn ghost" data-action="reload">Refresh</button>
        </div>
      `;

      const searchEl = topEl.querySelector('#ssa-search');
      const statusEl = topEl.querySelector('#ssa-status');
      const promotedEl = topEl.querySelector('#ssa-promoted');

      searchEl?.addEventListener('input', (e) => {
        state.search = e.target.value || '';
        renderList();
      });

      statusEl?.addEventListener('change', (e) => {
        state.status = STATUS_VALUES.includes(e.target.value) ? e.target.value : 'all';
        renderList();
      });

      promotedEl?.addEventListener('change', (e) => {
        state.promoted = ['all', 'yes', 'no'].includes(e.target.value) ? e.target.value : 'all';
        renderList();
      });

      topEl.querySelector('[data-action="reload"]')?.addEventListener('click', () => {
        void loadData();
      });
    };

    const renderList = () => {
      const rows = getFilteredRows();
      if (!rows.length) {
        listEl.innerHTML = '<div class="ssa-empty">No suggestions match these filters.</div>';
        return;
      }

      listEl.innerHTML = rows.map((item) => {
        const safeAuthor = escapeHtml(item.author_name || 'Unknown source');
        const safeUrl = escapeHtml(item.url || '');
        const safeId = escapeHtml(item.id || '');
        const statusClass = item.status === 'approved'
          ? 'ssa-status-approved'
          : item.status === 'rejected'
            ? 'ssa-status-rejected'
            : 'ssa-status-pending';

        const promotionClass = item.promoted_to_sources ? 'ssa-promoted-yes' : 'ssa-promoted-no';
        const promotionText = item.promoted_to_sources
          ? `Promoted${item.promoted_source_id ? ` (${escapeHtml(item.promoted_source_id)})` : ''}`
          : 'Not promoted';

        return `
          <div class="ssa-item" data-id="${safeId}">
            <div class="ssa-row">
              <div>
                <div style="font-size: 15px; font-weight: 600; color: #111827;">${safeAuthor}</div>
                <a class="ssa-url" href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl || '(no URL)'}</a>
                <div class="ssa-meta">Submitted ${formatDate(item.created_at)} • ${safeId}</div>
              </div>
              <div class="ssa-badges">
                <span class="ssa-badge ${statusClass}">${escapeHtml(item.status || 'pending')}</span>
                <span class="ssa-badge ${promotionClass}">${promotionText}</span>
              </div>
            </div>
            <div class="ssa-actions">
              <button class="ssa-btn success" data-action="set-status" data-status="approved" data-id="${safeId}">Approve</button>
              <button class="ssa-btn warn" data-action="set-status" data-status="rejected" data-id="${safeId}">Reject</button>
              <button class="ssa-btn" data-action="set-status" data-status="pending" data-id="${safeId}">Set pending</button>
              <button class="ssa-btn" data-action="toggle-promoted" data-id="${safeId}">${item.promoted_to_sources ? 'Unmark promoted' : 'Mark promoted'}</button>
              <button class="ssa-btn" data-action="copy-yaml" data-id="${safeId}">Copy YAML snippet</button>
            </div>
          </div>
        `;
      }).join('');
    };

    async function api(path, options = {}) {
      const token = await window.highlightsAuth.getToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      return payload;
    }

    async function hasAuthenticatedSession(auth) {
      if (!auth) return false;
      if (auth.isAuthenticated && auth.isAuthenticated()) return true;

      // Fallback for race conditions where currentUser isn't set yet
      // but Supabase session already exists.
      const token = await auth.getToken();
      return Boolean(token);
    }

    async function loadData() {
      if (state.loading) return;
      state.loading = true;
      clearMessage();
      listEl.innerHTML = '<div class="ssa-empty">Loading suggestions...</div>';

      try {
        const data = await api('/api/admin/suggestions?status=all&limit=300');
        state.rows = Array.isArray(data.suggestions) ? data.suggestions : [];
        renderTop();
        renderList();
      } catch (err) {
        setMessage('error', err.message || 'Failed to load admin suggestions.');
        listEl.innerHTML = '<div class="ssa-empty">Unable to load suggestions.</div>';
      } finally {
        state.loading = false;
      }
    }

    async function updateStatus(id, status) {
      clearMessage();
      try {
        const data = await api(`/api/admin/suggestions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });

        if (data.suggestion) {
          state.rows = state.rows.map((row) => row.id === id ? data.suggestion : row);
          renderTop();
          renderList();
        }

        setMessage('success', `Suggestion updated to ${status}.`);
      } catch (err) {
        setMessage('error', err.message || 'Failed to update suggestion status.');
      }
    }

    async function togglePromoted(id) {
      clearMessage();
      const row = state.rows.find((item) => item.id === id);
      if (!row) return;

      const promote = !row.promoted_to_sources;
      const promotedSourceId = promote
        ? (window.prompt('Optional: source id in sources.yaml (leave blank to auto-fill later):', row.promoted_source_id || '') || '').trim()
        : '';

      try {
        const data = await api(`/api/admin/suggestions/${id}/promotion`, {
          method: 'PATCH',
          body: JSON.stringify({
            promoted_to_sources: promote,
            promoted_source_id: promotedSourceId || null,
          }),
        });

        if (data.suggestion) {
          state.rows = state.rows.map((item) => item.id === id ? data.suggestion : item);
          renderTop();
          renderList();
        }

        setMessage('success', promote ? 'Marked as promoted.' : 'Promotion mark removed.');
      } catch (err) {
        setMessage('error', err.message || 'Failed to update promotion state.');
      }
    }

    async function copyYaml(id) {
      const row = state.rows.find((item) => item.id === id);
      if (!row) return;

      try {
        const snippet = buildYamlSnippet(row);
        await navigator.clipboard.writeText(snippet);
        setMessage('info', 'YAML snippet copied. Paste into ai-thought-leadership/config/sources.yaml');
      } catch {
        setMessage('error', 'Could not copy to clipboard.');
      }
    }

    el.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const button = target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const id = button.dataset.id;

      if (action === 'set-status' && id) {
        const status = button.dataset.status;
        if (STATUS_VALUES.includes(status)) {
          void updateStatus(id, status);
        }
        return;
      }

      if (action === 'toggle-promoted' && id) {
        void togglePromoted(id);
        return;
      }

      if (action === 'copy-yaml' && id) {
        void copyYaml(id);
      }
    });

    const renderAuthPrompt = () => {
      el.innerHTML = `
        <div class="ssa-wrap" style="text-align:center; padding: 28px;">
          <h3 style="margin:0 0 8px 0; font-size:20px; color:#111827;">Admin sign-in required</h3>
          <p style="margin:0 0 16px 0; color:#6b7280;">Sign in with an admin account to review source suggestions.</p>
          <button class="ssa-btn primary" id="ssa-signin">Sign in</button>
        </div>
      `;
      el.querySelector('#ssa-signin')?.addEventListener('click', () => {
        window.highlightsAuth?.openModal('signin');
      });
    };

    const init = async () => {
      const auth = await waitForAuth();
      if (!auth) {
        el.innerHTML = '<div class="ssa-empty">Auth module failed to load.</div>';
        return;
      }

      const authenticated = await hasAuthenticatedSession(auth);
      if (!authenticated) {
        renderAuthPrompt();
      } else {
        renderTop();
        void loadData();
      }

      window.addEventListener('highlights-auth-change', (event) => {
        const authEvent = event?.detail?.event;
        if (authEvent === 'SIGNED_OUT') {
          renderAuthPrompt();
          return;
        }

        if (event?.detail?.user) {
          renderTop();
          void loadData();
        }
      });
    };

    void init();
  }

  function initAll() {
    document.querySelectorAll('[data-source-suggestions-admin]').forEach(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  const observer = new MutationObserver(initAll);

  observer.observe(document.body, { childList: true, subtree: true });
})();
