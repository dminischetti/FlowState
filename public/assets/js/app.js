(function () {
  const isPublic = document.body.dataset.public === '1';
  const initialSlug = document.body.dataset.slug || null;
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
  const graph = new window.FlowStateGraph(document.getElementById('graph-canvas'));
  const state = {
    current: null,
    etag: null,
    outbox: 0
  };

  if (elements.content) {
    window.FlowStateEditor.init(elements.content);
  }

  function resetScrollPositions() {
    window.FlowStateEditor.scrollToTop();
  }

  async function bootstrap() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (err) {
        console.warn('SW registration failed', err);
      }
    }

    if (isPublic) {
      elements.save.style.display = 'none';
      elements.publish.style.display = 'none';
      elements.title.disabled = true;
      elements.tags.disabled = true;
      window.FlowStateEditor.setReadOnly(true);
      if (elements.topActions) {
        elements.topActions.style.display = 'none';
      }
      elements.syncStatus.textContent = 'Public view';
    } else {
      window.FlowStateEditor.setReadOnly(false);
      const session = await window.FlowStateApi.session();
      if (!session.auth) {
        window.location.href = 'login.php';
        return;
      }
    }

    attachEvents();
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
    elements.save.addEventListener('click', saveNote);
    elements.publish.addEventListener('click', togglePublish);
    elements.graphToggle.addEventListener('click', toggleGraph);
    document.addEventListener('keydown', handleGlobalKeys);
    window.addEventListener('online', syncOutbox);
    graph.onOpen = slug => navigateTo(slug);

    elements.cmdkInput.addEventListener('input', debounce(handleSearch, 150));
    elements.cmdkResults.addEventListener('click', event => {
      const li = event.target.closest('li');
      if (!li) {
        return;
      }
      selectCmdkItem(li.dataset.slug, li.dataset.create === '1');
    });

  }

  function handleRoute() {
    const hash = window.location.hash;
    const match = hash.match(/#\/n\/(.+)$/);
    if (match) {
      loadNoteBySlug(decodeURIComponent(match[1]), isPublic);
    }
  }

  async function loadGraph() {
    try {
      const data = await window.FlowStateApi.graph(isPublic);
      graph.setData(data.nodes || [], data.links || []);
    } catch (err) {
      console.warn('Graph load failed', err);
    }
  }

  async function openFirstNote() {
    const data = await window.FlowStateApi.graph(isPublic);
    if (data.nodes && data.nodes.length) {
      navigateTo(data.nodes[0].slug);
    }
  }

  function navigateTo(slug) {
    window.location.hash = '#/n/' + encodeURIComponent(slug);
  }

  async function loadNoteBySlug(slug, publicMode) {
    try {
      const res = await window.FlowStateApi.getNoteBySlug(slug, publicMode);
      if (res.error) {
        showToast('Note not found');
        return;
      }
      state.current = res.note;
      state.etag = res.etag;
      elements.title.value = res.note.title;
      elements.tags.value = res.note.tags || '';
      window.FlowStateEditor.setMarkdown(elements.content, res.note.content || '');
      elements.publish.dataset.public = res.note.is_public;
      elements.publish.textContent = res.note.is_public ? 'Public' : 'Private';
      resetScrollPositions();
      populateList(elements.related, res.related);
      populateList(elements.backlinks, res.backlinks);
      window.FlowStateDB.saveNoteLocally(res.note);
    } catch (err) {
      console.error(err);
      const cached = await window.FlowStateDB.getNoteLocally(slug);
      if (cached) {
        elements.title.value = cached.title;
        elements.tags.value = cached.tags || '';
        window.FlowStateEditor.setMarkdown(elements.content, cached.content || '');
        resetScrollPositions();
        showToast('Offline mode: showing cached note');
      } else {
        showToast('Unable to load note');
      }
    }
  }

  function populateList(container, items) {
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

  async function saveNote() {
    if (isPublic) {
      return;
    }
    const payload = {
      title: elements.title.value.trim() || 'Untitled',
      content: window.FlowStateEditor.getMarkdown(elements.content),
      tags: elements.tags.value.trim()
    };

    if (!state.current) {
      await createNote(payload);
      return;
    }

    try {
      elements.syncStatus.textContent = 'Saving…';
      const res = await window.FlowStateApi.updateNote(state.current.id, payload, state.etag);
      if (res && res.error === 'version_conflict') {
        showToast('Version conflict. Refresh note.');
        elements.syncStatus.textContent = 'Conflict';
        return;
      }
      if (res && res.ok) {
        state.etag = res.etag;
        elements.syncStatus.textContent = 'Saved';
        state.current = { ...state.current, ...payload, version: res.version };
        window.FlowStateDB.saveNoteLocally(state.current);
        await loadGraph();
      } else if (res && res.error) {
        showToast(res.error);
      }
    } catch (err) {
      console.warn('Save failed, queueing offline', err);
      elements.syncStatus.textContent = 'Queued for sync';
      await window.FlowStateDB.queueMutation({ type: 'update', idValue: state.current.id, payload, etag: state.etag });
      state.outbox += 1;
      updateOutboxBubble();
    }
  }

  async function createNote(payload) {
    try {
      const res = await window.FlowStateApi.createNote(payload);
      if (res && res.id) {
        showToast('Note created');
        await loadGraph();
        navigateTo(res.slug);
      }
    } catch (err) {
      await window.FlowStateDB.queueMutation({ type: 'create', payload });
      showToast('Offline: note queued');
      state.outbox += 1;
      updateOutboxBubble();
    }
  }

  async function togglePublish() {
    if (isPublic || !state.current) {
      return;
    }
    const next = elements.publish.dataset.public === '1' ? 0 : 1;
    try {
      const res = await window.FlowStateApi.togglePublic(state.current.id, next === 1);
      if (res && res.ok) {
        elements.publish.dataset.public = next.toString();
        elements.publish.textContent = next ? 'Public' : 'Private';
        showToast(next ? 'Published' : 'Private');
      }
    } catch (err) {
      showToast('Toggle failed');
    }
  }

  function toggleGraph() {
    const expanded = elements.graphPanel.classList.toggle('visible');
    elements.graphToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function handleGlobalKeys(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveNote();
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
    elements.cmdkDialog.showModal();
    elements.cmdkInput.value = '';
    elements.cmdkResults.innerHTML = '';
    elements.cmdkInput.focus();
  }

  function closeCmdk() {
    if (elements.cmdkDialog.open) {
      elements.cmdkDialog.close();
    }
  }

  async function handleSearch() {
    const query = elements.cmdkInput.value.trim();
    elements.cmdkResults.innerHTML = '';
    if (!query) {
      return;
    }
    try {
      const res = await window.FlowStateApi.search(query);
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
      console.error(err);
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
    const success = await window.FlowStateDB.syncOutbox();
    if (success) {
      state.outbox = 0;
      updateOutboxBubble();
      showToast('Synced offline edits');
      elements.syncStatus.textContent = 'Synced';
      await loadGraph();
    }
  }

  function updateOutboxBubble() {
    if (!elements.syncStatus) {
      return;
    }
    if (state.outbox > 0) {
      elements.syncStatus.textContent = `${state.outbox} pending`; 
      elements.syncStatus.classList.add('pending');
    } else {
      elements.syncStatus.textContent = 'All changes synced';
      elements.syncStatus.classList.remove('pending');
    }
  }

  bootstrap();
}());
