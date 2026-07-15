import { formatDate } from '@/lib/utils-binaa';

// قالب طباعة موحّد لكل مطبوعات النظام (عدا فواتير العملاء التي لها قالبها الخاص).
// يبني صفحة HTML احترافية تحتوي ترويسة بيانات الشركة، رأس/فوتر اختياري بالصور،
// وتصميم جدول أنيق بألوان الشركة، ثم يفتح نافذة الطباعة.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * يبني ويطبع مستنداً موحّداً.
 * @param {Object}   opts
 * @param {Object}   opts.settings   إعدادات الشركة (من useCompanySettings)
 * @param {'ar'|'en'} opts.lang
 * @param {string}   opts.heading     عنوان المطبوعة
 * @param {string}   [opts.subheading] سطر فرعي (فترة/فلتر ...)
 * @param {string[]} opts.headers     رؤوس أعمدة الجدول
 * @param {Array<Array<string|number>>} opts.rows  صفوف الجدول
 * @param {string}   [opts.aligns]    اتجاه محاذاة الخلايا (تلقائي حسب اللغة)
 */
export function printDocument({ settings = {}, lang = 'ar', heading = '', subheading = '', headers = [], rows = [] }) {
  const rtl = lang !== 'en';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const primary = settings.primaryColor || '#c8891f';
  const accent = settings.accentColor || '#1f2d3d';

  const companyName = rtl
    ? (settings.companyName && settings.companyName !== 'نظام بِناء' ? settings.companyName : (settings.companyNameEn || ''))
    : (settings.companyNameEn && settings.companyNameEn !== 'Binaa System' ? settings.companyNameEn : (settings.companyName || ''));

  const T = (ar, en) => (rtl ? ar : en);

  const contactBits = [
    settings.address && [settings.address, settings.city].filter(Boolean).join('، '),
    settings.phone && `${T('هاتف', 'Tel')}: ${settings.phone}`,
    settings.email,
    settings.website,
    settings.vatNumber && `${T('الرقم الضريبي', 'VAT')}: ${settings.vatNumber}`,
    settings.crNumber && `${T('س.ت', 'CR')}: ${settings.crNumber}`,
  ].filter(Boolean);

  const headerImg = settings.headerImageUrl
    ? `<img class="banner" src="${esc(settings.headerImageUrl)}" alt="" />`
    : '';

  const footerImg = settings.footerImageUrl
    ? `<img class="banner" src="${esc(settings.footerImageUrl)}" alt="" />`
    : '';

  const logoBlock = settings.logoUrl
    ? `<img class="logo" src="${esc(settings.logoUrl)}" alt="" />`
    : `<div class="logo-fallback" style="background:${accent}">${esc((companyName || 'B').slice(0, 1))}</div>`;

  const th = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td>${esc(c)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  const now = formatDate(new Date().toISOString(), lang);

  const html = `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(heading)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
  @font-face { font-family:'saudi_riyal'; src:url('https://cdn.jsdelivr.net/gh/emran-alhaddad/Saudi-Riyal-Font@1.1.1/fonts/regular/saudi_riyal.woff2') format('woff2'); unicode-range:U+20C1; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body { margin:0; padding:0; }
  body { font-family:'saudi_riyal','Cairo',Arial,sans-serif; color:#0f172a; font-size:12px; }
  .page { padding:0 32px 120px; }
  .banner { display:block; width:100%; object-fit:cover; }

  /* الترويسة */
  .header { display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:20px 0 16px; border-bottom:3px solid ${primary}; }
  .brand { display:flex; align-items:center; gap:14px; }
  .logo { width:64px; height:64px; object-fit:contain; }
  .logo-fallback { width:64px; height:64px; border-radius:14px; color:#fff; font-weight:800;
    font-size:30px; display:flex; align-items:center; justify-content:center; }
  .company-name { font-size:20px; font-weight:800; color:${primary}; line-height:1.2; }
  .company-sub { font-size:11px; color:#64748b; margin-top:2px; }
  .contact { text-align:${rtl ? 'left' : 'right'}; font-size:10.5px; color:#475569; line-height:1.7; max-width:46%; }

  /* شريط العنوان */
  .title-bar { margin:22px 0 14px; display:flex; align-items:flex-end; justify-content:space-between; }
  .title-bar h1 { margin:0; font-size:18px; font-weight:800; color:#0f172a;
    padding-inline-start:12px; border-inline-start:5px solid ${accent}; }
  .title-bar .sub { color:#64748b; font-size:11px; margin-top:4px; padding-inline-start:12px; }
  .title-bar .stamp { text-align:${rtl ? 'left' : 'right'}; color:#64748b; font-size:11px; }
  .title-bar .stamp b { color:#0f172a; }

  /* الجدول */
  table { width:100%; border-collapse:collapse; font-size:11.5px; }
  thead th { background:${primary}; color:#fff; font-weight:700; padding:9px 10px;
    text-align:${align}; white-space:nowrap; }
  thead th:first-child { border-start-start-radius:8px; }
  thead th:last-child { border-start-end-radius:8px; }
  tbody td { padding:8px 10px; text-align:${align}; border-bottom:1px solid #e2e8f0; color:#1e293b; white-space:nowrap; }
  tbody tr:nth-child(even) td { background:#f8fafc; }
  tbody tr:last-child td { border-bottom:2px solid ${primary}; }
  .empty { text-align:center; color:#94a3b8; padding:24px; }

  /* الفوتر الثابت أسفل كل صفحة */
  .footer { position:fixed; bottom:0; left:0; right:0; }
  .footer .line { border-top:2px solid ${primary}; margin:0 32px; }
  .footer .info { display:flex; justify-content:space-between; align-items:center;
    padding:8px 32px 12px; font-size:10px; color:#64748b; }
  @media print { .footer { position:fixed; } }
</style>
</head>
<body>
  ${headerImg}
  <div class="page">
    <div class="header">
      <div class="brand">
        ${logoBlock}
        <div>
          <div class="company-name">${esc(companyName)}</div>
          ${settings.companyNameEn && rtl ? `<div class="company-sub">${esc(settings.companyNameEn)}</div>` : ''}
        </div>
      </div>
      <div class="contact">${contactBits.map(esc).join(' &nbsp;•&nbsp; ')}</div>
    </div>

    <div class="title-bar">
      <div>
        <h1>${esc(heading)}</h1>
        ${subheading ? `<div class="sub">${esc(subheading)}</div>` : ''}
      </div>
      <div class="stamp">
        <div>${T('تاريخ الطباعة', 'Printed')}: <b>${now}</b></div>
        <div>${T('عدد السجلات', 'Records')}: <b>${rows.length}</b></div>
      </div>
    </div>

    <table>
      <thead><tr>${th}</tr></thead>
      <tbody>${trs || `<tr><td class="empty" colspan="${headers.length}">${T('لا توجد سجلات', 'No records')}</td></tr>`}</tbody>
    </table>
  </div>

  <div class="footer">
    <div class="line"></div>
    ${footerImg ? `<div style="padding:0 32px">${footerImg}</div>` : ''}
    <div class="info">
      <span>${esc(companyName)}</span>
      <span>${contactBits.slice(0, 2).map(esc).join(' • ')}</span>
    </div>
  </div>

  <script>window.onload=function(){setTimeout(function(){window.print();},350);}<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=980,height=760');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}

export function printReportDocument({ settings = {}, lang = 'ar', heading = '', subheading = '', summary = [], sections = [] }) {
  const rtl = lang !== 'en';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  // استخدم ألوان الشركة من الإعدادات، أو ألوان افتراضية مطابقة لتصميم الفاتورة
  const primary = settings.primaryColor || '#c8891f';
  const accent = settings.accentColor || '#1f2d3d';
  // اسم الشركة من الإعدادات — لا تستخدم اسم النظام كقيمة افتراضية
  const companyName = rtl
    ? (settings.companyName && settings.companyName !== 'نظام بِناء' ? settings.companyName : (settings.companyNameEn || ''))
    : (settings.companyNameEn && settings.companyNameEn !== 'Binaa System' ? settings.companyNameEn : (settings.companyName || ''));
  const companyNameEn = settings.companyNameEn && settings.companyNameEn !== 'Binaa System' ? settings.companyNameEn : '';
  const T = (ar, en) => (rtl ? ar : en);
  const contactBits = [
    settings.address && [settings.address, settings.city].filter(Boolean).join('، '),
    settings.phone && `${T('هاتف', 'Tel')}: ${settings.phone}`,
    settings.email,
    settings.website,
    settings.vatNumber && `${T('الرقم الضريبي', 'VAT')}: ${settings.vatNumber}`,
    settings.crNumber && `${T('س.ت', 'CR')}: ${settings.crNumber}`,
  ].filter(Boolean);
  const headerImg = settings.headerImageUrl ? `<img class="banner" src="${esc(settings.headerImageUrl)}" alt="" />` : '';
  const footerImg = settings.footerImageUrl ? `<img class="banner" src="${esc(settings.footerImageUrl)}" alt="" />` : '';
  const logoBlock = settings.logoUrl
    ? `<img class="logo" src="${esc(settings.logoUrl)}" alt="" />`
    : `<div class="logo-fallback" style="background:${primary}">${esc((companyName || 'B').slice(0, 1))}</div>`;
  const now = formatDate(new Date().toISOString(), lang);
  const recordCount = sections.reduce((sum, section) => sum + (section.rows?.length || 0) + (section.totals?.length || 0), 0);

  const summaryHtml = summary.length ? `
    <div class="summary-grid">
      ${summary.map(item => `<div class="summary-card"><div class="summary-label">${esc(item.label)}</div><div class="summary-value">${esc(item.value)}</div>${item.note ? `<div class="summary-note">${esc(item.note)}</div>` : ''}</div>`).join('')}
    </div>` : '';

  const sectionsHtml = sections.map(section => {
    const th = (section.headers || []).map(h => `<th>${esc(h)}</th>`).join('');
    const trs = (section.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
    const totalRows = (section.totals || []).map(r => `<tr class="total-row">${r.map((c, i) => `<td${i === 0 && r.colSpan ? ` colspan="${r.colSpan}"` : ''}>${esc(c)}</td>`).join('')}</tr>`).join('');
    return `
      <section class="report-section">
        <h2>${esc(section.title)}</h2>
        ${section.subtitle ? `<p class="section-subtitle">${esc(section.subtitle)}</p>` : ''}
        <table>
          <thead><tr>${th}</tr></thead>
          <tbody>${trs || `<tr><td class="empty" colspan="${(section.headers || []).length}">${T('لا توجد سجلات', 'No records')}</td></tr>`}${totalRows}</tbody>
        </table>
      </section>`;
  }).join('');

  const html = `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(heading)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
  @font-face { font-family:'saudi_riyal'; src:url('https://cdn.jsdelivr.net/gh/emran-alhaddad/Saudi-Riyal-Font@1.1.1/fonts/regular/saudi_riyal.woff2') format('woff2'); unicode-range:U+20C1; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body { margin:0; padding:0; }
  body { font-family:'saudi_riyal','Cairo',Arial,sans-serif; color:#0f172a; font-size:12px; }
  .page { padding:0 32px 120px; }
  .banner { display:block; width:100%; object-fit:cover; }
  .header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 0 16px; border-bottom:3px solid ${primary}; }
  .brand { display:flex; align-items:center; gap:14px; }
  .logo { width:64px; height:64px; object-fit:contain; }
  .logo-fallback { width:64px; height:64px; border-radius:14px; color:#fff; font-weight:800; font-size:30px; display:flex; align-items:center; justify-content:center; }
  .company-name { font-size:20px; font-weight:800; color:${accent}; line-height:1.2; }
  .company-sub { font-size:11px; color:#6b7280; margin-top:2px; font-weight:600; letter-spacing:0.5px; }
  .contact { text-align:${rtl ? 'left' : 'right'}; font-size:10.5px; color:#475569; line-height:1.7; max-width:48%; }
  .title-bar { margin:22px 0 14px; display:flex; align-items:flex-end; justify-content:space-between; gap:16px; }
  .title-bar h1 { margin:0; font-size:19px; font-weight:800; color:#0f172a; padding-inline-start:12px; border-inline-start:5px solid ${accent}; }
  .title-bar .sub { color:#64748b; font-size:11px; margin-top:4px; padding-inline-start:12px; }
  .stamp { text-align:${rtl ? 'left' : 'right'}; color:#64748b; font-size:11px; }
  .stamp b { color:#0f172a; }
  .summary-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:12px 0 20px; }
  .summary-card { border:1px solid #dbeafe; border-top:4px solid ${primary}; border-radius:12px; padding:12px; background:#f8fafc; }
  .summary-label { color:#64748b; font-size:10.5px; margin-bottom:5px; }
  .summary-value { color:#0f172a; font-size:17px; font-weight:800; }
  .summary-note { color:#64748b; font-size:10px; margin-top:3px; }
  .report-section { margin-top:18px; page-break-inside:auto; }
  .report-section h2 { margin:0 0 8px; font-size:14px; font-weight:800; color:${primary}; }
  .section-subtitle { margin:0 0 8px; color:#64748b; font-size:10.5px; }
  table { width:100%; border-collapse:collapse; font-size:11.2px; margin-bottom:8px; }
  thead th { background:${primary}; color:#fff; font-weight:700; padding:8px 9px; text-align:${align}; white-space:nowrap; }
  tbody td { padding:7px 9px; text-align:${align}; border-bottom:1px solid #e2e8f0; color:#1e293b; white-space:nowrap; }
  tbody tr:nth-child(even) td { background:#f8fafc; }
  .total-row td { background:#eef2ff !important; font-weight:800; border-top:2px solid ${primary}; }
  .empty { text-align:center; color:#94a3b8; padding:22px; }
  .footer { position:fixed; bottom:0; left:0; right:0; background:#fff; }
  .footer .line { border-top:2px solid ${primary}; margin:0 32px; }
  .footer .info { display:flex; justify-content:space-between; align-items:center; padding:8px 32px 12px; font-size:10px; color:#64748b; }
  @media print { .footer { position:fixed; } .report-section { break-inside:auto; } }
</style>
</head>
<body>
  ${headerImg}
  <div class="page">
    <div class="header">
      <div class="brand">${logoBlock}<div><div class="company-name">${esc(companyName)}</div>${companyNameEn && rtl ? `<div class="company-sub" dir="ltr">${esc(companyNameEn)}</div>` : ''}</div></div>
      <div class="contact">${contactBits.map(esc).join(' &nbsp;•&nbsp; ')}</div>
    </div>
    <div class="title-bar">
      <div><h1>${esc(heading)}</h1>${subheading ? `<div class="sub">${esc(subheading)}</div>` : ''}</div>
      <div class="stamp"><div>${T('تاريخ الطباعة', 'Printed')}: <b>${now}</b></div><div>${T('عدد السجلات', 'Records')}: <b>${recordCount}</b></div></div>
    </div>
    ${summaryHtml}
    ${sectionsHtml}
  </div>
  <div class="footer"><div class="line"></div>${footerImg ? `<div style="padding:0 32px">${footerImg}</div>` : ''}<div class="info"><span>${esc(companyName)}</span><span>${contactBits.slice(0, 2).map(esc).join(' • ')}</span></div></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);}<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=980,height=760');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}