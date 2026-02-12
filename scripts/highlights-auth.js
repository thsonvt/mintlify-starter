/**
 * Highlights Auth UI
 * Handles user authentication for the highlights feature
 * Uses Supabase Auth with email/password
 */

(function() {
  // Configuration
  const SUPABASE_URL = 'https://evqsckxouvkdlxcvntvu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cXNja3hvdXZrZGx4Y3ZudHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTg4NTcsImV4cCI6MjA4NTM5NDg1N30.4PrfzzdCXui_UTdSoKgunKxZdiQnTZ2-0i5ZHE9vJTc';

  // State
  let supabase = null;
  let currentUser = null;
  let authModal = null;
  let isInitialized = false;

  // Load Supabase JS client
  function loadSupabaseClient() {
    return new Promise((resolve, reject) => {
      if (window.supabase) {
        resolve(window.supabase);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = () => resolve(window.supabase);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Initialize Supabase client
  async function initSupabase() {
    const { createClient } = await loadSupabaseClient();
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      updateAuthUI();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateAuthUI();

      // Dispatch custom event for other modules
      window.dispatchEvent(new CustomEvent('highlights-auth-change', {
        detail: { user: currentUser, event }
      }));
    });

    isInitialized = true;
  }

  // Inject styles
  function injectStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
      .hl-auth-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        color: #374151;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }

      .hl-auth-btn:hover {
        background: #f9fafb;
        border-color: #d1d5db;
      }

      .hl-auth-btn-signed-in {
        background: #f0fdf4;
        border-color: #86efac;
        color: #166534;
      }

      .hl-auth-btn-signed-in:hover {
        background: #dcfce7;
      }

      .hl-user-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #10b981;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
      }

      .hl-auth-modal-overlay {
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
      }

      .hl-auth-modal-overlay.open {
        opacity: 1;
        visibility: visible;
      }

      .hl-auth-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        max-width: calc(100vw - 40px);
        background: white;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        padding: 24px;
        z-index: 1000000;
      }

      .hl-auth-modal h2 {
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 600;
        color: #111827;
      }

      .hl-auth-modal p {
        margin: 0 0 20px 0;
        font-size: 14px;
        color: #6b7280;
      }

      .hl-auth-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .hl-auth-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .hl-auth-field label {
        font-size: 14px;
        font-weight: 500;
        color: #374151;
      }

      .hl-auth-field input {
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.15s;
      }

      .hl-auth-field input:focus {
        border-color: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
      }

      .hl-auth-submit {
        padding: 10px 16px;
        background: #10b981;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }

      .hl-auth-submit:hover {
        background: #059669;
      }

      .hl-auth-submit:disabled {
        background: #9ca3af;
        cursor: not-allowed;
      }

      .hl-auth-toggle {
        text-align: center;
        font-size: 14px;
        color: #6b7280;
      }

      .hl-auth-toggle a {
        color: #10b981;
        cursor: pointer;
        text-decoration: none;
      }

      .hl-auth-toggle a:hover {
        text-decoration: underline;
      }

      .hl-auth-error {
        padding: 10px 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 6px;
        color: #dc2626;
        font-size: 14px;
      }

      .hl-auth-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 16px 0;
        color: #9ca3af;
        font-size: 13px;
      }

      .hl-auth-divider::before,
      .hl-auth-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #e5e7eb;
      }

      .hl-auth-google {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 10px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        color: #374151;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }

      .hl-auth-google:hover {
        background: #f9fafb;
        border-color: #d1d5db;
      }

      .hl-auth-google svg {
        width: 18px;
        height: 18px;
      }

      .hl-auth-close {
        position: absolute;
        top: 16px;
        right: 16px;
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

      .hl-auth-close:hover {
        background: #f3f4f6;
        color: #374151;
      }

      .hl-user-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        min-width: 180px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px);
        transition: all 0.15s;
      }

      .hl-user-menu.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .hl-user-menu-item {
        display: block;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: none;
        text-align: left;
        font-size: 14px;
        color: #374151;
        cursor: pointer;
      }

      .hl-user-menu-item:hover {
        background: #f9fafb;
      }

      .hl-user-menu-item.danger {
        color: #dc2626;
      }

      .hl-user-menu-divider {
        height: 1px;
        background: #e5e7eb;
        margin: 4px 0;
      }

      @media (prefers-color-scheme: dark) {
        .hl-auth-btn {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        .hl-auth-btn:hover {
          background: #374151;
        }
        .hl-auth-btn-signed-in {
          background: #064e3b;
          border-color: #10b981;
          color: #a7f3d0;
        }
        .hl-auth-modal {
          background: #1f2937;
        }
        .hl-auth-modal h2 {
          color: #f9fafb;
        }
        .hl-auth-modal p {
          color: #9ca3af;
        }
        .hl-auth-field label {
          color: #d1d5db;
        }
        .hl-auth-field input {
          background: #374151;
          border-color: #4b5563;
          color: #f9fafb;
        }
        .hl-user-menu {
          background: #1f2937;
          border-color: #374151;
        }
        .hl-user-menu-item {
          color: #f9fafb;
        }
        .hl-user-menu-item:hover {
          background: #374151;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // Create auth button
  function createAuthButton() {
    const container = document.createElement('div');
    container.id = 'hl-auth-container';
    container.style.cssText = 'position: relative; margin-left: 8px;';

    const btn = document.createElement('button');
    btn.className = 'hl-auth-btn';
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span>Sign in</span>
    `;
    btn.onclick = () => openAuthModal('signin');

    container.appendChild(btn);

    // Create user menu (hidden initially)
    const menu = document.createElement('div');
    menu.className = 'hl-user-menu';
    menu.innerHTML = `
      <button class="hl-user-menu-item" data-action="highlights">My Highlights</button>
      <div class="hl-user-menu-divider"></div>
      <button class="hl-user-menu-item danger" data-action="signout">Sign out</button>
    `;
    menu.onclick = (e) => {
      const action = e.target.dataset?.action;
      if (action === 'highlights') {
        window.location.href = '/kb/highlights';
      } else if (action === 'signout') {
        signOut();
      }
      menu.classList.remove('open');
    };
    container.appendChild(menu);

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    // Insert into navbar
    const navbar = document.querySelector('nav') ||
                   document.querySelector('[class*="navbar"]') ||
                   document.querySelector('header');
    if (navbar) {
      // Try to find a good spot in the navbar
      const navRight = navbar.querySelector('[class*="right"]') ||
                       navbar.querySelector('[class*="actions"]') ||
                       navbar;
      navRight.appendChild(container);
    } else {
      // Fallback: fixed position
      container.style.cssText = 'position: fixed; top: 16px; right: 16px; z-index: 1000;';
      document.body.appendChild(container);
    }

    return container;
  }

  // Create auth modal
  function createAuthModal() {
    const overlay = document.createElement('div');
    overlay.className = 'hl-auth-modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) closeAuthModal();
    };

    const modal = document.createElement('div');
    modal.className = 'hl-auth-modal';
    modal.innerHTML = `
      <button class="hl-auth-close">&times;</button>
      <h2>Sign in</h2>
      <p>Sign in to save highlights and notes across devices.</p>
      <div class="hl-auth-error" style="display: none;"></div>
      <button class="hl-auth-google" type="button">
        <svg viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>
      <div class="hl-auth-divider">or</div>
      <form class="hl-auth-form">
        <div class="hl-auth-field">
          <label for="hl-email">Email</label>
          <input type="email" id="hl-email" placeholder="you@example.com" required>
        </div>
        <div class="hl-auth-field">
          <label for="hl-password">Password</label>
          <input type="password" id="hl-password" placeholder="••••••••" required minlength="6">
        </div>
        <button type="submit" class="hl-auth-submit">Sign in</button>
      </form>
      <p class="hl-auth-toggle">
        Don't have an account? <a data-mode="signup">Sign up</a>
      </p>
    `;

    // Close button
    modal.querySelector('.hl-auth-close').onclick = closeAuthModal;

    // Google sign in
    modal.querySelector('.hl-auth-google').onclick = handleGoogleSignIn;

    // Form submission
    const form = modal.querySelector('form');
    form.onsubmit = handleAuthSubmit;

    // Toggle mode
    modal.querySelector('.hl-auth-toggle a').onclick = (e) => {
      const newMode = e.target.dataset.mode;
      setAuthMode(newMode);
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return overlay;
  }

  // Set auth mode (signin/signup)
  function setAuthMode(mode) {
    if (!authModal) return;

    const modal = authModal.querySelector('.hl-auth-modal');
    const h2 = modal.querySelector('h2');
    const submit = modal.querySelector('.hl-auth-submit');
    const toggle = modal.querySelector('.hl-auth-toggle');

    if (mode === 'signup') {
      h2.textContent = 'Create account';
      submit.textContent = 'Sign up';
      toggle.innerHTML = 'Already have an account? <a data-mode="signin">Sign in</a>';
    } else {
      h2.textContent = 'Sign in';
      submit.textContent = 'Sign in';
      toggle.innerHTML = 'Don\'t have an account? <a data-mode="signup">Sign up</a>';
    }

    toggle.querySelector('a').onclick = (e) => setAuthMode(e.target.dataset.mode);
    modal.dataset.mode = mode;
    hideError();
  }

  // Open auth modal
  function openAuthModal(mode = 'signin') {
    if (!authModal) {
      authModal = createAuthModal();
    }
    setAuthMode(mode);
    authModal.classList.add('open');
    authModal.querySelector('#hl-email').focus();
  }

  // Close auth modal
  function closeAuthModal() {
    if (authModal) {
      authModal.classList.remove('open');
      authModal.querySelector('form').reset();
      hideError();
    }
  }

  // Handle Google sign in
  async function handleGoogleSignIn() {
    hideError();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      });

      if (error) throw error;

      // OAuth redirects, so modal will close on return

    } catch (err) {
      showError(err.message || 'Google sign in failed');
    }
  }

  // Handle form submission
  async function handleAuthSubmit(e) {
    e.preventDefault();

    const modal = authModal.querySelector('.hl-auth-modal');
    const mode = modal.dataset.mode || 'signin';
    const email = modal.querySelector('#hl-email').value;
    const password = modal.querySelector('#hl-password').value;
    const submit = modal.querySelector('.hl-auth-submit');

    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';
    hideError();

    try {
      let result;
      if (mode === 'signup') {
        result = await supabase.auth.signUp({ email, password });
      } else {
        result = await supabase.auth.signInWithPassword({ email, password });
      }

      if (result.error) {
        throw result.error;
      }

      if (mode === 'signup' && !result.data.session) {
        showError('Check your email for a confirmation link.');
        submit.disabled = false;
        submit.textContent = 'Sign up';
        return;
      }

      closeAuthModal();

    } catch (err) {
      showError(err.message || 'Authentication failed');
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'Sign up' : 'Sign in';
    }
  }

  // Show error message
  function showError(message) {
    const errorEl = authModal?.querySelector('.hl-auth-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  // Hide error message
  function hideError() {
    const errorEl = authModal?.querySelector('.hl-auth-error');
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  }

  // Sign out
  async function signOut() {
    await supabase.auth.signOut();
  }

  // Update auth UI based on current user
  function updateAuthUI() {
    const container = document.getElementById('hl-auth-container');
    if (!container) return;

    const btn = container.querySelector('.hl-auth-btn');
    const menu = container.querySelector('.hl-user-menu');

    if (currentUser) {
      const initial = (currentUser.email?.[0] || 'U').toUpperCase();
      btn.className = 'hl-auth-btn hl-auth-btn-signed-in';
      btn.innerHTML = `
        <span class="hl-user-avatar">${initial}</span>
        <span>${currentUser.email?.split('@')[0] || 'User'}</span>
      `;
      btn.onclick = () => menu.classList.toggle('open');
    } else {
      btn.className = 'hl-auth-btn';
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Sign in</span>
      `;
      btn.onclick = () => openAuthModal('signin');
      menu.classList.remove('open');
    }
  }

  // Public API
  window.highlightsAuth = {
    init: async () => {
      if (isInitialized) return;
      injectStyles();
      createAuthButton();
      await initSupabase();
    },
    getUser: () => currentUser,
    getToken: async () => {
      const { data: { session } } = await supabase?.auth.getSession() || {};
      return session?.access_token || null;
    },
    openModal: openAuthModal,
    isAuthenticated: () => !!currentUser,
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.highlightsAuth.init());
  } else {
    window.highlightsAuth.init();
  }
})();
