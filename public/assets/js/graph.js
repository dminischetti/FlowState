(function () {
  class FlowStateGraph {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.nodes = [];
      this.links = [];
      this.animationFrame = null;
      this.hoverNode = null;
      this.onOpen = () => {};
      canvas.addEventListener('mousemove', this.handleMove.bind(this));
      canvas.addEventListener('click', this.handleClick.bind(this));
    }

    setData(nodes, links) {
      this.nodes = nodes.map((node, idx) => ({
        id: node.id,
        slug: node.slug,
        title: node.title,
        tags: node.tags,
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: 0,
        vy: 0,
        color: this.colorFor(node.tags, idx)
      }));
      this.links = links.map(link => ({
        source: this.nodes.find(n => n.id === link.src_id),
        target: this.nodes.find(n => n.id === link.dst_id),
        score: link.score
      })).filter(l => l.source && l.target);
      this.tick();
    }

    colorFor(tags, idx) {
      const palette = ['var(--accent)', 'var(--accent-2)', 'oklch(70% 0.08 190)', 'oklch(65% 0.09 130)'];
      if (!tags) {
        return palette[idx % palette.length];
      }
      const hash = tags.split(',')[0] || '';
      let sum = 0;
      for (let i = 0; i < hash.length; i++) {
        sum += hash.charCodeAt(i);
      }
      return palette[sum % palette.length];
    }

    tick() {
      this.updatePhysics();
      this.draw();
      this.animationFrame = requestAnimationFrame(() => this.tick());
    }

    updatePhysics() {
      const width = this.canvas.width;
      const height = this.canvas.height;
      const repulsion = 5000;
      const spring = 0.05;

      for (const node of this.nodes) {
        node.vx *= 0.9;
        node.vy *= 0.9;
      }

      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i];
          const b = this.nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 0.01;
          const force = repulsion / distSq;
          const angle = Math.atan2(dy, dx);
          a.vx += Math.cos(angle) * force;
          a.vy += Math.sin(angle) * force;
          b.vx -= Math.cos(angle) * force;
          b.vy -= Math.sin(angle) * force;
        }
      }

      for (const link of this.links) {
        const { source, target } = link;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        source.vx += dx * spring;
        source.vy += dy * spring;
        target.vx -= dx * spring;
        target.vy -= dy * spring;
      }

      for (const node of this.nodes) {
        node.x += node.vx * 0.01;
        node.y += node.vy * 0.01;
        node.x = Math.max(40, Math.min(width - 40, node.x));
        node.y = Math.max(40, Math.min(height - 40, node.y));
      }
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(120, 120, 180, 0.4)';
      for (const link of this.links) {
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
      }

      for (const node of this.nodes) {
        ctx.fillStyle = node.color;
        ctx.strokeStyle = 'var(--border)';
        const width = 140;
        const height = 40;
        const x = node.x - width / 2;
        const y = node.y - height / 2;
        this.roundRect(ctx, x, y, width, height, 20);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'var(--text)';
        ctx.font = '14px "Nunito", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.title.slice(0, 24), node.x - width / 2 + 12, node.y);
      }

      if (this.hoverNode) {
        ctx.strokeStyle = 'var(--accent)';
        ctx.lineWidth = 2;
        const width = 140;
        const height = 40;
        const x = this.hoverNode.x - width / 2;
        const y = this.hoverNode.y - height / 2;
        this.roundRect(ctx, x, y, width, height, 20);
        ctx.stroke();
      }
    }

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    handleMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.hoverNode = this.nodes.find(node => Math.abs(node.x - x) < 70 && Math.abs(node.y - y) < 20) || null;
      this.canvas.style.cursor = this.hoverNode ? 'pointer' : 'default';
    }

    handleClick() {
      if (this.hoverNode) {
        this.onOpen(this.hoverNode.slug);
      }
    }
  }

  window.FlowStateGraph = FlowStateGraph;
}());
