(function () {
  const DEBOUNCE_DELAY = 150;

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, c => ({
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

  function normalizeWhitespace(value) {
    return value.replace(/\u00a0/g, ' ');
  }

  function renderInline(text) {
    let html = escapeHtml(text);

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
    const normalized = normalizeMarkdown(markdown);
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

  function serializeInline(node) {
    let output = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        output += normalizeWhitespace(child.nodeValue || '');
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        output += '\n';
        return;
      }
      if (tag === 'em') {
        output += '*' + serializeInline(child) + '*';
        return;
      }
      if (tag === 'strong') {
        output += '**' + serializeInline(child) + '**';
        return;
      }
      if (tag === 'code') {
        const inner = normalizeWhitespace(child.textContent || '').replace(/`/g, '\\`');
        output += '`' + inner + '`';
        return;
      }
      if (tag === 'a' && child.classList.contains('wikilink')) {
        const label = serializeInline(child).trim();
        if (label) {
          output += `[[${label}]]`;
        }
        return;
      }
      output += serializeInline(child);
    });
    return output;
  }

  function serializeBlock(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeWhitespace(node.nodeValue || '');
      if (text.trim() === '') {
        return null;
      }
      return text.trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'h1') {
      return '# ' + serializeInline(node).trim();
    }
    if (tag === 'h2') {
      return '## ' + serializeInline(node).trim();
    }
    if (tag === 'h3') {
      return '### ' + serializeInline(node).trim();
    }
    if (tag === 'ul') {
      const items = [];
      node.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
          const itemContent = serializeInline(child).trim();
          if (itemContent) {
            items.push('- ' + itemContent);
          }
        }
      });
      return items.join('\n');
    }
    if (tag === 'p' || tag === 'div') {
      const text = serializeInline(node).trim();
      return text;
    }
    return serializeInline(node).trim();
  }

  function serializeMarkdown(root) {
    if (!root) {
      return '';
    }
    const blocks = [];
    root.childNodes.forEach(node => {
      const block = serializeBlock(node);
      if (block === null || block === undefined) {
        return;
      }
      if (block === '') {
        return;
      }
      blocks.push(block);
    });
    return blocks.join('\n\n');
  }

  function captureSelectionOffsets(root) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      return null;
    }
    const preStart = range.cloneRange();
    preStart.selectNodeContents(root);
    preStart.setEnd(range.startContainer, range.startOffset);
    const start = preStart.toString().length;

    const preEnd = range.cloneRange();
    preEnd.selectNodeContents(root);
    preEnd.setEnd(range.endContainer, range.endOffset);
    const end = preEnd.toString().length;

    return { start, end };
  }

  function findNodeForOffset(root, offset) {
    let remaining = offset;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const length = node.nodeValue ? node.nodeValue.length : 0;
      if (remaining <= length) {
        return { node, offset: remaining };
      }
      remaining -= length;
      node = walker.nextNode();
    }
    return { node: root, offset: root.childNodes.length };
  }

  function restoreSelection(root, selectionOffsets) {
    if (!selectionOffsets) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const maxTextLength = (root.textContent || '').length;
    const startOffset = Math.min(selectionOffsets.start, maxTextLength);
    const endOffset = Math.min(selectionOffsets.end, maxTextLength);
    const startTarget = findNodeForOffset(root, startOffset);
    const endTarget = findNodeForOffset(root, endOffset);
    const range = document.createRange();
    range.setStart(startTarget.node, startTarget.offset);
    range.setEnd(endTarget.node, endTarget.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function updateEmptyState(element, markdown) {
    const isEmpty = markdown.trim() === '';
    element.classList.toggle('is-empty', isEmpty);
  }

  function applyRender(element, force) {
    const state = element.__flowEditorState;
    if (!state) {
      return;
    }
    if (state.suspended) {
      return;
    }
    if (state.isRendering) {
      return;
    }
    const selectionOffsets = captureSelectionOffsets(element);
    const markdown = serializeMarkdown(element);
    if (!force && markdown === state.lastMarkdown) {
      updateEmptyState(element, markdown);
      return;
    }
    state.isRendering = true;
    const html = markdownToHtml(markdown);
    if (element.innerHTML !== html) {
      element.innerHTML = html;
    }
    updateEmptyState(element, markdown);
    state.lastMarkdown = markdown;
    state.isRendering = false;
    restoreSelection(element, selectionOffsets);
    if (state.options && typeof state.options.onChange === 'function') {
      if (force || markdown !== state.lastNotified) {
        state.lastNotified = markdown;
        state.options.onChange(markdown);
      }
    }
  }

  function scheduleRender(element) {
    const state = element.__flowEditorState;
    if (!state) {
      return;
    }
    clearTimeout(state.timer);
    state.timer = window.setTimeout(() => applyRender(element, false), DEBOUNCE_DELAY);
  }

  function handlePaste(event) {
    const element = event.currentTarget;
    if (!element || element.getAttribute('contenteditable') === 'false') {
      return;
    }
    event.preventDefault();
    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    if (!text) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    selection.deleteFromDocument();
    const range = selection.getRangeAt(0);
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    scheduleRender(element);
  }

  function init(element, options = {}) {
    if (!element) {
      return null;
    }
    const state = {
      options,
      timer: null,
      isRendering: false,
      suspended: false,
      lastMarkdown: '',
      lastNotified: ''
    };
    element.__flowEditorState = state;
    element.addEventListener('input', () => scheduleRender(element));
    element.addEventListener('paste', handlePaste);
    element.addEventListener('blur', () => applyRender(element, true));
    applyRender(element, true);
    return {
      renderNow: () => applyRender(element, true)
    };
  }

  function setMarkdown(element, markdown) {
    if (!element) {
      return;
    }
    const state = element.__flowEditorState;
    const value = normalizeMarkdown(markdown || '');
    if (state) {
      state.suspended = true;
    }
    const html = markdownToHtml(value);
    element.innerHTML = html;
    updateEmptyState(element, value);
    if (state) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      state.lastMarkdown = value;
      state.lastNotified = value;
      state.suspended = false;
    }
  }

  function getMarkdown(element) {
    if (!element) {
      return '';
    }
    const markdown = serializeMarkdown(element);
    return normalizeMarkdown(markdown).trimEnd();
  }

  window.FlowStateEditor = {
    init,
    setMarkdown,
    getMarkdown
  };
}());
