(function () {
  const root = typeof document !== 'undefined' ? document.body : null;
  const API_BASE = (root && root.dataset.apiBase) || '/api';
  let csrfToken = null;
  let debug = false;
  try {
    debug = typeof localStorage !== 'undefined' && localStorage.getItem('flowstate-debug') === '1';
  } catch (err) {
    debug = false;
  }

  function logDebug(...args) {
    if (debug) {
      console.debug('[FlowStateApi]', ...args);
    }
  }

  async function ensureCsrf() {
    if (csrfToken) {
      return csrfToken;
    }
    try {
      const res = await fetch(`${API_BASE}/auth.php?action=csrf`, {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) {
        throw new Error(`Failed to obtain CSRF token (${res.status})`);
      }
      const data = await res.json();
      csrfToken = data.csrf;
      logDebug('Fetched CSRF token');
      return csrfToken;
    } catch (error) {
      logDebug('CSRF fetch error', error);
      throw error;
    }
  }

  async function request(path, options = {}) {
    const opts = { ...options };
    const headers = { ...(opts.headers || {}) };
    headers['Accept'] = 'application/json';
    if (opts.body && !(opts.body instanceof FormData)) {
      if (typeof opts.body !== 'string') {
        opts.body = JSON.stringify(opts.body);
      }
      headers['Content-Type'] = 'application/json';
    }
    opts.headers = headers;
    opts.credentials = 'include';

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, opts);
    } catch (error) {
      logDebug('Network error', error);
      const err = new Error('network_error');
      err.cause = error;
      throw err;
    }

    if (res.status === 204) {
      return { ok: true, __status: res.status };
    }

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (error) {
        logDebug('Failed to parse JSON', error);
      }
    }

    if (data && typeof data === 'object') {
      data.__status = res.status;
      if (typeof data.ok === 'undefined') {
        data.ok = res.ok;
      }
      if (res.status === 401) {
        data.unauthorized = true;
      }
      if (data.error === 'invalid_csrf') {
        csrfToken = null;
      }
      return data;
    }

    return { ok: res.ok, __status: res.status, unauthorized: res.status === 401 };
  }

  const FlowStateApi = {
    async session() {
      return request('/auth.php?action=session');
    },
    async login(email, password) {
      return request('/auth.php', {
        method: 'POST',
        body: { email, password }
      });
    },
    async logout() {
      const res = await request('/auth.php?action=logout', { method: 'POST' });
      csrfToken = null;
      return res;
    },
    async getNoteBySlug(slug, isPublic = false) {
      const params = new URLSearchParams();
      params.set('slug', slug);
      if (isPublic) {
        params.set('public', '1');
      }
      return request(`/notes.php?${params.toString()}`);
    },
    async getNoteById(id) {
      return request(`/notes.php?id=${encodeURIComponent(id)}`);
    },
    async search(term) {
      return request(`/notes.php?search=${encodeURIComponent(term)}`);
    },
    async related(slug) {
      return request(`/notes.php?related=${encodeURIComponent(slug)}`);
    },
    async backlinks(slug) {
      return request(`/notes.php?backlinks=${encodeURIComponent(slug)}`);
    },
    async graph(isPublic = false) {
      const params = new URLSearchParams();
      params.set('graph', '1');
      if (isPublic) {
        params.set('public', '1');
      }
      return request(`/notes.php?${params.toString()}`);
    },
    async createNote(payload) {
      const token = await ensureCsrf();
      return request('/notes.php', {
        method: 'POST',
        headers: { 'X-CSRF-Token': token },
        body: payload
      });
    },
    async updateNote(id, payload, etag) {
      const token = await ensureCsrf();
      return request(`/notes.php?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'X-CSRF-Token': token, 'If-Match': etag },
        body: payload
      });
    },
    async deleteNote(id) {
      const token = await ensureCsrf();
      return request(`/notes.php?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': token }
      });
    },
    async togglePublic(id, value) {
      const token = await ensureCsrf();
      return request(`/publish.php?id=${encodeURIComponent(id)}&public=${value ? '1' : '0'}`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': token }
      });
    },
    async reindexAll() {
      const token = await ensureCsrf();
      return request('/notes.php?action=reindexAll', {
        method: 'GET',
        headers: { 'X-CSRF-Token': token }
      });
    }
  };

  window.FlowStateApi = FlowStateApi;
}());
