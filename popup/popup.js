const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const DRAFT_KEY_SESSION = 'price_tracker_popup_draft';
const DRAFT_KEY_LOCAL = 'price_tracker_popup_draft_local';

async function loadDraft() {
  try {
    let raw = sessionStorage.getItem(DRAFT_KEY_SESSION);
    if (raw) return JSON.parse(raw);
    const r = await chrome.storage.local.get(DRAFT_KEY_LOCAL);
    if (r[DRAFT_KEY_LOCAL]) return r[DRAFT_KEY_LOCAL];
  } catch (e) {}
  return null;
}
async function saveDraft(data) {
  try {
    sessionStorage.setItem(DRAFT_KEY_SESSION, JSON.stringify(data));
    await chrome.storage.local.set({ [DRAFT_KEY_LOCAL]: data });
  } catch (e) {}
}
async function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY_SESSION);
    await chrome.storage.local.remove(DRAFT_KEY_LOCAL);
  } catch (e) {}
}

const state = {
  extracted: null,
  specs: [],
  editingId: null,
  initialized: false
};

async function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false });
      });
    } catch (e) { resolve({ ok: false, error: String(e) }); }
  });
}

function toast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background = type === 'error' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#0f172a';
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function renderSpecs() {
  const list = $('#specList');
  list.innerHTML = '';
  state.specs.forEach((spec, idx) => {
    const tag = document.createElement('div');
    tag.className = 'spec-item';
    tag.innerHTML = `
      <div class="spec-row">
        <span class="spec-name">${escapeHtml(spec.name)}</span>
        <button class="spec-del" data-idx="${idx}" title="删除规格">×</button>
      </div>
      <input type="text" class="spec-note-input" placeholder="备注..." data-idx="${idx}" value="${escapeHtml(spec.note || '')}">
    `;
    tag.querySelector('.spec-del').addEventListener('click', (e) => {
      state.specs.splice(Number(e.target.dataset.idx), 1);
      saveDraft({ specs: state.specs, editingId: state.editingId });
      renderSpecs();
    });
    tag.querySelector('.spec-note-input').addEventListener('input', (e) => {
      state.specs[Number(e.target.dataset.idx)].note = e.target.value;
      saveDraft({ specs: state.specs, editingId: state.editingId });
    });
    list.appendChild(tag);
  });
  const addRow = document.createElement('div');
  addRow.className = 'spec-add-row';
  addRow.innerHTML = `
    <input type="text" class="spec-add-input" id="newSpecInput" placeholder="添加规格如：M码/黑色...">
    <button class="spec-add-btn" id="addSpecBtn" title="添加规格">+ 添加</button>
  `;
  const doAdd = () => {
    const input = addRow.querySelector('.spec-add-input');
    const val = input.value.trim();
    if (val && !state.specs.some(s => s.name === val)) {
      state.specs.push({ name: val, note: '' });
      saveDraft({ specs: state.specs, editingId: state.editingId });
      renderSpecs();
    } else {
      input.value = '';
    }
  };
  addRow.querySelector('.spec-add-btn').addEventListener('click', doAdd);
  addRow.querySelector('.spec-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
  });
  list.appendChild(addRow);
  setTimeout(() => {
    const addInput = $('#newSpecInput');
    if (addInput && state.specs.length === 0) addInput.focus();
  }, 50);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
}

async function autoExtract() {
  $('#extractLoader').classList.remove('hidden');
  $('#productForm').style.opacity = '0.4';
  const r = await sendMessage('EXTRACT_FROM_PAGE');
  $('#extractLoader').classList.add('hidden');
  $('#productForm').style.opacity = '1';
  if (r.ok && r.data) {
    fillForm(r.data);
    state.extracted = r.data;
    if (r.data.name || r.data.currentPrice) toast('✓ 已自动识别商品信息', 'success');
  } else {
    toast('未检测到商品，请手动填写', 'warn');
  }
}

function fillForm(data) {
  if (data.name) $('#inputName').value = data.name;
  if (data.currentPrice) $('#inputPrice').value = data.currentPrice;
  if (data.platform) $('#inputPlatform').value = data.platform;
  if (data.category) $('#inputCategory').value = data.category;
  if (data.shop) $('#inputShop').value = data.shop;
  if (data.url) $('#inputUrl').value = data.url;
  if (data.specs && data.specs.length) {
    state.specs = data.specs.map(s => {
      if (typeof s === 'string') return { name: s, note: '' };
      return { name: s.name || '', note: s.note || '' };
    });
    renderSpecs();
  }
  if (data.targetPrice) $('#inputTarget').value = data.targetPrice;
  if (data.purchasePlan) $('#inputPlan').value = data.purchasePlan;
}

