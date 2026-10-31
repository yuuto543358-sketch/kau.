// 共通ユーティリティ

/** 一意なIDを生成 */
export function uid(prefix = '') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

/** HTMLエスケープ */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 入力された名前を整える
 * 前後・連続の空白を除去し、全角英数字→半角、半角カナ→全角にそろえる（括弧などの記号はそのまま）
 */
export function cleanName(value) {
  return String(value ?? '')
    .replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\uFF61-\uFF9F]+/g, (k) => k.normalize('NFKC'))
    .replace(/[\s\u3000]+/g, ' ')
    .trim();
}

/** 比較用に正規化（全角半角の統一、カタカナ→ひらがな、大文字→小文字） */
export function norm(value) {
  return cleanName(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 同一判定用キー（空白も無視） */
export function nameKey(value) {
  return norm(value).replace(/\s/g, '');
}

/** 「似ている」判定用キー（長音・記号も無視） */
export function looseKey(value) {
  return nameKey(value).replace(/[ー－‐\-・･.,、。'"’”!?！？()（）「」\[\]【】/／&＆+＋~〜]/g, '');
}

/** 価格表示 */
const yenFormatter = new Intl.NumberFormat('ja-JP');
export function yen(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `¥${yenFormatter.format(Math.round(value))}`;
}
export function num(value) {
  return yenFormatter.format(Math.round(value || 0));
}

/** 価格を「¥」を小さくしたHTMLで表示 */
export function yenHTML(value, cls = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return `<span class="price price--empty ${cls}">—</span>`;
  }
  return `<span class="price ${cls}"><span class="price__sym">¥</span>${num(value)}</span>`;
}

/** 価格入力値を数値に変換（空なら null） */
export function parsePrice(value) {
  const digits = String(value ?? '').normalize('NFKC').replace(/[^\d]/g, '');
  if (!digits) return null;
  return Math.min(Number(digits), 99999999);
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 「今日」「昨日」「10月28日（火）」形式 */
export function dayLabel(ts, now = Date.now()) {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const md = `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
  return sameYear ? md : `${d.getFullYear()}年${md}`;
}

/** 「10/28」形式（年が違えば 2025/10/28） */
export function shortDate(ts, now = Date.now()) {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 「2026年10月28日」形式 */
export function longDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 相対表記（「3日前」など） */
export function relativeDay(ts, now = Date.now()) {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (diff <= 0) return '今日';
  if (diff === 1) return '昨日';
  if (diff < 7) return `${diff}日前`;
  if (diff < 30) return `${Math.floor(diff / 7)}週間前`;
  if (diff < 365) return `${Math.floor(diff / 30)}か月前`;
  return `${Math.floor(diff / 365)}年前`;
}

/** <input type="date"> 用の YYYY-MM-DD */
export function toDateInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD → タイムスタンプ（時刻は元の値を維持、なければ12時） */
export function fromDateInput(value, keepTimeOf) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const base = keepTimeOf ? new Date(keepTimeOf) : null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    base ? base.getHours() : 12, base ? base.getMinutes() : 0, base ? base.getSeconds() : 0);
  return d.getTime();
}

export function monthKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() * 100 + d.getMonth();
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 文字列で検索（正規化して部分一致） */
export function matches(text, query) {
  if (!query) return true;
  return norm(text).includes(norm(query));
}

export const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
