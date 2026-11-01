// 共通UI部品：シート（下から出る画面）、プッシュ画面、確認ダイアログ、アクションシート、トースト

import { esc } from './utils.js';
import { icon } from './icons.js';

const sheetsRoot = () => document.getElementById('sheets');
const pagesRoot = () => document.getElementById('pages');
const toastsRoot = () => document.getElementById('toasts');

const sheetStack = [];

/* ---------------------------------------------------------------- 表示領域（キーボード対応） */

export function watchViewport() {
  const vv = window.visualViewport;
  const apply = () => {
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    document.documentElement.style.setProperty('--vvh', `${h}px`);
    document.documentElement.style.setProperty('--vv-top', `${top}px`);
    const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    document.documentElement.classList.toggle('keyboard-open', kb > 120);
  };
  apply();
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  // iOSでキーボード表示時にページ全体がずれるのを戻す
  document.addEventListener('focusout', () => setTimeout(() => window.scrollTo(0, 0), 50));
}

/* ---------------------------------------------------------------- シート */

/**
 * 下から出るシートを開く
 * @param {object} opt
 * @param {string} opt.title
 * @param {string} [opt.left]  左上ボタンのHTML（既定：キャンセル）
 * @param {string} [opt.right] 右上ボタンのHTML
 * @param {string} opt.body
 * @param {string} [opt.footer]
 * @param {'full'|'auto'} [opt.size]
 * @param {(el: HTMLElement, close: Function) => void} [opt.onMount]
 * @param {() => void} [opt.onClose]
 */
