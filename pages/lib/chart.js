const PriceChart = {
  draw(canvas, history, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const padding = options.padding || { top: 30, right: 24, bottom: 36, left: 60 };
    const plotW = W - padding.left - padding.right;
    const plotH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!history || history.length < 2) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无足够的历史价格数据', W / 2, H / 2);
      return;
    }

    const data = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const prices = data.map(d => d.price);
    const times = data.map(d => d.timestamp);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const padP = (maxP - minP) * 0.12 || maxP * 0.05;
    const yMin = Math.max(0, minP - padP);
    const yMax = maxP + padP;
    const xMin = times[0];
    const xMax = times[times.length - 1];

    const xOf = (t) => padding.left + (xMax === xMin ? plotW / 2 : ((t - xMin) / (xMax - xMin)) * plotW);
    const yOf = (p) => padding.top + (1 - (p - yMin) / (yMax - yMin)) * plotH;

    this._drawGrid(ctx, W, H, padding, xMin, xMax, yMin, yMax, xOf, yOf, data);

    this._drawArea(ctx, data, xOf, yOf, plotH, padding);
    this._drawLine(ctx, data, xOf, yOf);

    const minIdx = prices.indexOf(minP);
    const spikeThreshold = options.spikeThreshold || 0.15;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = xOf(d.timestamp), y = yOf(d.price);
      if (i === minIdx) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16,185,129,.18)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#065f46';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = x > W / 2 ? 'right' : 'left';
        ctx.fillText(`历史最低 ¥${minP}`, x + (x > W / 2 ? -8 : 10), y - 10);
      } else if (i > 0) {
        const prev = prices[i - 1];
        const delta = (d.price - prev) / prev;
        if (delta >= spikeThreshold) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239,68,68,.15)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
        }
      }
    }

    const days7Cutoff = xMax - 7 * 86400000;
    const last7 = data.filter(d => d.timestamp >= days7Cutoff);
    if (last7.length >= 2) {
      const startP = last7[0].price;
      const endP = last7[last7.length - 1].price;
      const trendColor = endP < startP ? 'rgba(16,185,129,.85)' :
                        endP > startP ? 'rgba(239,68,68,.85)' : 'rgba(100,116,139,.8)';
      ctx.save();
      ctx.strokeStyle = trendColor;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      last7.forEach((d, i) => {
        const x = xOf(d.timestamp), y = yOf(d.price);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    const first = data[0], last = data[data.length - 1];
    const startX = xOf(first.timestamp), endX = xOf(last.timestamp);
    if (options.targetPrice && options.targetPrice > yMin && options.targetPrice < yMax) {
      const yT = yOf(options.targetPrice);
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yT);
      ctx.lineTo(W - padding.right, yT);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10.5px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`目标价 ¥${options.targetPrice}`, padding.left + 4, yT - 5);
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'start';
    ctx.beginPath();
    ctx.arc(startX, yOf(first.price), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(endX, yOf(last.price), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0d9488';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#0d9488';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`¥${last.price}`, W - padding.right - 2, yOf(last.price) - 10);

    canvas._tooltip = { xOf, yOf, data, W, H, padding };
  },

  _drawGrid(ctx, W, H, padding, xMin, xMax, yMin, yMax, xOf, yOf, data) {
    const ySteps = 5;
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.font = '10.5px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    for (let i = 0; i <= ySteps; i++) {
      const ratio = i / ySteps;
      const y = padding.top + ratio * (H - padding.top - padding.bottom);
      const p = yMax - ratio * (yMax - yMin);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();
      ctx.fillText('¥' + p.toFixed(p < 100 ? 1 : 0), padding.left - 8, y + 3);
    }

    const xTicks = 6;
    ctx.textAlign = 'center';
    for (let i = 0; i <= xTicks; i++) {
      const ratio = i / xTicks;
      const t = xMin + ratio * (xMax - xMin);
      const x = xOf(t);
      const d = new Date(t);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, H - padding.bottom);
      ctx.strokeStyle = '#f8fafc';
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(label, x, H - padding.bottom + 18);
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding.left, H - padding.bottom);
    ctx.lineTo(W - padding.right, H - padding.bottom);
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, H - padding.bottom);
    ctx.stroke();
  },

  _drawArea(ctx, data, xOf, yOf, plotH, padding) {
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
    grad.addColorStop(0, 'rgba(13,148,136,.25)');
    grad.addColorStop(0.5, 'rgba(8,145,178,.10)');
    grad.addColorStop(1, 'rgba(8,145,178,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = xOf(d.timestamp), y = yOf(d.price);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(data[data.length - 1].timestamp), padding.top + plotH);
    ctx.lineTo(xOf(data[0].timestamp), padding.top + plotH);
    ctx.closePath();
    ctx.fill();
  },

  _drawLine(ctx, data, xOf, yOf) {
    const grad = ctx.createLinearGradient(0, 0, 800, 0);
    grad.addColorStop(0, '#0d9488');
    grad.addColorStop(1, '#0891b2');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = xOf(d.timestamp), y = yOf(d.price);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  },

  attachHover(canvas, onHover) {
    canvas.addEventListener('mousemove', (e) => {
      const tip = canvas._tooltip;
      if (!tip) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < tip.padding.left || mx > tip.W - tip.padding.right) {
        onHover && onHover(null);
        return;
      }
      let nearest = 0, nearestDist = Infinity;
      tip.data.forEach((d, i) => {
        const dx = Math.abs(tip.xOf(d.timestamp) - mx);
        if (dx < nearestDist) { nearestDist = dx; nearest = i; }
      });
      if (nearestDist < 40) {
        onHover && onHover({
          index: nearest,
          data: tip.data[nearest],
          x: tip.xOf(tip.data[nearest].timestamp),
          y: tip.yOf(tip.data[nearest].price),
          rect
        });
      } else onHover && onHover(null);
    });
    canvas.addEventListener('mouseleave', () => onHover && onHover(null));
  },

  attachGroupHover(canvas, config, onHover) {
    const { products, histories, colors, x, y, pad, plotW, plotH, minPrice, maxPrice, W, H } = config;
    const dpr = window.devicePixelRatio || 1;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx < pad.l || mx > W - pad.r || my < pad.t || my > H - pad.b) {
        onHover && onHover(null);
        return;
      }
      let best = null, bestDist = Infinity;
      products.forEach((p, pIdx) => {
        const hist = [...(histories[p.id] || [])].sort((a, b) => a.timestamp - b.timestamp);
        hist.forEach((h) => {
          const px = x(h.timestamp), py = y(h.price);
          const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
          if (dist < bestDist) { bestDist = dist; best = { product: p, data: h, color: colors[pIdx % colors.length], x: px, y: py, rect }; }
        });
      });
      if (best && bestDist < 28) onHover && onHover(best);
      else onHover && onHover(null);
    });
    canvas.addEventListener('mouseleave', () => onHover && onHover(null));
  }
};
