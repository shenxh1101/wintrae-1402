const state = {
  groupName: '',
  products: [],
  histories: {},
  bestProduct: null,
  avgPrice: 0,
  sortBy: 'currentPrice',
  preferredProductId: null,
  excludedProducts: [],
  recommendedProduct: null,
  recommendReasons: []
};

const LINE_COLORS = ['#0d9488', '#0891b2', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#6366f1'];

function parseParams() {
  const p = new URLSearchParams(location.search);
  state.groupName = p.get('name') || '';
  return state.groupName;
}

function sortProducts(products, sortBy) {
  const sorted = [...products];
  switch (sortBy) {
    case 'currentPrice':
      sorted.sort((a, b) => Number(a.currentPrice) - Number(b.currentPrice));
      break;
    case 'lowestPrice':
      sorted.sort((a, b) => Number(a.lowestPrice || a.currentPrice) - Number(b.lowestPrice || b.currentPrice));
      break;
    case 'target':
      sorted.sort((a, b) => {
        const aHit = a.targetPrice && a.currentPrice <= a.targetPrice ? 0 : 1;
        const bHit = b.targetPrice && b.currentPrice <= b.targetPrice ? 0 : 1;
        if (aHit !== bHit) return aHit - bHit;
        return Number(a.currentPrice) - Number(b.currentPrice);
      });
      break;
    case 'platform':
      sorted.sort((a, b) => {
        const pa = (PLATFORM_MAP[a.platform] || {}).label || a.platform;
        const pb = (PLATFORM_MAP[b.platform] || {}).label || b.platform;
        return pa.localeCompare(pb, 'zh-CN');
      });
      break;
    case 'shop':
      sorted.sort((a, b) => (a.shop || '').localeCompare(b.shop || '', 'zh-CN'));
      break;
  }
  return sorted;
}

function generateRecommendation() {
  const candidates = state.products.filter(p => !state.excludedProducts.includes(p.id));
  if (!candidates.length) {
    state.recommendedProduct = null;
    state.recommendReasons = [];
    return;
  }

  let best = null;
  let bestScore = -Infinity;
  const reasons = [];

  for (const p of candidates) {
    let score = 0;
    const productReasons = [];

    if (p.id === state.preferredProductId) {
      score += 50;
      productReasons.push('⭐ 已设为首选购买入口');
    }

    const isLowest = p.id === state.bestProduct?.id;
    if (isLowest) {
      score += 40;
      productReasons.push('💰 当前最低价');
    }

    const lowestEver = Number(p.lowestPrice || p.currentPrice);
    const current = Number(p.currentPrice);
    if (current <= lowestEver) {
      score += 30;
      productReasons.push('📉 历史最低价，入手好时机');
    } else {
      const dropFromHigh = p.highestPrice ? ((Number(p.highestPrice) - current) / Number(p.highestPrice)) * 100 : 0;
      if (dropFromHigh > 10) {
        score += 20;
        productReasons.push(`📉 较历史高点便宜 ${dropFromHigh.toFixed(1)}%`);
      }
    }

    if (p.targetPrice && current <= Number(p.targetPrice)) {
      score += 35;
      productReasons.push('🎯 已达到目标价，可出手');
    } else if (p.targetPrice) {
      const gapToTarget = ((Number(p.targetPrice) - current) / current) * 100;
      if (gapToTarget < 5) {
        score += 15;
        productReasons.push(`🎯 距目标价还差 ${gapToTarget.toFixed(1)}%，接近入手点`);
      } else if (gapToTarget < 10) {
        score += 8;
        productReasons.push(`🎯 距目标价还差 ${gapToTarget.toFixed(1)}%，可以观望`);
      }
    }

    if (!p.lowestPrice || current === Number(p.lowestPrice)) {
      score += 15;
      productReasons.push('✨ 价格处于历史低位');
    }

    const hist = state.histories[p.id] || [];
    if (hist.length >= 10) {
      const recent = hist.slice(-10);
      const avgRecent = recent.reduce((s, h) => s + h.price, 0) / recent.length;
      if (current < avgRecent * 0.95) {
        score += 10;
        productReasons.push('📊 近期走势向下，价格处于低位');
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = p;
      reasons.length = 0;
      reasons.push(...productReasons);
    }
  }

  state.recommendedProduct = best;
  state.recommendReasons = reasons;
}

async function loadData() {
  const name = parseParams();
  if (!name) {
    $('#groupTitle').textContent = '未选择比价组';
    $('#groupSubtitle').textContent = '请从收藏页选择一个比价组进入';
    return;
  }
  $('#groupTitle').textContent = `🏷️ ${name}`;
  const [r, prefsR] = await Promise.all([
    sendMsg('GET_PRODUCTS'),
    sendMsg('GET_GROUP_PREFS')
  ]);
  const all = r.ok ? r.data || [] : [];
  state.products = all.filter(p => p.compareGroup === name);
  const prefs = prefsR.ok ? (prefsR.data || {}) : {};
  const groupPref = prefs[name] || {};
  state.sortBy = groupPref.sortBy || 'currentPrice';
  state.preferredProductId = groupPref.preferredProductId || null;
  state.excludedProducts = groupPref.excludedProducts || [];
  state.products = sortProducts(state.products, state.sortBy);
  if (!state.products.length) {
    $('#groupSubtitle').textContent = '这个比价组暂无商品';
    renderEmpty();
    return;
  }
  for (const p of state.products) {
    const hr = await sendMsg('GET_HISTORY', { productId: p.id });
    state.histories[p.id] = hr.ok ? (hr.data || []) : [];
  }
  state.bestProduct = state.products.filter(p => !state.excludedProducts.includes(p.id))[0] || state.products[0];
  state.avgPrice = state.products.reduce((s, p) => s + Number(p.currentPrice), 0) / state.products.length;
  generateRecommendation();
  const platSet = new Set(state.products.map(p => p.platform));
  const visibleCount = state.products.filter(p => !state.excludedProducts.includes(p.id)).length;
  $('#groupSubtitle').textContent = `共 ${state.products.length} 件 · ${visibleCount} 件有效 · ${platSet.size} 个平台 · 最低价 ¥${Number(state.bestProduct.currentPrice).toFixed(2)}`;
  renderSortControls();
  renderStats();
  renderRecommendation();
  renderCompareCards();
  renderTable();
  renderLegend();
  renderGroupChart();
  loadAndRenderCheckInfo();
}

function renderEmpty() {
  $('#compareSummary').innerHTML = '';
  $('#chartArea').style.display = 'none';
  $('#detailTable').innerHTML = '';
  $('#recommendArea').innerHTML = '';
}

function renderRecommendation() {
  const container = $('#recommendArea');
  if (!container) return;

  const candidates = state.products.filter(p => !state.excludedProducts.includes(p.id));
  if (!candidates.length) {
    container.innerHTML = `
      <div style="background:linear-gradient(135deg,#fef3c7,#fffbeb);border:1px solid #fcd34d;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;margin-bottom:6px;">⚠️</div>
        <div style="font-size:13px;color:#92400e;font-weight:600;">所有商品均被排除，无法生成购买建议</div>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="resetExclusions()">恢复所有商品</button>
      </div>
    `;
    window.resetExclusions = async () => {
      for (const pid of state.excludedProducts) {
        await sendMsg('TOGGLE_EXCLUDED_PRODUCT', { groupName: state.groupName, productId: pid });
      }
      state.excludedProducts = [];
      loadData();
    };
    return;
  }

  if (!state.recommendedProduct) {
    container.innerHTML = '';
    return;
  }

  const p = state.recommendedProduct;
  const plat = PLATFORM_MAP[p.platform] || {};
  const platLabel = plat.label || p.platform;
  const reasonsHtml = state.recommendReasons.map(r => `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#f0fdfa;color:#0d9488;border-radius:20px;font-size:11.5px;font-weight:600;margin-right:6px;margin-bottom:4px;">${r}</span>`).join('');

  const excludedCount = state.excludedProducts.length;

  container.innerHTML = `
    <div style="background:linear-gradient(135deg,#ecfdf5,#f0f9ff);border:1px solid #a7f3d0;border-radius:16px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#10b981,#0891b2);display:flex;align-items:center;justify-content:center;font-size:22px;color:white;">
              ✨
            </div>
            <div>
              <div style="font-size:12px;color:#0d9488;font-weight:600;">智能购买建议</div>
              <div style="font-size:16px;font-weight:800;color:#0f172a;">推荐购买 ${platLabel}平台</div>
            </div>
          </div>
          <div style="font-size:13px;color:#0f172a;font-weight:600;margin-bottom:10px;">${escapeHtml(p.name)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${reasonsHtml}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#0d9488,#0891b2);-webkit-background-clip:text;background-clip:text;color:transparent;">¥${Number(p.currentPrice).toFixed(2)}</div>
            ${p.targetPrice ? `<div style="align-self:center;font-size:12px;color:#64748b;">目标价 ¥${Number(p.targetPrice).toFixed(2)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          <button class="btn btn-primary btn-sm" onclick="openPage('chart', 'productId=${encodeURIComponent(p.id)}')">
            📈 看价格曲线
          </button>
          <button class="btn btn-ghost btn-sm" onclick="gotoBuy('${escapeHtml(p.id)}')">
            🛒 去购买
          </button>
          ${excludedCount > 0 ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;color:#64748b;" onclick="resetExclusions()">已排除 ${excludedCount} 件，点击恢复</button>` : ''}
        </div>
      </div>
    </div>
  `;

  window.gotoBuy = (pid) => {
    const product = state.products.find(x => x.id === pid);
    if (product && product.url) {
      chrome.tabs ? chrome.tabs.create({ url: product.url }) : window.open(product.url);
    } else {
      showToast('无商品链接', 'warn');
    }
  };
  window.resetExclusions = async () => {
    for (const pid of state.excludedProducts) {
      await sendMsg('TOGGLE_EXCLUDED_PRODUCT', { groupName: state.groupName, productId: pid });
    }
    state.excludedProducts = [];
    loadData();
  };
}

function renderSortControls() {
  const container = $('#sortControls');
  if (!container) return;
  container.querySelectorAll('[data-sort]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortBy);
    btn.onclick = async () => {
      state.sortBy = btn.dataset.sort;
      await sendMsg('SET_GROUP_SORT', { groupName: state.groupName, sortBy: state.sortBy });
      state.products = sortProducts(state.products, state.sortBy);
      state.bestProduct = state.products[0];
      renderSortControls();
      renderCompareCards();
      renderTable();
      renderLegend();
      renderGroupChart();
    };
  });
}

function renderStats() {
  $('#statCount').textContent = state.products.length;
  const plats = Array.from(new Set(state.products.map(p => p.platform))).map(k => (PLATFORM_MAP[k] || {}).label || k);
  $('#statPlat').textContent = plats.join(' · ');
  $('#statLowest').textContent = '¥' + Number(state.bestProduct.currentPrice).toFixed(2);
  $('#statLowestPlat').textContent = '在 ' + ((PLATFORM_MAP[state.bestProduct.platform] || {}).label || state.bestProduct.platform);
  const histLowProduct = state.products.reduce((best, p) => {
    if (!p.lowestPrice) return best;
    if (!best) return p;
    return Number(p.lowestPrice) < Number(best.lowestPrice) ? p : best;
  }, null);
  if (histLowProduct) {
    $('#statHistLow').textContent = '¥' + Number(histLowProduct.lowestPrice).toFixed(2);
    $('#statHistLowPlat').textContent = '在 ' + ((PLATFORM_MAP[histLowProduct.platform] || {}).label || histLowProduct.platform);
  }
  $('#statAvg').textContent = '¥' + state.avgPrice.toFixed(2);
}

function renderCompareCards() {
  $('#compareSummary').innerHTML = state.products.map((p, idx) => {
    const isBest = state.bestProduct && p.id === state.bestProduct.id;
    const isPreferred = state.preferredProductId === p.id;
    const isExcluded = state.excludedProducts.includes(p.id);
    const diff = Number(p.currentPrice) - Number(state.bestProduct.currentPrice);
    const savePct = state.bestProduct && Number(state.bestProduct.currentPrice) > 0
      ? ((Number(p.currentPrice) - Number(state.bestProduct.currentPrice)) / Number(state.bestProduct.currentPrice) * 100)
      : 0;
    return `
      <div class="compare-item ${isBest ? 'is-best' : ''} ${isPreferred ? 'is-preferred' : ''} ${isExcluded ? 'is-excluded' : ''}" data-pid="${escapeHtml(p.id)}" style="${isExcluded ? 'opacity:.5;filter:grayscale(.3);' : ''}">
        <div class="ci-head">
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${getPlatformBadge(p.platform)}
            ${isPreferred ? '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#fef3c7;color:#d97706;border-radius:20px;font-size:10.5px;font-weight:700;">⭐ 首选</span>' : ''}
          </div>
        </div>
        <div class="ci-name">${escapeHtml(p.name)}</div>
        <div class="ci-shop">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none"><path d="M3 9l1-5h16l1 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z M3 9h18M9 21v-5h6v5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          ${escapeHtml(p.shop || '未知店铺')}
        </div>
        <div class="ci-price-row">
          <span class="ci-cur-price">¥${Number(p.currentPrice).toFixed(2)}</span>
          ${p.lowestPrice ? `<span class="ci-low-price">历史最低 ¥${Number(p.lowestPrice).toFixed(2)}</span>` : ''}
        </div>
        <div class="ci-vs">
          ${p.targetPrice ? `<div><span>🎯 目标价</span>¥${Number(p.targetPrice).toFixed(2)} ${p.currentPrice <= p.targetPrice ? '<b style="color:#10b981;">✓ 已达</b>' : ''}</div>` : ''}
          <div><span>📊 历史最高</span>¥${Number(p.highestPrice || p.currentPrice).toFixed(2)}</div>
          ${!isBest && diff > 0 ? `<div><span>💸 贵了</span><b style="color:#ef4444;">¥${diff.toFixed(2)} (${savePct.toFixed(1)}%)</b></div>` : ''}
          ${isBest ? `<div><span>🏆</span><b style="color:#10b981;">比均价便宜 ¥${(state.avgPrice - Number(p.currentPrice)).toFixed(2)}</b></div>` : ''}
        </div>
        <div class="ci-btn-row">
          <button class="btn ${isPreferred ? 'btn-secondary' : 'btn-ghost'} btn-sm ci-btn" data-act="prefer" title="${isPreferred ? '取消首选' : '设为首选购买入口'}">
            ${isPreferred ? '⭐ 已设首选' : '☆ 设为首选'}
          </button>
          <button class="btn ${isExcluded ? 'btn-secondary' : 'btn-ghost'} btn-sm ci-btn" data-act="exclude" title="${isExcluded ? '恢复到推荐' : '排除本次推荐'}">
            ${isExcluded ? '✓ 已排除' : '🚫 排除'}
          </button>
          <button class="btn btn-primary btn-sm ci-btn" data-act="chart">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M3 3v18h18 M7 14l4-4 4 4 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            价格曲线
          </button>
          <button class="btn btn-ghost btn-sm ci-btn" data-act="buy">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            去购买
          </button>
        </div>
      </div>
    `;
  }).join('');
  $$('#compareSummary .compare-item').forEach(card => {
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      const pid = card.dataset.pid;
      const p = state.products.find(x => x.id === pid);
      if (!p) return;
      if (btn) {
          e.stopPropagation();
          if (btn.dataset.act === 'prefer') {
            const newPreferred = state.preferredProductId === pid ? null : pid;
            sendMsg('SET_PREFERRED_PRODUCT', { groupName: state.groupName, productId: newPreferred }).then(() => {
              state.preferredProductId = newPreferred;
              generateRecommendation();
              renderCompareCards();
              renderTable();
              renderRecommendation();
              showToast(newPreferred ? '✅ 已设为首选购买入口' : '已取消首选');
            });
          } else if (btn.dataset.act === 'exclude') {
            sendMsg('TOGGLE_EXCLUDED_PRODUCT', { groupName: state.groupName, productId: pid }).then((r) => {
              if (r.ok) {
                state.excludedProducts = r.data || [];
                state.bestProduct = state.products.filter(x => !state.excludedProducts.includes(x.id))[0] || state.products[0];
                generateRecommendation();
                const platSet = new Set(state.products.map(x => x.platform));
                const visibleCount = state.products.filter(x => !state.excludedProducts.includes(x.id)).length;
                $('#groupSubtitle').textContent = `共 ${state.products.length} 件 · ${visibleCount} 件有效 · ${platSet.size} 个平台 · 最低价 ¥${Number(state.bestProduct.currentPrice).toFixed(2)}`;
                renderRecommendation();
                renderCompareCards();
                renderTable();
                showToast(state.excludedProducts.includes(pid) ? '🚫 已排除本次推荐' : '✓ 已恢复到推荐');
              }
            });
          } else if (btn.dataset.act === 'chart') {
            openPage('chart', `productId=${encodeURIComponent(pid)}`);
          } else if (btn.dataset.act === 'buy') {
            if (p.url) chrome.tabs ? chrome.tabs.create({ url: p.url }) : window.open(p.url);
            else showToast('无商品链接', 'warn');
          }
        } else {
          openPage('chart', `productId=${encodeURIComponent(pid)}`);
        }
    });
  });
}

function renderLegend() {
  $('#groupLegend').innerHTML = state.products.map((p, idx) => {
    const color = LINE_COLORS[idx % LINE_COLORS.length];
    return `
      <div style="display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--text-2);font-weight:500;">
        <span style="display:inline-block;width:22px;height:3px;border-radius:3px;background:${color};"></span>
        ${escapeHtml((PLATFORM_MAP[p.platform] || {}).label || p.platform)} · ${escapeHtml(p.name.substring(0, 14))}${p.name.length > 14 ? '...' : ''}
      </div>
    `;
  }).join('');
}

function renderTable() {
  const rows = state.products.map((p, idx) => {
    const color = LINE_COLORS[idx % LINE_COLORS.length];
    const isBest = state.bestProduct && p.id === state.bestProduct.id;
    const isPreferred = state.preferredProductId === p.id;
    const delta = Number(p.highestPrice || p.currentPrice) - Number(p.lowestPrice || p.currentPrice);
    return `
      <tr style="${idx % 2 === 0 ? 'background:#f8fafc;' : ''} ${isPreferred ? 'background:#fffbeb;' : ''}">
        <td style="padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                ${getPlatformBadge(p.platform)}
                ${isPreferred ? '<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;background:#fef3c7;color:#d97706;border-radius:10px;font-size:9.5px;font-weight:700;">⭐</span>' : ''}
              </div>
              <div style="font-size:12.5px;font-weight:600;margin-top:4px;color:var(--text);">${escapeHtml(p.name.substring(0, 30))}${p.name.length > 30 ? '...' : ''}</div>
            </div>
          </div>
        </td>
        <td style="padding:12px 14px;text-align:center;font-size:13px;color:var(--text-2);">${escapeHtml(p.shop || '-')}</td>
        <td style="padding:12px 14px;text-align:center;">
          <span style="font-size:15px;font-weight:800;color:${isBest ? '#10b981' : 'var(--primary)'};">¥${Number(p.currentPrice).toFixed(2)}</span>
          ${isBest ? '<div style="font-size:10px;color:#10b981;font-weight:700;margin-top:2px;">🏆 最低价</div>' : ''}
          ${isPreferred ? '<div style="font-size:10px;color:#d97706;font-weight:700;margin-top:2px;">⭐ 首选</div>' : ''}
        </td>
        <td style="padding:12px 14px;text-align:center;font-size:12.5px;color:#10b981;font-weight:600;">¥${Number(p.lowestPrice || p.currentPrice).toFixed(2)}</td>
        <td style="padding:12px 14px;text-align:center;font-size:12.5px;color:#ef4444;font-weight:600;">¥${Number(p.highestPrice || p.currentPrice).toFixed(2)}</td>
        <td style="padding:12px 14px;text-align:center;font-size:12.5px;color:var(--text-2);font-weight:600;">
          ${delta > 0 ? `¥${delta.toFixed(2)} (${(delta / Number(p.highestPrice || p.currentPrice) * 100).toFixed(1)}%)` : '-'}
        </td>
        <td style="padding:12px 14px;text-align:center;">${getPlanBadge(p.purchasePlan)}</td>
        <td style="padding:12px 14px;text-align:center;">
          <div style="display:inline-flex;gap:4px;flex-wrap:wrap;justify-content:center;">
            <button class="pca-btn ${isPreferred ? 'primary' : ''} btn-sm" style="padding:4px 8px;font-size:11px;" data-tact="prefer" data-pid="${escapeHtml(p.id)}" title="${isPreferred ? '取消首选' : '设为首选'}">${isPreferred ? '⭐' : '☆'}</button>
            <button class="pca-btn primary btn-sm" style="padding:4px 8px;font-size:11px;" data-tact="chart" data-pid="${escapeHtml(p.id)}">曲线</button>
            <button class="pca-btn btn-sm" style="padding:4px 8px;font-size:11px;" data-tact="buy" data-pid="${escapeHtml(p.id)}">购买</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  $('#detailTable').innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:linear-gradient(135deg,#f0fdfa,#f0f9ff);">
          <th style="text-align:left;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">商品</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">店铺</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">当前价</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">历史最低</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">历史最高</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">涨跌幅度</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">状态</th>
          <th style="text-align:center;padding:12px 14px;font-size:11.5px;color:var(--text-2);font-weight:600;letter-spacing:.3px;">操作</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  $$('#detailTable [data-tact]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = b.dataset.pid;
      const p = state.products.find(x => x.id === pid);
      if (!p) return;
      if (b.dataset.tact === 'prefer') {
        const newPreferred = state.preferredProductId === pid ? null : pid;
        sendMsg('SET_PREFERRED_PRODUCT', { groupName: state.groupName, productId: newPreferred }).then(() => {
          state.preferredProductId = newPreferred;
          renderCompareCards();
          renderTable();
          showToast(newPreferred ? '✅ 已设为首选购买入口' : '已取消首选');
        });
      } else if (b.dataset.tact === 'chart') {
        openPage('chart', `productId=${encodeURIComponent(pid)}`);
      } else if (b.dataset.tact === 'buy') {
        if (p.url) chrome.tabs ? chrome.tabs.create({ url: p.url }) : window.open(p.url);
      }
    });
  });
}

function renderGroupChart() {
  const canvas = document.getElementById('groupChart');
  if (!canvas || !state.products.length) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 300 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = 300;
  const pad = { l: 52, r: 20, t: 24, b: 40 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const timestamps = new Set();
  state.products.forEach(p => (state.histories[p.id] || []).forEach(h => timestamps.add(h.timestamp)));
  const tsSorted = Array.from(timestamps).sort((a, b) => a - b);
  if (tsSorted.length < 2) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('历史数据不足，无法绘制对比曲线', W / 2, H / 2);
    return;
  }

  let minPrice = Infinity, maxPrice = -Infinity;
  state.products.forEach(p => {
    const hist = state.histories[p.id] || [];
    hist.forEach(h => { minPrice = Math.min(minPrice, h.price); maxPrice = Math.max(maxPrice, h.price); });
  });
  state.products.forEach(p => {
    minPrice = Math.min(minPrice, Number(p.lowestPrice || p.currentPrice));
    maxPrice = Math.max(maxPrice, Number(p.highestPrice || p.currentPrice));
  });
  if (!isFinite(minPrice)) { minPrice = 0; maxPrice = 100; }
  const pricePad = (maxPrice - minPrice) * 0.08 || 1;
  minPrice -= pricePad;
  maxPrice += pricePad;

  const x = (ts) => pad.l + ((ts - tsSorted[0]) / (tsSorted[tsSorted.length - 1] - tsSorted[0])) * plotW;
  const y = (pr) => pad.t + plotH - ((pr - minPrice) / (maxPrice - minPrice)) * plotH;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'right';
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const price = minPrice + (i / ySteps) * (maxPrice - minPrice);
    const py = y(price);
    ctx.beginPath();
    ctx.moveTo(pad.l, py);
    ctx.lineTo(W - pad.r, py);
    ctx.stroke();
    ctx.fillText('¥' + price.toFixed(0), pad.l - 8, py + 3);
  }
  ctx.textAlign = 'center';
  const xCount = Math.min(6, tsSorted.length);
  for (let i = 0; i < xCount; i++) {
    const idx = Math.floor((i / (xCount - 1)) * (tsSorted.length - 1));
    const ts = tsSorted[idx];
    const px = x(ts);
    ctx.beginPath();
    ctx.moveTo(px, pad.t);
    ctx.lineTo(px, H - pad.b);
    ctx.strokeStyle = '#f1f5f9';
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(formatDate(ts), px, H - pad.b + 18);
  }

  state.products.forEach((p, idx) => {
    const color = LINE_COLORS[idx % LINE_COLORS.length];
    const hist = [...(state.histories[p.id] || [])].sort((a, b) => a.timestamp - b.timestamp);
    if (!hist.length) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    hist.forEach((h, i) => {
      const px = x(h.timestamp);
      const py = y(h.price);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = color;
    const last = hist[hist.length - 1];
    ctx.beginPath();
    ctx.arc(x(last.timestamp), y(last.price), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`¥${Number(last.price).toFixed(0)}`, x(last.timestamp) + 8, y(last.price) + 3);
  });

  let hoverCard = document.getElementById('groupHoverCard');
  if (!hoverCard) {
    hoverCard = document.createElement('div');
    hoverCard.id = 'groupHoverCard';
    hoverCard.style.cssText = 'position:absolute;pointer-events:none;z-index:50;opacity:0;transition:opacity .15s;background:#0f172a;color:#f8fafc;border-radius:10px;padding:10px 13px;font-size:12px;box-shadow:0 8px 24px rgba(15,23,42,.25);min-width:170px;line-height:1.5;';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(hoverCard);
  }

  PriceChart.attachGroupHover(canvas, {
    products: state.products,
    histories: state.histories,
    colors: LINE_COLORS,
    x, y,
    pad, plotW, plotH,
    minPrice, maxPrice,
    W, H
  }, (info) => {
    if (!info) { hoverCard.style.opacity = '0'; return; }
    const { product, data, color, x: hx, y: hy } = info;
    const platLabel = (PLATFORM_MAP[product.platform] || {}).label || product.platform;
    hoverCard.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>
        <b style="font-weight:700;">${escapeHtml(platLabel)}</b>
      </div>
      <div style="color:#cbd5e1;font-size:11px;margin-bottom:4px;">📅 ${formatDate(data.timestamp)}</div>
      <div style="font-size:16px;font-weight:800;color:#f1f5f9;">¥${Number(data.price).toFixed(2)}</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(product.name)}</div>
    `;
    const cardRect = hoverCard.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    let left = hx + 14;
    let top = hy - 20;
    if (left + 200 > W) left = hx - 200;
    if (top < 0) top = 8;
    if (top + 90 > H) top = H - 90;
    hoverCard.style.left = left + 'px';
    hoverCard.style.top = top + 'px';
    hoverCard.style.opacity = '1';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  $('#backBtn').addEventListener('click', () => openPage('favorites'));
  $('#addGroupBtn').addEventListener('click', () => openPage('favorites'));
  $('#refreshBtn').addEventListener('click', async () => {
    showToast('🔍 正在检测价格，请稍候...');
    const r = await sendMsg('TRIGGER_CHECK');
    setTimeout(async () => {
      await loadData();
      if (r.ok && r.data) {
        const checked = r.data.checkedCount || 0;
        const notified = r.data.notifiedCount || 0;
        showToast(`✅ 检测完成，共检测 ${checked} 件商品，${notified} 个变化提醒`);
      }
    }, 400);
  });
  $$('.nav-item').forEach(i => {
    i.addEventListener('click', () => {
      if (i.dataset.nav) openPage(i.dataset.nav);
    });
  });
  window.addEventListener('resize', () => {
    if (state.products.length) renderGroupChart();
  });
});
