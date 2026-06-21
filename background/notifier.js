self.Notifier = {
  send(id, options) {
    try {
      const base = {
        iconUrl: '../icons/icon128.png',
        type: 'basic',
        priority: 1
      };
      chrome.notifications.create(id, { ...base, ...options });
    } catch (e) {
      console.warn('Notification failed', e);
    }
  },
  priceDrop(product, oldPrice, newPrice) {
    const pct = ((newPrice - oldPrice) / oldPrice) * 100;
    const msg = `${product.name.substring(0, 20)} 降价 ${Math.abs(pct).toFixed(1)}%，现价 ¥${newPrice}`;
    this.send(`drop_${product.id}`, {
      title: '好消息！商品降价',
      message: msg,
      priority: 2
    });
    this.addRecord({
      type: 'priceDrop',
      productId: product.id,
      productName: product.name,
      title: '商品降价',
      message: msg,
      extra: { oldPrice, newPrice, deltaPct: pct }
    });
  },
  targetReached(product) {
    const msg = `${product.name.substring(0, 20)} 现价 ¥${product.currentPrice}，低于目标 ¥${product.targetPrice}`;
    this.send(`target_${product.id}`, {
      title: '目标价已到达',
      message: msg,
      priority: 2
    });
    this.addRecord({
      type: 'targetReached',
      productId: product.id,
      productName: product.name,
      title: '目标价已到达',
      message: msg,
      extra: { currentPrice: product.currentPrice, targetPrice: product.targetPrice }
    });
  },
  restock(product) {
    const msg = `${product.name.substring(0, 20)} 已补货，快去看看吧`;
    this.send(`restock_${product.id}`, {
      title: '补货通知',
      message: msg,
      priority: 1
    });
    this.addRecord({
      type: 'restock',
      productId: product.id,
      productName: product.name,
      title: '补货通知',
      message: msg
    });
  },
  coupon(product) {
    const msg = `${product.name.substring(0, 20)} 有新的优惠券可以使用`;
    this.send(`coupon_${product.id}`, {
      title: '优惠券可用',
      message: msg,
      priority: 1
    });
    this.addRecord({
      type: 'coupon',
      productId: product.id,
      productName: product.name,
      title: '优惠券可用',
      message: msg
    });
  },
  async addRecord(record) {
    try {
      const key = 'notificationRecords';
      const r = await chrome.storage.local.get(key);
      const list = r[key] || [];
      list.unshift({
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...record,
        read: false,
        createdAt: Date.now()
      });
      if (list.length > 200) list.length = 200;
      await chrome.storage.local.set({ [key]: list });
    } catch (e) {
      console.warn('Save notification record failed', e);
    }
  },
  async getRecords() {
    try {
      const r = await chrome.storage.local.get('notificationRecords');
      return r.notificationRecords || [];
    } catch (e) { return []; }
  },
  async markRead(id) {
    try {
      const r = await chrome.storage.local.get('notificationRecords');
      const list = r.notificationRecords || [];
      const item = list.find(x => x.id === id);
      if (item) { item.read = true; await chrome.storage.local.set({ notificationRecords: list }); }
    } catch (e) {}
  },
  async markAllRead() {
    try {
      const r = await chrome.storage.local.get('notificationRecords');
      const list = (r.notificationRecords || []).map(x => ({ ...x, read: true }));
      await chrome.storage.local.set({ notificationRecords: list });
    } catch (e) {}
  },
  async clearRecords() {
    try { await chrome.storage.local.set({ notificationRecords: [] }); } catch (e) {}
  },
  async unreadCount() {
    try {
      const list = await this.getRecords();
      return list.filter(x => !x.read).length;
    } catch (e) { return 0; }
  },
  async addCustom(record) {
    await this.addRecord(record);
  }
};
self.showNotification = (id, opt) => self.Notifier.send(id, opt);
