const Exporter = {
  async export(products, format = 'csv') {
    if (format === 'json') return this._json(products);
    return this._csv(products);
  },
  _json(products) {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      products: products.map(p => ({
        name: p.name,
        url: p.url,
        platform: p.platform,
        category: p.category,
        shop: p.shop,
        currentPrice: p.currentPrice,
        lowestPrice: p.lowestPrice,
        highestPrice: p.highestPrice,
        targetPrice: p.targetPrice,
        specs: p.specs || [],
        specNote: p.specNote,
        purchasePlan: p.purchasePlan,
        createdAt: new Date(p.createdAt).toISOString(),
        updatedAt: new Date(p.updatedAt).toISOString()
      }))
    };
    this._download(JSON.stringify(payload, null, 2), `购物清单_${this._ts()}.json`, 'application/json');
  },
  _csv(products) {
    const headers = ['商品名称', '平台', '品类', '店铺', '当前价', '最低价', '最高价',
      '目标价', '购买状态', '规格', '备注', '商品链接', '收藏日期'];
    const rows = products.map(p => {
      const specs = (p.specs || []).map(s => {
        if (typeof s === 'string') return s;
        return s.note ? `${s.name}(${s.note})` : s.name;
      }).join('；');
      return [
        this._csvEscape(p.name),
        this._csvEscape((PLATFORM_MAP[p.platform] || {}).label || p.platform),
        this._csvEscape(p.category),
        this._csvEscape(p.shop),
        p.currentPrice || '',
        p.lowestPrice || '',
        p.highestPrice || '',
        p.targetPrice || '',
        this._csvEscape((PLAN_MAP[p.purchasePlan] || {}).label || ''),
        this._csvEscape(specs),
        this._csvEscape(p.specNote),
        this._csvEscape(p.url),
        this._csvEscape(formatDate(p.createdAt))
      ];
    });
    const bom = '\uFEFF';
    const csv = bom + [headers.map(h => this._csvEscape(h)).join(','),
      ...rows.map(r => r.join(','))].join('\n');
    this._download(csv, `购物清单_${this._ts()}.csv`, 'text/csv');
  },
  _csvEscape(s) {
    if (s == null) return '';
    const str = String(s);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  },
  _ts() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  },
  _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
};
