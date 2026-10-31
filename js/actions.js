// 複数の画面から使う操作

import * as store from './store.js';
import { buildSampleData } from './seed.js';
import { confirmDialog, toast } from './ui.js';

/** サンプルデータを読み込む（既存データがあれば確認してから置き換え） */
export async function loadSample() {
  if (!store.isEmpty()) {
    const ok = await confirmDialog({
      title: 'サンプルデータを読み込みますか？',
      message: '今のリスト・履歴・商品・店舗はすべてサンプルに置き換わります。\n必要なら先にバックアップを書き出してください。',
      ok: '読み込む',
      danger: true,
    });
    if (!ok) return false;
  }
  const snapshot = store.checkpoint();
  store.replaceAll(buildSampleData());
  toast('サンプルを読み込みました', {
    icon: 'sparkle',
    action: '元に戻す',
    onAction: () => store.restore(snapshot),
  });
  return true;
}

/** 削除などを「元に戻す」付きトーストで通知 */
export function withUndo(message, fn) {
  const snapshot = store.checkpoint();
  fn();
  toast(message, { action: '元に戻す', onAction: () => store.restore(snapshot) });
}

/** 履歴の商品をワンタップでリストに追加（前回の店舗・価格を使う） */
export function quickAdd(productId) {
  const product = store.getProduct(productId);
  if (!product) return;
  const stats = store.productStats(productId);
  const last = stats.last;
  const storeId = last ? last.storeId : null;
  const lp = store.lastPrice(productId, storeId);
  const res = store.addItem({
    name: product.name,
    storeName: storeId ? store.storeName(storeId) : '',
    price: lp ? lp.price : null,
    qty: 1,
  });
  if (!res) return;
  toast(res.merged ? `「${product.name}」の個数を${res.item.qty}にしました` : `「${product.name}」をリストに追加しました`, { icon: 'check' });
}