function collectForm() {
  const name = $('#inputName').value.trim();
  const price = Number($('#inputPrice').value) || 0;
  if (!name) { toast('请输入商品名称', 'error'); $('#inputName').focus(); return null; }
  if (!price) { toast('请输入商品价格', 'error'); $('#inputPrice').focus(); return null; }
  return {
    id: state.editingId || undefined,
    name,
    url: $('#inputUrl').value.trim(),
    platform: $('#inputPlatform').value,
    category: $('#inputCategory').value.trim() || '其他',
    currentPrice: price,
    lowestPrice: price,
    highestPrice: price,
    shop: $('#inputShop').value.trim(),
    imageUrl: state.extracted?.imageUrl || '',
    specs: state.specs.map(s => ({ name: s.name, note: s.note || '' })),
    targetPrice: Number($('#inputTarget').value) || 0,
    purchasePlan: $('#inputPlan').value,
    couponNotify: $('#chkCoupon').checked,
    restockNotify: $('#chkRestock').checked,
    priceDropNotify: $('#chkPrice').checked
  };
}

async function onSave() {
  const data = collectForm();
  if (!data) return;
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.textContent = '保存中...';
  const r = await sendMessage('ADD_PRODUCT', { payload: data });
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8" stroke="white" stroke-width="1.8" stroke-linejoin="round"/></svg>
    保存商品
  `;
  if (r.ok) {
    toast('✓ 已保存，开始追踪价格');
    await clearDraft();
    const savedId = r.data?.id;
    setTimeout(updateStats, 200);
    setTimeout(() => {
      if (confirm('保存成功！是否跳转到收藏页查看？')) {
        gotoPage('favorites');
      } else {
        $('#inputName').value = '';
        $('#inputPrice').value = '';
        $('#inputUrl').value = '';
        $('#inputShop').value = '';
        $('#inputTarget').value = '';
        state.specs = [];
        state.editingId = null;
        renderSpecs();
      }
    }, 600);
  } else {
    toast('保存失败: ' + (r.error || '未知错误'), 'error');
    await saveDraft({ specs: state.specs, editingId: state.editingId });
  }
}

async function updateStats() {
  const r = await sendMessage('GET_PRODUCTS');
  if (!r.ok || !r.data) return;
  const products = r.data;
  let drops = 0, hits = 0, dropsSum = 0, dropsCnt = 0;
  for (const p of products) {
    if (p.lowestPrice && p.currentPrice <= p.lowestPrice) {
      const delta = p.highestPrice ? ((p.currentPrice - p.highestPrice) / p.highestPrice) * 100 : 0;
      if (delta < 0) { drops++; dropsSum += Math.abs(delta); dropsCnt++; }
    }
    if (p.targetPrice && p.currentPrice > 0 && p.currentPrice <= p.targetPrice) hits++;
  }
  const animate = (el, val, isPct = false) => {
    let cur = 0; const step = Math.max(1, Math.ceil(val / 20));
    const iv = setInterval(() => {
      cur += step;
      if (cur >= val) { cur = val; clearInterval(iv); }
      el.textContent = isPct ? cur.toFixed(1) + '%' : cur;
    }, 20);
  };
  animate($('#statTotal'), products.length);
  animate($('#statDrop'), drops);
  animate($('#statHit'), hits);
  animate($('#statAvg'), dropsCnt ? dropsSum / dropsCnt : 0, true);
}

function gotoPage(name) {
  const map = {
    favorites: 'pages/favorites.html',
    settings: 'pages/settings.html',
    chart: 'pages/chart.html'
  };
  const url = chrome.runtime.getURL(map[name] || map.favorites);
  chrome.tabs.create({ url });
  window.close();
}

function restoreFromDraft(draft) {
  if (!draft) return;
  if (Array.isArray(draft.specs)) {
    state.specs = draft.specs;
  }
  if (draft.editingId) state.editingId = draft.editingId;
  if (draft.name) $('#inputName').value = draft.name;
  if (draft.price) $('#inputPrice').value = draft.price;
  if (draft.target) $('#inputTarget').value = draft.target;
  if (draft.url) $('#inputUrl').value = draft.url;
  if (draft.shop) $('#inputShop').value = draft.shop;
  renderSpecs();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const draft = await loadDraft();
    restoreFromDraft(draft);
  } catch (e) { console.warn('Load draft failed', e); }
  state.initialized = true;
  renderSpecs();
  $('#saveBtn').addEventListener('click', onSave);
  $('#manualFillBtn').addEventListener('click', autoExtract);
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => gotoPage(b.dataset.goto)));
  updateStats();
  setTimeout(autoExtract, 120);

  setInterval(() => {
    if (state.initialized && (state.specs.length > 0 || $('#inputName').value)) {
      saveDraft({
        specs: state.specs,
        editingId: state.editingId,
        name: $('#inputName').value,
        price: $('#inputPrice').value,
        target: $('#inputTarget').value,
        url: $('#inputUrl').value,
        shop: $('#inputShop').value
      });
    }
  }, 3000);
});
