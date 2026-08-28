/**
 * 從實作產生設計畫板。
 *
 * 三個畫板的樣式直接讀 booking-king-web/style.css 內嵌進去，不手抄——
 * 畫板要能反映「現在真的長什麼樣」，抄一份就會開始漂移。改了實作的樣式
 * 之後重跑這支，畫板就跟著更新。
 *
 * 每個畫板是獨立的沙箱 iframe，載不到外部檔案，所以 CSS 必須內嵌。
 *
 *   node design/build-artboards.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'booking-king-web', 'style.css'), 'utf8');

/** 品牌圖，跟 main.js 的 brandIcon() 指向同一個檔案。
    畫板是離線的沙箱，圖必須以檔名引用並用 --image 一起種進去。 */
const BRAND_ICON = '<img class="topbar__mark" src="brand-mark.png" alt="" aria-hidden="true">';

const topbar = (actions) => `
  <div class="topbar">
    <div class="topbar__brand">${BRAND_ICON}步經徑</div>
    <div class="topbar__actions">
      ${actions.map((a) => `<button class="btn btn--ghost btn--small">${a}</button>`).join('\n      ')}
    </div>
  </div>`;

const page = (title, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap">
  <style>
${css}
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;

// ── 預約畫面 ──────────────────────────────────────────────

const tags = ['10 小時', '6 人', 'NT$ 2000', '訂金 NT$ 1000'];
const hostSlots = [
  ['柳送君', '阿舍老師'],
  ['朱懿辰', 'Arthur'],
  ['九千歲', '網飛'],
];
const dtField = (cls, ph, val, unit) =>
  `<input type="number" class="dt-input ${cls}" placeholder="${ph}" value="${val}">` +
  `<span class="dt-unit">${unit}</span>`;

const booking = page('預約畫面', `
<div class="app">
${topbar(['主持人介面', '管理員介面', '登出'])}
  <div class="view">

    <div class="section">
      <div class="section__label">選擇劇本</div>
      <div class="select-wrap"><select><option>竊雲台</option></select></div>
    </div>

    <div class="section">
      <div class="tag-row">
        ${tags.map((t) => `<div class="tag">${t}</div>`).join('\n        ')}
      </div>
    </div>

    <div class="section">
      <div class="section__label">場次</div>

      <!-- 上排：輸入輔助。change 時把值寫進下排，本身不是資料來源。 -->
      <div class="field">
        <div class="field__label">選擇日期時間</div>
        <div class="picker-row">
          <input type="date" class="date-picker" value="2028-03-15">
          <div class="select-wrap"><select class="time-select"><option>14</option></select></div>
          <span class="dt-unit">時</span>
          <div class="select-wrap"><select class="time-select"><option>30</option></select></div>
          <span class="dt-unit">分</span>
        </div>
      </div>

      <!-- 下排：唯一的資料來源，送出時只讀這五格。 -->
      <div class="field">
        <div class="field__label">日期時間</div>
        <div class="dt-row">
          ${dtField('dt-input--year', 'YYYY', '2028', '年')}
          ${dtField('dt-input--short', 'MM', '3', '月')}
          ${dtField('dt-input--short', 'DD', '15', '日')}
          ${dtField('dt-input--short', 'hh', '14', '時')}
          ${dtField('dt-input--short', 'mm', '30', '分')}
        </div>
      </div>

      <div class="field__hint">預計 00:30 結束</div>
      <div class="field__hint">本時段目前可進行預約</div>
    </div>

    <div class="section">
      <div class="section__label">選擇主持人</div>
      <div class="list">
        ${hostSlots.map(([role, who]) => `<div class="field">
          <div class="field__label">${role}</div>
          <div class="select-wrap"><select><option>${who}</option></select></div>
        </div>`).join('\n        ')}
      </div>
    </div>

    <div class="spacer"></div>
    <div class="section" style="padding-bottom: 20px">
      <button class="btn btn--primary">立即預約</button>
    </div>
  </div>
</div>`);

// ── 主持人介面 ────────────────────────────────────────────

const hostBookings = [
  ['竊雲台', '2026-08-30（日）10:00', '網飛', '柳送君'],
  ['竊雲台', '2027-12-20（一）14:00', '網飛', '柳送君'],
];

const host = page('主持人介面', `
<div class="app">
${topbar(['回到預約', '登出'])}
  <div class="view">
    <div class="tabs">
      <button class="tab tab--active">待確認場次</button>
      <button class="tab">已確認場次</button>
      <button class="tab">已結束場次</button>
    </div>
    <div class="section toolbar">
      <button class="btn btn--ghost btn--small">篩選器</button>
    </div>
    <div class="section">
      <div class="list">
        ${hostBookings.map(([name, when, player, role]) => `<div class="card list-item">
          <div class="list-item__main">
            <div class="list-item__title">${name}</div>
            <div class="list-item__meta">${when}</div>
            <div class="list-item__links">
              <button class="linklike">${player}</button>
              <span class="sep">·</span>
              <button class="linklike">${role}</button>
            </div>
          </div>
          <div class="list-item__side">
            <button class="btn btn--primary btn--small">確認</button>
          </div>
        </div>`).join('\n        ')}
      </div>
    </div>
  </div>
</div>`);

// ── 管理員介面 ────────────────────────────────────────────

const admin = page('管理員介面', `
<div class="app">
${topbar(['回到預約', '登出'])}
  <div class="view">
    <div class="tabs">
      <button class="tab tab--active">劇本管理</button>
      <button class="tab">場次管理</button>
      <button class="tab">使用者管理</button>
    </div>
    <div class="section">
      <div class="list">
        <div class="card list-item">
          <div class="list-item__main">
            <div class="list-item__title">竊雲台</div>
            <div class="list-item__meta">10 小時 · 6 人 · NT$ 2000 · 訂金 1000</div>
            <div class="list-item__meta">柳送君（1 人可帶）、朱懿辰（1 人可帶）、九千歲（1 人可帶）</div>
          </div>
          <div class="list-item__side">
            <button class="btn btn--ghost btn--small">編輯</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`);

const files = { 'Main.dc.html': booking, 'Host.dc.html': host, 'Admin.dc.html': admin };
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(here, name), content);
  console.log(`  ${name}  ${(content.length / 1024).toFixed(1)} KB`);
}
