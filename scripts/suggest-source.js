/**
 * Suggest a Source — Inline Form
 * Lets authenticated users suggest new authors/publications.
 * Attaches to elements with [data-suggest-source] attribute.
 */

(function() {
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://thought-leadership-api.thsonvt.workers.dev';

  // Inject styles
  const styles = document.createElement('style');
  styles.textContent = `
    .ss-trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #2563eb;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      background: none;
      padding: 0;
      transition: color 0.15s;
    }
    .ss-trigger:hover { color: #1d4ed8; }

    .ss-form {
      margin-top: 12px;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #f9fafb;
      display: none;
      max-width: 420px;
    }
    .ss-form.open { display: block; }

    .ss-field {
      margin-bottom: 12px;
    }
    .ss-field label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 4px;
    }
    .ss-field input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    }
    .ss-field input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .ss-submit {
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .ss-submit:hover { background: #1d4ed8; }
    .ss-submit:disabled { background: #9ca3af; cursor: not-allowed; }

    .ss-msg {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 13px;
      display: none;
    }
    .ss-msg.success {
      display: block;
      background: #f0fdf4;
      border: 1px solid #86efac;
      color: #166534;
    }
    .ss-msg.error {
      display: block;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
    }
    .ss-msg.warning {
      display: block;
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }

    .ss-signin-prompt {
      margin-top: 8px;
      font-size: 13px;
      color: #6b7280;
    }
    .ss-signin-prompt a {
      color: #2563eb;
      cursor: pointer;
      text-decoration: none;
    }
    .ss-signin-prompt a:hover { text-decoration: underline; }

    @media (prefers-color-scheme: dark) {
      .ss-form {
        background: #1f2937;
        border-color: #374151;
      }
      .ss-field label { color: #d1d5db; }
      .ss-field input {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
      }
      .ss-trigger { color: #60a5fa; }
      .ss-trigger:hover { color: #93bbfd; }
    }
  `;
  document.head.appendChild(styles);

  function init() {
    document.querySelectorAll('[data-suggest-source]').forEach(mount);
  }

  function mount(el) {
    if (el.dataset.ssInitialized) return;
    el.dataset.ssInitialized = 'true';

    // Trigger link
    const trigger = document.createElement('button');
    trigger.className = 'ss-trigger';
    trigger.textContent = 'Suggest a source \u2192';
    el.appendChild(trigger);

    // Inline form
    const form = document.createElement('div');
    form.className = 'ss-form';
    form.innerHTML = `
      <div class="ss-field">
        <label>Author name</label>
        <input type="text" class="ss-author" placeholder="e.g. Andrej Karpathy">
      </div>
      <div class="ss-field">
        <label>Publication URL</label>
        <input type="url" class="ss-url" placeholder="https://...">
      </div>
      <button type="button" class="ss-submit">Submit suggestion</button>
      <div class="ss-msg"></div>
    `;
    el.appendChild(form);

    const msg = form.querySelector('.ss-msg');

    trigger.onclick = () => {
      const isOpen = form.classList.contains('open');
      if (isOpen) {
        form.classList.remove('open');
        return;
      }

      // Check auth
      if (!window.highlightsAuth || !window.highlightsAuth.isAuthenticated()) {
        msg.className = 'ss-msg';
        form.classList.add('open');
        form.querySelector('.ss-submit').style.display = 'none';

        msg.className = 'ss-msg warning';
        msg.innerHTML = 'Sign in to suggest a source. <a class="ss-signin-link">Sign in</a>';
        msg.style.display = 'block';

        msg.querySelector('.ss-signin-link').onclick = (e) => {
          e.preventDefault();
          window.highlightsAuth.openModal('signin');
        };
        return;
      }

      form.classList.add('open');
      form.querySelector('.ss-submit').style.display = '';
      msg.style.display = 'none';
      msg.className = 'ss-msg';
    };

    // Re-check auth when user signs in
    window.addEventListener('highlights-auth-change', () => {
      if (window.highlightsAuth.isAuthenticated() && form.classList.contains('open')) {
        form.querySelector('.ss-submit').style.display = '';
        msg.style.display = 'none';
        msg.className = 'ss-msg';
      }
    });

    // Submit handler
    form.querySelector('.ss-submit').onclick = async () => {
      const authorName = form.querySelector('.ss-author').value.trim();
      const url = form.querySelector('.ss-url').value.trim();
      const showMessage = (type, text, asHtml = false) => {
        msg.className = `ss-msg ${type}`;
        if (asHtml) {
          msg.innerHTML = text;
        } else {
          msg.textContent = text;
        }
        msg.style.display = 'block';
      };

      if (!authorName && !url) {
        showMessage('error', 'Please provide at least an author name or URL.');
        return;
      }

      const submitBtn = form.querySelector('.ss-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      msg.style.display = 'none';

      try {
        const token = await window.highlightsAuth.getToken();
        if (!token) {
          showMessage('warning', 'Session expired. <a class="ss-signin-link">Sign in again</a>', true);
          msg.querySelector('.ss-signin-link').onclick = (e) => {
            e.preventDefault();
            window.highlightsAuth.openModal('signin');
          };
          return;
        }

        const res = await fetch(`${API_URL}/api/suggestions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            author_name: authorName || undefined,
            url: url || undefined,
          }),
        });

        const data = await res.json();

        if (data.duplicate) {
          if (data.existing_title) {
            showMessage('warning', `This URL is already in our library: "${data.existing_title}"`);
          } else {
            showMessage('warning', 'This URL has already been suggested. We\'ll review it soon!');
          }
          return;
        }

        if (data.success) {
          showMessage('success', 'Thanks! Your suggestion has been submitted for review.');
          form.querySelector('.ss-author').value = '';
          form.querySelector('.ss-url').value = '';
          return;
        }

        showMessage('error', data.error || 'Something went wrong. Please try again.');

      } catch (err) {
        showMessage('error', 'Network error. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit suggestion';
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-mount on Mintlify's client-side navigation
  const observer = new MutationObserver(() => {
    document.querySelectorAll('[data-suggest-source]:not([data-ss-initialized])').forEach(mount);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
