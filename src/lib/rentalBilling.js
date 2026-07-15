// أدوات فوترة التأجير: اشتقاق الشهر، جمع الساعات، وحساب تاريخ الاستحقاق.

// يحوّل تاريخاً إلى مفتاح شهر YYYY-MM.
export const monthKey = (dateStr) => (dateStr ? String(dateStr).slice(0, 7) : '');

// حدود الشهر (اليوم الأول والأخير) لمفتاح YYYY-MM.
export const monthBounds = (ymKey) => {
  if (!ymKey) return { from: '', to: '' };
  const [y, m] = ymKey.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
};

// تسمية عربية/إنجليزية لشهر العمل.
export const monthLabel = (ymKey, lang) => {
  if (!ymKey) return '';
  const [y, m] = ymKey.split('-').map(Number);
  const namesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const d = new Date(y, m - 1, 1);
  const nameEn = d.toLocaleString('en-US', { month: 'long' });
  return lang === 'ar' ? `${namesAr[m - 1]} ${y}` : `${nameEn} ${y}`;
};

// آخر 12 شهراً كخيارات لقائمة شهر العمل.
export const recentMonths = (count = 12) => {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

// جمع ساعات التشغيل الواقعة داخل مفتاح الشهر.
export const sumHoursForMonth = (hoursRows, ymKey) => {
  const { from, to } = monthBounds(ymKey);
  return hoursRows
    .filter(r => r.date && r.date >= from && r.date <= to)
    .reduce((s, r) => s + (Number(r.hours) || 0), 0);
};

// تاريخ الاستحقاق = تاريخ الفاتورة + عدد أيام الشرط.
export const addDays = (dateStr, days) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
};