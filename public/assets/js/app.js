(function () {
  const body = document.body;
  const isPublic = body.dataset.public === '1';
  const initialSlug = body.dataset.slug || null;
  const swPath = body.dataset.swPath || 'sw.js';

  const elements = {
    title: document.getElementById('note-title'),
    tags: document.getElementById('note-tags'),
    content: document.getElementById('note-content'),
    related: document.getElementById('related-list'),
    backlinks: document.getElementById('backlinks-list'),
    save: document.getElementById('save-button'),
    publish: document.getElementById('publish-toggle'),
    syncStatus: document.getElementById('sync-status'),
    graphToggle: document.getElementById('graph-toggle'),
    graphPanel: document.getElementById('graph-panel'),
    cmdkDialog: document.getElementById('cmdk'),
    cmdkInput: document.getElementById('cmdk-input'),
    cmdkResults: document.getElementById('cmdk-results'),
    toast: document.getElementById('toast'),
    topActions: document.querySelector('.top-actions'),
    saveFooter: document.querySelector('.editor-footer')
  };

  const graphCanvas = document.getElementById('graph-canvas');
  const graph = graphCanvas && window.FlowStateGraph ? new window.FlowStateGraph(graphCanvas) : null;

  const state = {
    current: null,
    etag: null,
    outbox: 0,
    autosaveTimer: null,
    saveInFlight: false,
    pendingPayload: null,
    dirty: false,
    graphData: null
  };

  if (elements.content) {
    window.FlowStateEditor.init(elements.content, { onChange: handleEditorChange });
  }

  bootstrap();

  async function bootstrap() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register(swPath);
      } catch (err) {
        console.warn('SW registration failed', err);
      }
    }

    if (graph) {
      graph.onOpen = slug => navigateTo(slug);
    }

    attachEvents();

    if (isPublic) {
      preparePublicView();
    } else {
      const sessionOk = await ensureSession();
      if (!sessionOk) {
        return;
      }
      window.FlowStateEditor.setReadOnly(false);
      try {
        const pending = await window.FlowStateDB.fetchOutbox();
        state.outbox = Array.isArray(pending) ? pending.length : 0;
        updateOutboxBubble();
      } catch (err) {
        console.warn('Unable to inspect outbox', err);
      }
      if (navigator.onLine) {
        await syncOutbox();
      } else {
        updateSyncStatus('Offline', 'pending');
      }
    }

    await loadGraph();

    if (initialSlug) {
      await loadNoteBySlug(initialSlug, isPublic);
      window.location.hash = '#/n/' + initialSlug;
    } else if (!isPublic) {
      await openFirstNote();
    }
  }

  function attachEvents() {
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (elements.save) {
      elements.save.addEventListener('click', () => saveNote({ source: 'manual' }));
    }
    if (elements.publish) {
      elements.publish.addEventListener('click', togglePublish);
    }
    if (elements.graphToggle) {
      elements.graphToggle.addEventListener('click', toggleGraph);
    }
    document.addEventListener('keydown', handleGlobalKeys);

    if (elements.cmdkInput) {
      elements.cmdkInput.addEventListener('input', debounce(handleSearch, 150));
    }
    if (elements.cmdkResults) {
      elements.cmdkResults.addEventListener('click', event => {
        const li = event.target.closest('li');
        if (!li) {
          return;
        }
        selectCmdkItem(li.dataset.slug, li.dataset.create === '1');
      });
    }
  }

  function preparePublicView() {
    if (elements.save) {
      elements.save.style.display = 'none';
    }
    if (elements.publish) {
      elements.publish.style.display = 'none';
    }
    if (elements.title) {
      elements.title.disabled = true;
    }
    if (elements.tags) {
      elements.tags.disabled = true;
    }
    window.FlowStateEditor.setReadOnly(true);
    if (elements.topActions) {
      elements.topActions.style.display = 'none';
    }
    updateSyncStatus('Public view');
  }

  async function ensureSession() {
    try {
      const session = await window.FlowStateApi.session();
      if (session && session.auth) {
        return true;
      }
      window.location.href = 'login.php';
      return false;
    } catch (err) {
      console.warn('Session check failed', err);
      if (!navigator.onLine) {
        updateSyncStatus('Offline', 'pending');
        showToast('Offline mode. Changes will sync when you reconnect.');
        return true;
      }
      window.location.href = 'login.php';
      return false;
    }
  }

  function handleRoute() {
    const hash = window.location.hash;
    const match = hash.match(/#\/n\/(.+)$/);
    if (match) {
      loadNoteBySlug(decodeURIComponent(match[1]), isPublic);
    }
  }

  async function loadGraph() {
    if (!graph) {
      return;
    }
    try {
      const data = await window.FlowStateApi.graph(isPublic);
      if (data && data.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      state.graphData = data;
      graph.setData(data.nodes || [], data.links || []);
    } catch (err) {
      console.warn('Graph load failed', err);
      showToast('Unable to load graph');
    }
  }

  async function openFirstNote() {
    if (state.graphData && Array.isArray(state.graphData.nodes) && state.graphData.nodes.length) {
      navigateTo(state.graphData.nodes[0].slug);
      return;
    }
    try {
      const data = await window.FlowStateApi.graph(isPublic);
      if (data && data.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      state.graphData = data;
      if (data.nodes && data.nodes.length) {
        navigateTo(data.nodes[0].slug);
      }
    } catch (err) {
      console.warn('Failed to open first note', err);
    }
  }

  function navigateTo(slug) {
    if (!slug) {
      return;
    }
    window.location.hash = '#/n/' + encodeURIComponent(slug);
  }

  async function loadNoteBySlug(slug, publicMode) {
    clearAutosaveTimer();
    state.pendingPayload = null;
    state.saveInFlight = false;
    state.dirty = false;

    try {
      const res = await window.FlowStateApi.getNoteBySlug(slug, publicMode);
      if (res && res.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      if (!res || res.error || !res.note) {
        state.current = null;
        showToast('Note not found');
        return;
      }
      state.current = res.note;
      state.etag = res.etag;
      if (elements.title) {
        elements.title.value = res.note.title || '';
        elements.title.disabled = isPublic;
      }
      if (elements.tags) {
        elements.tags.value = res.note.tags || '';
        elements.tags.disabled = isPublic;
      }
      window.FlowStateEditor.setMarkdown(elements.content, res.note.content || '');
      if (elements.publish) {
        elements.publish.dataset.public = String(res.note.is_public);
        elements.publish.textContent = res.note.is_public ? 'Public' : 'Private';
      }
      resetScrollPositions();
      populateList(elements.related, res.related);
      populateList(elements.backlinks, res.backlinks);
      updateSyncStatus(isPublic ? 'Public view' : 'All changes synced');
      try {
        await window.FlowStateDB.saveNoteLocally(res.note);
      } catch (err) {
        console.warn('Failed to cache note locally', err);
      }
    } catch (err) {
      console.error('Load note failed', err);
      const cached = await window.FlowStateDB.getNoteLocally(slug);
      if (cached) {
        if (elements.title) {
          elements.title.value = cached.title || '';
        }
        if (elements.tags) {
          elements.tags.value = cached.tags || '';
        }
        window.FlowStateEditor.setMarkdown(elements.content, cached.content || '');
        resetScrollPositions();
        showToast('Offline mode: showing cached note');
        updateSyncStatus('Offline', 'pending');
      } else {
        showToast('Unable to load note');
        updateSyncStatus('Load failed', 'error');
      }
    }
  }

  function resetScrollPositions() {
    window.FlowStateEditor.scrollToTop();
  }

  function populateList(container, items) {
    if (!container) {
      return;
    }
    container.innerHTML = '';
    if (!items || items.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Nothing yet';
      container.appendChild(li);
      return;
    }
    for (const item of items) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#/n/' + encodeURIComponent(item.slug);
      link.textContent = item.title;
      li.appendChild(link);
      container.appendChild(li);
    }
  }

  function collectPayload() {
    return {
      title: elements.title ? (elements.title.value.trim() || 'Untitled') : 'Untitled',
      content: window.FlowStateEditor.getMarkdown(),
      tags: elements.tags ? elements.tags.value.trim() : ''
    };
  }

  function handleEditorChange() {
    if (isPublic) {
      return;
    }
    state.dirty = true;
    updateSyncStatus('Unsaved changes…', 'pending');
    scheduleAutosave();
  }

  function scheduleAutosave() {
    if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
    }
    state.autosaveTimer = window.setTimeout(() => {
      state.autosaveTimer = null;
      if (state.current) {
        saveNote({ source: 'autosave' });
      }
    }, 1200);
  }

  function clearAutosaveTimer() {
    if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
      state.autosaveTimer = null;
    }
  }

  async function saveNote(options = {}) {
    if (isPublic) {
      return;
    }

    const payload = options.payload || collectPayload();

    if (!state.current) {
      await createNote(payload, options);
      return;
    }

    if (state.saveInFlight) {
      state.pendingPayload = payload;
      return;
    }

    state.saveInFlight = true;
    updateSyncStatus('Saving…', 'pending');

    try {
      const res = await window.FlowStateApi.updateNote(state.current.id, payload, state.etag);
      if (res && res.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      if (res && res.error === 'version_conflict') {
        showToast('Version conflict. Refresh note.');
        updateSyncStatus('Conflict', 'error');
        state.saveInFlight = false;
        return;
      }
      if (res && res.ok) {
        state.etag = res.etag;
        state.current = { ...state.current, ...payload, version: res.version };
        try {
          await window.FlowStateDB.saveNoteLocally(state.current);
        } catch (err) {
          console.warn('Failed to cache note after save', err);
        }
        updateSyncStatus('Saved', 'success');
        state.dirty = false;
        await loadGraph();
      } else if (res && res.error) {
        showToast(res.error);
        updateSyncStatus('Save failed', 'error');
      }
    } catch (err) {
      console.warn('Save failed, queueing offline', err);
      updateSyncStatus('Queued for sync', 'pending');
      try {
        await window.FlowStateDB.queueMutation({ type: 'update', idValue: state.current.id, payload, etag: state.etag });
        state.outbox += 1;
        updateOutboxBubble();
      } catch (dbErr) {
        console.error('Failed to queue mutation', dbErr);
        updateSyncStatus('Queue failed', 'error');
      }
    } finally {
      state.saveInFlight = false;
    }

    if (state.pendingPayload) {
      const nextPayload = state.pendingPayload;
      state.pendingPayload = null;
      await saveNote({ payload: nextPayload, source: 'autosave' });
    }
  }

  async function createNote(payload, options = {}) {
    if (state.saveInFlight) {
      state.pendingPayload = payload;
      return;
    }
    state.saveInFlight = true;
    updateSyncStatus('Creating…', 'pending');
    try {
      const res = await window.FlowStateApi.createNote(payload);
      if (res && res.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      if (res && res.ok) {
        showToast('Note created');
        await loadGraph();
        navigateTo(res.slug);
      }
    } catch (err) {
      console.warn('Create failed, queueing offline', err);
      try {
        await window.FlowStateDB.queueMutation({ type: 'create', payload });
        showToast('Offline: note queued');
        state.outbox += 1;
        updateOutboxBubble();
        updateSyncStatus('Queued for sync', 'pending');
      } catch (dbErr) {
        console.error('Failed to queue create', dbErr);
        updateSyncStatus('Queue failed', 'error');
      }
    } finally {
      state.saveInFlight = false;
    }
  }

  async function togglePublish() {
    if (isPublic || !state.current) {
      return;
    }
    const next = elements.publish.dataset.public === '1' ? 0 : 1;
    try {
      const res = await window.FlowStateApi.togglePublic(state.current.id, next === 1);
      if (res && res.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      if (res && res.ok) {
        elements.publish.dataset.public = next.toString();
        elements.publish.textContent = next ? 'Public' : 'Private';
        state.current.is_public = next;
        showToast(next ? 'Published' : 'Private');
        await loadGraph();
      }
    } catch (err) {
      console.warn('Toggle publish failed', err);
      showToast('Toggle failed');
    }
  }

  function toggleGraph() {
    if (!elements.graphPanel) {
      return;
    }
    const expanded = elements.graphPanel.classList.toggle('visible');
    if (elements.graphToggle) {
      elements.graphToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (expanded && graph && typeof graph.resize === 'function') {
      graph.resize();
    }
  }

  function handleGlobalKeys(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNote({ source: 'shortcut' });
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCmdk();
    }
    if (event.key === 'Escape') {
      closeCmdk();
    }
  }

  function openCmdk() {
    if (!elements.cmdkDialog || isPublic) {
      return;
    }
    elements.cmdkDialog.showModal();
    if (elements.cmdkInput) {
      elements.cmdkInput.value = '';
      elements.cmdkResults.innerHTML = '';
      elements.cmdkInput.focus();
    }
  }

  function closeCmdk() {
    if (elements.cmdkDialog && elements.cmdkDialog.open) {
      elements.cmdkDialog.close();
    }
  }

  async function handleSearch() {
    if (!elements.cmdkInput || !elements.cmdkResults) {
      return;
    }
    const query = elements.cmdkInput.value.trim();
    elements.cmdkResults.innerHTML = '';
    if (!query) {
      return;
    }
    try {
      const res = await window.FlowStateApi.search(query);
      if (res && res.unauthorized) {
        window.location.href = 'login.php';
        return;
      }
      if (res.results && res.results.length) {
        for (const note of res.results) {
          const li = document.createElement('li');
          li.dataset.slug = note.slug;
          li.textContent = note.title;
          elements.cmdkResults.appendChild(li);
        }
      } else {
        const li = document.createElement('li');
        li.dataset.create = '1';
        li.dataset.slug = query.toLowerCase().replace(/\s+/g, '-');
        li.textContent = `Create "${query}"`;
        elements.cmdkResults.appendChild(li);
      }
    } catch (err) {
      console.error('Search failed', err);
    }
  }

  async function selectCmdkItem(slug, create) {
    closeCmdk();
    if (create) {
      await createNote({ title: slug.replace(/-/g, ' '), content: '', tags: '' });
      return;
    }
    navigateTo(slug);
  }

  function showToast(message) {
    if (!elements.toast) {
      return;
    }
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    setTimeout(() => {
      elements.toast.classList.remove('visible');
    }, 2400);
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function syncOutbox() {
    if (!window.FlowStateDB) {
      return;
    }
    try {
      const result = await window.FlowStateDB.syncOutbox();
      if (result === 'unauthorized') {
        window.location.href = 'login.php';
        return;
      }
      if (result) {
        state.outbox = 0;
        updateOutboxBubble();
        updateSyncStatus('Synced', 'success');
        showToast('Synced offline edits');
        await loadGraph();
      }
    } catch (err) {
      console.warn('Outbox sync failed', err);
      updateSyncStatus('Sync failed', 'error');
    }
  }

  function updateOutboxBubble() {
    if (!elements.syncStatus) {
      return;
    }
    if (state.outbox > 0) {
      updateSyncStatus(`${state.outbox} pending`, 'pending');
    } else if (!isPublic) {
      updateSyncStatus('All changes synced');
    }
  }

  function updateSyncStatus(message, variant) {
    if (!elements.syncStatus) {
      return;
    }
    elements.syncStatus.textContent = message;
    elements.syncStatus.classList.remove('pending', 'error', 'success');
    if (variant) {
      elements.syncStatus.classList.add(variant);
    }
  }

  function handleOnline() {
    showToast('Back online');
    if (!isPublic) {
      updateSyncStatus('Online', 'success');
      syncOutbox();
      loadGraph();
    }
  }

  function handleOffline() {
    showToast('Offline');
    if (!isPublic) {
      updateSyncStatus('Offline', 'pending');
    }
  }
})();
