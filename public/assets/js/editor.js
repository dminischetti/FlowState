(function () {
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c] || c));
  }

  function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\[\[([^\]]+)\]\]/g, (_match, slug) => {
      const s = slug.trim();
      const href = '#/n/' + encodeURIComponent(s.toLowerCase().replace(/\s+/g, '-'));
      return `<a href="${href}" class="wikilink">${escapeHtml(s)}</a>`;
    });
    html = html.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s?(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s?(.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\n\n+/g, '</p><p>');
    html = '<p>' + html + '</p>';
    return html;
  }

  window.FlowStateEditor = {
    renderMarkdown
  };
}());
