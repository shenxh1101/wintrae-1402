self.PriceChecker = {
  async refresh(productId) {
    const products = await StorageAPI.getProducts();
    const p = products.find(x => x.id === productId);
    if (!p) return null;
    const result = await simulatePriceCheck(p);
    if (result.price && result.price !== p.currentPrice) {
      const delta = ((result.price - p.currentPrice) / p.currentPrice) * 100;
      p.currentPrice = result.price;
      p.updatedAt = Date.now();
      if (result.price < (p.lowestPrice || Infinity)) p.lowestPrice = result.price;
      if (result.price > (p.highestPrice || 0)) p.highestPrice = result.price;
      await StorageAPI.saveProducts(products);
      try {
        const db = await openDB();
        const tx = db.transaction('priceHistory', 'readwrite');
        tx.objectStore('priceHistory').add({
          productId: p.id, price: p.currentPrice, timestamp: Date.now(),
          source: delta < 0 ? 'drop' : 'auto'
        });
      } catch (_) {}
    }
    return p;
  }
};
