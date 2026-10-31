// kau. — エントリーポイント

import * as store from './store.js';
import { hydrateIcons, icon } from './icons.js';
import { watchViewport, renderPages, closeAllPages, toast } from './ui.js';
import { mountList, render as renderList, currentStoreId, flushPending } from './views/list.js';
import { mountHistory, render as renderHistory } from './views/history.js';
import { mountManage, render as renderManage } from './views/manage.js';
import { openItemEditor } from './views/editor.js';

let activeTab = 'list';

function switchTab(tab) {
  if (tab === activeTab) {
    // 同じタブをもう一度タップしたら先頭までスクロール
    document.querySelector(`.screen[data-screen="${tab}"] .scroll`)?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  flushPending();
  closeAllPages();
  activeTab = tab;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.dataset.screen === tab));
  document.querySelectorAll('.tabbar__item').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  document.querySelector('.fab').classList.toggle('is-hidden', tab !== 'list');
  document.getElementById('app').dataset.tab = tab;
  try { sessionStorage.setItem('kau.tab', tab); } catch { /* 保存できなくても動作に影響なし */ }
}

function renderAll(reason) {
  renderList({ animate: reason !== 'restore' && reason !== 'import' && reason !== 'reset' });
  renderHistory();
  renderManage();
  renderPages();
}

function init() {
  store.init();
  watchViewport();
  hydrateIcons();
  document.querySelector('.fab').innerHTML = icon('plus');

  mountList(document.querySelector('[data-screen="list"]'));
  mountHistory(document.querySelector('[data-screen="history"]'));
  mountManage(document.querySelector('[data-screen="manage"]'));

  store.subscribe((reason) => {
    renderAll(reason);
    if (store.getError()) {
      toast('保存できませんでした。端末の空き容量を確認してください', { icon: 'alert', duration: 5000 });
    }
  });

  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  document.querySelector('.fab').addEventListener('click', () => {
    openItemEditor({ storeId: currentStoreId() });
  });

  // アプリを閉じる・切り替えるときは、チェック操作を確実に保存
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending();
    else renderList({ animate: false }); // 日付の表示などを更新
  });
  window.addEventListener('pagehide', flushPending);

  let saved = null;
  try { saved = sessionStorage.getItem('kau.tab'); } catch { /* 無視 */ }
  if (saved && saved !== 'list') switchTab(saved);

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新しいバージョンがあります', {
              action: '更新',
              duration: 8000,
              onAction: () => location.reload(),
            });
          }
        });
      });
    }).catch((err) => console.warn('Service Worker の登録に失敗しました', err));
  });
}

init();