export function openSheet(opt) {
  const el = document.createElement('div');
  el.className = `sheet sheet--${opt.size || 'full'} ${opt.className || ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', opt.title || '');
  el.innerHTML = `
    <div class="sheet__backdrop" data-sheet-close></div>
    <div class="sheet__panel">
      <div class="sheet__grabber" aria-hidden="true"></div>
      <header class="sheet__header">
        <div class="sheet__side sheet__side--left">${opt.left ?? '<button type="button" class="btn-text" data-sheet-close>キャンセル</button>'}</div>
        <h2 class="sheet__title">${esc(opt.title || '')}</h2>
        <div class="sheet__side sheet__side--right">${opt.right ?? ''}</div>
      </header>
      <div class="sheet__body">${opt.body || ''}</div>
      ${opt.footer ? `<footer class="sheet__footer">${opt.footer}</footer>` : ''}
    </div>`;

  const entry = { el, closing: false, onClose: opt.onClose };
  const close = () => closeSheet(entry);
  entry.close = close;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-close]')) {
      e.preventDefault();
      close();
    }
  });
  enableSwipeDown(el.querySelector('.sheet__panel'), el.querySelector('.sheet__header'), close);

  const prev = sheetStack[sheetStack.length - 1];
  if (prev) prev.el.classList.add('is-behind');
  sheetStack.push(entry);
  sheetsRoot().appendChild(el);
  document.documentElement.classList.add('has-sheet');
  opt.onMount?.(el, close);
  // 次のフレームで表示アニメーション
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  return { el, close };
}

function closeSheet(entry) {
  if (entry.closing) return;
  entry.closing = true;
  const active = document.activeElement;
  if (active && entry.el.contains(active)) active.blur();
  entry.el.classList.remove('is-open');
  entry.el.classList.add('is-closing');
  const idx = sheetStack.indexOf(entry);
  if (idx >= 0) sheetStack.splice(idx, 1);
  const prev = sheetStack[sheetStack.length - 1];
  if (prev) prev.el.classList.remove('is-behind');
  if (!sheetStack.length) document.documentElement.classList.remove('has-sheet');
  const done = () => entry.el.remove();
  entry.el.querySelector('.sheet__panel').addEventListener('transitionend', done, { once: true });
  setTimeout(done, 450);
  entry.onClose?.();
}

export function closeAllSheets() {
  [...sheetStack].reverse().forEach((s) => s.close());
}

export function hasOpenSheet() {
  return sheetStack.length > 0;
}

/** ヘッダー部分を下にスワイプしてシートを閉じる */
function enableSwipeDown(panel, handle, close) {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  handle.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    startY = e.touches[0].clientY;
    dy = 0;
    panel.style.transition = 'none';
  }, { passive: true });
  handle.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 110) close();
  };
  handle.addEventListener('touchend', end);
  handle.addEventListener('touchcancel', end);
}

/* ---------------------------------------------------------------- プッシュ画面（右から出る） */

const pageStack = [];

/**
 * @param {object} opt
 * @param {string} opt.title
 * @param {string} [opt.backLabel]
 * @param {string} [opt.right]
 * @param {(body: HTMLElement, page: object) => void} opt.render  内容を描画する関数（データ変更時にも呼ばれる）
 * @param {(el: HTMLElement, page: object) => void} [opt.onMount]
 */
export function pushPage(opt) {
  const el = document.createElement('section');
  el.className = 'page';
  el.innerHTML = `
    <header class="navbar navbar--page">
      <button type="button" class="navbar__back" data-page-back>${icon('chevronLeft')}<span>${esc(opt.backLabel || '戻る')}</span></button>
      <h1 class="navbar__title">${esc(opt.title)}</h1>
      <div class="navbar__actions">${opt.right || ''}</div>
    </header>
    <div class="page__scroll scroll">
      <div class="page__body"></div>
    </div>`;
  const page = {
    el,
    body: el.querySelector('.page__body'),
    render: () => opt.render(page.body, page),
    close: () => popPage(page),
    setTitle: (t) => { el.querySelector('.navbar__title').textContent = t; },
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-page-back]')) page.close();
  });
  const scroller = el.querySelector('.page__scroll');
  scroller.addEventListener('scroll', () => {
    el.querySelector('.navbar').classList.toggle('is-scrolled', scroller.scrollTop > 4);
  }, { passive: true });
  enableEdgeSwipeBack(el, page.close);

  const prev = pageStack[pageStack.length - 1];
  if (prev) prev.el.classList.add('is-behind');
  else document.querySelector('.screens').classList.add('is-behind');
  pageStack.push(page);
  pagesRoot().appendChild(el);
  document.documentElement.classList.add('has-page');
  page.render();
  opt.onMount?.(el, page);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  return page;
}

function popPage(page) {
  const idx = pageStack.indexOf(page);
  if (idx < 0) return;
  pageStack.splice(idx, 1);
  page.el.classList.remove('is-open');
  page.el.classList.add('is-closing');
  const prev = pageStack[pageStack.length - 1];
  if (prev) prev.el.classList.remove('is-behind');
  else {
    document.querySelector('.screens').classList.remove('is-behind');
    document.documentElement.classList.remove('has-page');
  }
  const done = () => page.el.remove();
  page.el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 500);
}

export function closeAllPages() {
  [...pageStack].reverse().forEach((p) => p.close());
}

export function renderPages() {
  pageStack.forEach((p) => p.render());
}

/** 画面左端からのスワイプで戻る */
function enableEdgeSwipeBack(el, back) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let active = false;
  let decided = false;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t.clientX > 24) return;
    active = true;
    decided = false;
    startX = t.clientX;
    startY = t.clientY;
    dx = 0;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!active) return;
    const t = e.touches[0];
    dx = Math.max(0, t.clientX - startX);
    if (!decided) {
      if (Math.abs(t.clientY - startY) > Math.abs(dx) + 6) { active = false; return; }
      if (dx > 8) { decided = true; el.style.transition = 'none'; }
    }
    if (decided) el.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  const end = () => {
    if (!active) return;
    active = false;
    el.style.transition = '';
    el.style.transform = '';
    if (decided && dx > el.clientWidth * 0.33) back();
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

/* ---------------------------------------------------------------- 確認ダイアログ */

/**
 * iOS風の確認ダイアログ
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', ok = 'OK', cancel = 'キャンセル', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'alert';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `
      <div class="alert__backdrop"></div>
      <div class="alert__box">
        <div class="alert__content">
          <h3 class="alert__title">${esc(title)}</h3>
          ${message ? `<p class="alert__message">${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
        </div>
        <div class="alert__buttons">
          <button type="button" class="alert__btn" data-v="0">${esc(cancel)}</button>
          <button type="button" class="alert__btn alert__btn--strong ${danger ? 'is-danger' : ''}" data-v="1">${esc(ok)}</button>
        </div>
      </div>`;
    const finish = (v) => {
      el.classList.remove('is-open');
      setTimeout(() => el.remove(), 220);
      resolve(v);
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) finish(b.dataset.v === '1');
    });
    document.getElementById('app').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  });
}

