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
    this.send(`drop_${product.id}`, {
      title: '好消息！商品降价',
      message: `${product.name.substring(0, 20)} 降价 ${Math.abs(pct).toFixed(1)}%，现价 ¥${newPrice}`,
      priority: 2
    });
  },
  targetReached(product) {
    this.send(`target_${product.id}`, {
      title: '目标价已到达',
      message: `${product.name.substring(0, 20)} 现价 ¥${product.currentPrice}，低于目标 ¥${product.targetPrice}`,
      priority: 2
    });
  },
  restock(product) {
    this.send(`restock_${product.id}`, {
      title: '补货通知',
      message: `${product.name.substring(0, 20)} 已补货，快去看看吧`,
      priority: 1
    });
  },
  coupon(product) {
    this.send(`coupon_${product.id}`, {
      title: '优惠券可用',
      message: `${product.name.substring(0, 20)} 有新的优惠券可以使用`,
      priority: 1
    });
  }
};
