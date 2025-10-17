(function () {
  const API_BASE = '/api';
  let csrfToken = null;

  async function ensureCsrf() {
    if (csrfToken) {
      return csrfToken;
    }
    const res = await fetch(`${API_BASE}/auth.php?action=csrf`, { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.csrf;
    return csrfToken;
  }

  async function request(path, options = {}) {
    const headers = options.headers || {};
    headers['Accept'] = 'application/json';
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    options.headers = headers;
    options.credentials = 'include';

    const res = await fetch(`${API_BASE}${path}`, options);
    if (res.status === 204) {
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      data.__status = res.status;
      return data;
    }
    return { __status: res.status };
  }

  const FlowStateApi = {
    async session() {
      return request('/auth.php?action=session');
    },
    async login(email, password) {
      return request('/auth.php', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
    },
    async logout() {
      return request('/auth.php?action=logout', { method: 'POST' });
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
        body: JSON.stringify(payload)
      });
    },
    async updateNote(id, payload, etag) {
      const token = await ensureCsrf();
      return request(`/notes.php?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'X-CSRF-Token': token, 'If-Match': etag },
        body: JSON.stringify(payload)
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
