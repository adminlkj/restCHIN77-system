// طباعة أي HTML في نافذة مستقلة بتنسيق نظيف مطابق للمعاينة، مع خطوط الشركة ورمز الريال.
// ينتظر تحميل كل الصور قبل استدعاء print() لتفادي صفحات فارغة.
export function printHtml(innerHtml, { title = 'Document', lang = 'ar' } = {}) {
  if (!innerHtml) return;
  const w = window.open('', '_blank', 'width=1000,height=760');
  if (!w) return;

  // حوّل أي src نسبي (مثل /api/files/xxx) إلى مطلق حتى يعمل في نافذة الطباعة
  const origin = window.location.origin;
  const absoluteHtml = innerHtml.replace(
    /(<img[^>]+src=["'])\//g,
    `$1${origin}/`
  ).replace(
    /(<img[^>]+src=["'])(?!https?:|data:)/g,
    `$1${origin}/`
  );

  w.document.write(`
    <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          @font-face { font-family:'saudi_riyal'; src:url('https://cdn.jsdelivr.net/gh/emran-alhaddad/Saudi-Riyal-Font@1.1.1/fonts/regular/saudi_riyal.woff2') format('woff2'); unicode-range:U+20C1; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family:'saudi_riyal','Cairo',sans-serif; color:#111827; padding:18px; margin:0; }
          img { max-width:100%; }
          table { border-collapse: collapse; width: 100%; }
          @media print {
            .page-break { page-break-after: always; }
            body { padding: 0; }
            @page { margin: 12mm; }
          }
        </style>
      </head>
      <body>${absoluteHtml}</body>
    </html>
  `);
  w.document.close();
  w.focus();

  // انتظر تحميل كل الصور قبل الطباعة (تفادي الصور الفارغة)
  const waitForImages = (callback, attemptsLeft = 40) => {
    const imgs = Array.from(w.document.images || []);
    const allLoaded = imgs.every(img => img.complete && img.naturalWidth > 0);
    if (allLoaded || attemptsLeft <= 0) {
      // مهلة إضافية قصيرة لرسم الخطوط
      setTimeout(() => { w.print(); }, 200);
    } else {
      setTimeout(() => waitForImages(callback, attemptsLeft - 1), 100);
    }
  };

  // ابدأ بالتحقق بعد فترة قصيرة (تسمح للـ DOM بالت parse)
  setTimeout(() => waitForImages(), 150);
}
