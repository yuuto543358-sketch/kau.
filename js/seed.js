// サンプルデータ（動作確認・お試し用）

import { uid } from './utils.js';
import { SCHEMA_VERSION } from './store.js';

const STORES = ['スーパーA', 'ドラッグストアB', 'ホームセンターC', 'ネット通販'];

// [商品名, 店舗, [[何日前, 価格, 個数?], ...]]
const HISTORY = [
  ['牛乳', 'スーパーA', [[62, 208], [47, 198], [33, 198], [19, 218], [8, 198]]],
  ['牛乳', 'ドラッグストアB', [[26, 188], [12, 178]]],
  ['卵（10個）', 'スーパーA', [[55, 248], [34, 258], [13, 268]]],
  ['食パン', 'スーパーA', [[40, 158], [22, 168], [6, 168]]],
  ['バナナ', 'スーパーA', [[30, 128], [16, 138], [4, 138]]],
  ['鶏むね肉', 'スーパーA', [[44, 398, 2], [21, 420, 2], [9, 410]]],
  ['納豆', 'スーパーA', [[38, 98], [15, 98]]],
  ['納豆', 'ドラッグストアB', [[24, 88]]],
  ['ヨーグルト', 'スーパーA', [[35, 148]]],
  ['ヨーグルト', 'ドラッグストアB', [[18, 138], [3, 138]]],
  ['豆腐', 'スーパーA', [[28, 68], [10, 78]]],
  ['麦茶パック', 'スーパーA', [[50, 198]]],
  ['トイレットペーパー', 'ドラッグストアB', [[58, 398], [29, 428]]],
  ['トイレットペーパー', 'ホームセンターC', [[42, 368]]],
  ['ティッシュペーパー', 'ドラッグストアB', [[45, 298]]],
  ['ティッシュペーパー', 'ホームセンターC', [[25, 278]]],
  ['歯みがき粉', 'ドラッグストアB', [[36, 248]]],
  ['シャンプー（詰め替え）', 'ドラッグストアB', [[52, 598]]],
  ['シャンプー（詰め替え）', 'ネット通販', [[20, 520]]],
  ['洗濯洗剤', 'ドラッグストアB', [[48, 348]]],
  ['洗濯洗剤', 'ホームセンターC', [[31, 328]]],
  ['洗濯洗剤', 'ネット通販', [[11, 298, 2]]],
  ['電池（単3）', 'ホームセンターC', [[57, 498]]],
  ['ゴミ袋 45L', 'ホームセンターC', [[39, 228]]],
  ['コーヒー豆', 'ネット通販', [[46, 1280], [17, 1280]]],
  ['ミネラルウォーター 2L×6', 'ネット通販', [[27, 698]]],
  ['ミネラルウォーター 2L×6', 'ドラッグストアB', [[14, 588]]],
];

// [商品名, 店舗, 価格, 個数, メモ, 購入済み]
const LIST = [
  ['牛乳', 'スーパーA', 198, 1, '', false],
  ['卵（10個）', 'スーパーA', 268, 1, '', false],
  ['食パン', 'スーパーA', 168, 1, '6枚切り', false],
  ['鶏むね肉', 'スーパーA', 410, 2, '', false],
  ['バナナ', 'スーパーA', 138, 1, '', true],
  ['トイレットペーパー', 'ドラッグストアB', 428, 1, '12ロール・ダブル', false],
  ['歯みがき粉', 'ドラッグストアB', 248, 1, '', false],
  ['柔軟剤', 'ドラッグストアB', null, 1, 'いつもの香り', false],
  ['ヨーグルト', 'ドラッグストアB', 138, 2, '', true],
  ['電池（単3）', 'ホームセンターC', 498, 1, '8本パック', false],
  ['ゴミ袋 45L', 'ホームセンターC', 228, 1, '', false],
  ['コーヒー豆', 'ネット通販', 1280, 1, '中煎り 500g', false],
];

function daysAgo(n, hour = 18) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, (n * 7) % 60, 0, 0);
  return d.getTime();
}

export function buildSampleData() {
  const now = Date.now();
  const products = new Map();
  const stores = new Map();
  const productId = (name) => {
    if (!products.has(name)) products.set(name, { id: uid('p_'), name, createdAt: daysAgo(70), updatedAt: daysAgo(70) });
    return products.get(name).id;
  };
  STORES.forEach((name, order) => stores.set(name, { id: uid('s_'), name, order, createdAt: daysAgo(70), updatedAt: daysAgo(70) }));
  const storeId = (name) => stores.get(name).id;

  const purchases = [];
  for (const [name, store, rows] of HISTORY) {
    for (const [ago, price, qty = 1] of rows) {
      const date = daysAgo(ago);
      purchases.push({ id: uid('h_'), productId: productId(name), storeId: storeId(store), price, qty, date, itemId: null, createdAt: date });
    }
  }

  const items = LIST.map(([name, store, price, qty, memo, checked], idx) => {
    const item = {
      id: uid('i_'),
      productId: productId(name),
      storeId: storeId(store),
      price,
      qty,
      memo,
      createdAt: now - (LIST.length - idx) * 60000 - 3600000,
      checked,
      checkedAt: null,
      purchaseId: null,
    };
    if (checked) {
      const date = now - (LIST.length - idx) * 45000;
      const purchase = { id: uid('h_'), productId: item.productId, storeId: item.storeId, price, qty, date, itemId: item.id, createdAt: date };
      purchases.push(purchase);
      item.checkedAt = date;
      item.purchaseId = purchase.id;
    }
    return item;
  });

  return {
    schema: SCHEMA_VERSION,
    products: [...products.values()],
    stores: [...stores.values()],
    items,
    purchases,
    settings: { showChecked: true },
    meta: { createdAt: now, lastBackupAt: null },
  };
}
