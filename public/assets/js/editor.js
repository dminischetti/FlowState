(function () {
  function escapeHtml(value) {
    return (value || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c] || c));
  }

  function normalizeMarkdown(value) {
    return (value || '').replace(/\r\n?/g, '\n');
  }

  function renderInline(text) {
    let html = escapeHtml(text || '');

    const codeTokens = [];
    html = html.replace(/`([^`]+)`/g, (_match, code) => {
      const token = `\u0000CODE${codeTokens.length}\u0000`;
      codeTokens.push(`<code>${code}</code>`);
      return token;
    });

    html = html.replace(/\[\[([^\]]+)\]\]/g, (_match, slug) => {
      const s = slug.trim();
      if (!s) {
        return '';
      }
      const href = '#/n/' + encodeURIComponent(s.toLowerCase().replace(/\s+/g, '-'));
      return `<a href="${href}" class="wikilink">${escapeHtml(s)}</a>`;
    });

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    html = html.replace(/\u0000CODE(\d+)\u0000/g, (_match, index) => codeTokens[Number(index)] || '');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function markdownToHtml(markdown) {
    const normalized = normalizeMarkdown(markdown || '');
    if (!normalized.trim()) {
      return '';
    }
    const lines = normalized.split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        i += 1;
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 3);
        const tag = 'h' + level;
        blocks.push({ type: 'heading', level: tag, text: heading[2].trim() });
        i += 1;
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ''));
          i += 1;
        }
        blocks.push({ type: 'ul', items });
        continue;
      }
      const buffer = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6})\s+/.test(lines[i]) && !/^[-*]\s+/.test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'paragraph', text: buffer.join('\n') });
    }

    const html = blocks.map(block => {
      if (block.type === 'heading') {
        return `<${block.level}>${renderInline(block.text)}</${block.level}>`;
      }
      if (block.type === 'ul') {
        const items = block.items.map(item => `<li>${renderInline(item)}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${renderInline(block.text)}</p>`;
    }).join('');

    return html;
  }

  const FlowEditor = {
    renderMarkdown(markdown) {
      return markdownToHtml(markdown);
    }
  };

  window.FlowStateEditor = FlowEditor;

  const state = {
    element: null,
    simplemde: null,
    options: {},
    pendingValue: null,
    readOnly: false,
    silenceChange: false
  };

  function getContainer() {
    if (!state.element) {
      return null;
    }
    if (state.element.classList && state.element.classList.contains('note-editor')) {
      return state.element;
    }
    return state.element.closest('.note-editor');
  }

  function applyAriaLabel() {
    if (!state.simplemde || !state.element) {
      return;
    }
    const label = state.element.getAttribute('aria-label');
    if (label) {
      state.simplemde.codemirror.getInputField().setAttribute('aria-label', label);
    }
  }

  function applyReadOnly() {
    if (!state.simplemde) {
      return;
    }
    const cm = state.simplemde.codemirror;
    cm.setOption('readOnly', state.readOnly ? 'nocursor' : false);
    const container = getContainer();
    if (container) {
      container.classList.toggle('is-readonly', state.readOnly);
      const toolbar = container.querySelector('.editor-toolbar');
      if (toolbar) {
        toolbar.classList.toggle('is-disabled', state.readOnly);
        const controls = toolbar.querySelectorAll('a, button');
        controls.forEach(control => {
          control.setAttribute('aria-disabled', state.readOnly ? 'true' : 'false');
          control.tabIndex = state.readOnly ? -1 : 0;
          control.setAttribute('tabindex', state.readOnly ? '-1' : '0');
          control.classList.toggle('is-disabled', state.readOnly);
        });
      }
    }
  }

  function init(element, options = {}) {
    if (!element || typeof SimpleMDE !== 'function') {
      return null;
    }
    state.element = element;
    state.options = options;
    const placeholder = element.getAttribute('placeholder') || element.getAttribute('data-placeholder') || '';
    state.simplemde = new SimpleMDE({
      element: element,
      spellChecker: false,
      status: false,
      autosave: false,
      placeholder,
      toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "preview"],
      renderingConfig: { singleLineBreaks: false, codeSyntaxHighlighting: true },
      previewRender(plainText) {
        return window.FlowStateEditor.renderMarkdown(plainText);
      }
    });

    const cm = state.simplemde.codemirror;
    cm.on('change', () => {
      if (state.silenceChange) {
        return;
      }
      if (typeof state.options.onChange === 'function') {
        state.options.onChange(state.simplemde.value());
      }
    });

    applyAriaLabel();
    applyReadOnly();

    if (state.pendingValue !== null && state.pendingValue !== undefined) {
      setMarkdown(element, state.pendingValue);
      state.pendingValue = null;
    }

    setTimeout(() => {
      if (state.simplemde) {
        state.simplemde.codemirror.refresh();
      }
    }, 0);

    return state.simplemde;
  }

  function setMarkdown(element, markdown) {
    if (element && !state.element) {
      state.element = element;
    }
    const value = normalizeMarkdown(markdown || '');
    if (!state.simplemde) {
      state.pendingValue = value;
      if (element) {
        element.value = value;
      }
      return;
    }
    const cm = state.simplemde.codemirror;
    const hasFocus = cm.hasFocus();
    const cursor = cm.getCursor();
    state.silenceChange = true;
    state.simplemde.value(value);
    state.silenceChange = false;
    if (hasFocus) {
      cm.focus();
      cm.setCursor(cursor);
    }
  }

  function getMarkdown() {
    if (state.simplemde) {
      return normalizeMarkdown(state.simplemde.value() || '').trimEnd();
    }
    return normalizeMarkdown(state.pendingValue || '').trimEnd();
  }

  function setReadOnly(value) {
    state.readOnly = !!value;
    applyReadOnly();
  }

  function scrollToTop() {
    if (!state.simplemde) {
      return;
    }
    const cm = state.simplemde.codemirror;
    cm.scrollTo(null, 0);
    cm.setCursor({ line: 0, ch: 0 });
  }

  function focus() {
    if (!state.simplemde) {
      return;
    }
    state.simplemde.codemirror.focus();
  }

  FlowEditor.init = init;
  FlowEditor.setMarkdown = setMarkdown;
  FlowEditor.getMarkdown = getMarkdown;
  FlowEditor.setReadOnly = setReadOnly;
  FlowEditor.scrollToTop = scrollToTop;
  FlowEditor.focus = focus;
}());