/**
 * アクションシート（下から出る選択肢）
 * @param {{ title?: string, message?: string, actions: {label: string, value: string, danger?: boolean}[] }} opt
 * @returns {Promise<string|null>}
 */
export function actionSheet({ title = '', message = '', actions }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'action-sheet';
    el.innerHTML = `
      <div class="action-sheet__backdrop" data-v=""></div>
      <div class="action-sheet__panel">
        <div class="action-sheet__group">
          ${title || message ? `<div class="action-sheet__head">
            ${title ? `<div class="action-sheet__title">${esc(title)}</div>` : ''}
            ${message ? `<div class="action-sheet__message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
          </div>` : ''}
          ${actions.map((a) => `<button type="button" class="action-sheet__btn ${a.danger ? 'is-danger' : ''}" data-v="${esc(a.value)}">${esc(a.label)}</button>`).join('')}
        </div>
        <button type="button" class="action-sheet__btn action-sheet__cancel" data-v="">キャンセル</button>
      </div>`;
    const finish = (v) => {
      el.classList.remove('is-open');
      setTimeout(() => el.remove(), 300);
      resolve(v || null);
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) finish(b.dataset.v);
    });
    document.getElementById('app').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  });
}

/* ---------------------------------------------------------------- トースト */

let toastTimer = null;

/**
 * 画面下に短いメッセージを表示
 * @param {string} message
 * @param {{ action?: string, onAction?: Function, duration?: number, icon?: string }} [opt]
 */
export function toast(message, opt = {}) {
  const root = toastsRoot();
  root.querySelectorAll('.toast').forEach((t) => {
    t.classList.remove('is-open');
    setTimeout(() => t.remove(), 250);
  });
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    ${opt.icon ? `<span class="toast__icon">${icon(opt.icon)}</span>` : ''}
    <span class="toast__msg">${esc(message)}</span>
    ${opt.action ? `<button type="button" class="toast__action">${esc(opt.action)}</button>` : ''}`;
  const hide = () => {
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 250);
  };
  if (opt.action) {
    el.querySelector('.toast__action').addEventListener('click', () => {
      hide();
      opt.onAction?.();
    });
  }
  root.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  toastTimer = setTimeout(hide, opt.duration || (opt.action ? 4500 : 2200));
}

/* ---------------------------------------------------------------- リストのアニメーション（FLIP） */

/** 再描画の前後で要素の位置差をアニメーションする */
export function flip(container, mutate) {
  const before = new Map();
  container.querySelectorAll('[data-flip]').forEach((el) => {
    before.set(el.dataset.flip, el.getBoundingClientRect());
  });
  mutate();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  container.querySelectorAll('[data-flip]').forEach((el) => {
    const prev = before.get(el.dataset.flip);
    if (!prev) {
      el.animate([{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      return;
    }
    const now = el.getBoundingClientRect();
    const dy = prev.top - now.top;
    if (Math.abs(dy) < 1) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: 380,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  });
}
