import React, { useRef, useState, useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import InvoiceDocument from '@/components/shared/InvoiceDocument';

// معاينة وطباعة فاتورة العميل (مشاريع أو تأجير). الطباعة تُنفّذ عبر نافذة مستقلة
// حتى تخرج الفاتورة وحدها بتنسيق نظيف مطابق لما يظهر في المعاينة.
export default function InvoicePrintDialog({ open, onOpenChange, invoice }) {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const printRef = useRef(null);
  const [client, setClient] = useState(null);

  // جلب سجل العميل الكامل لعرض تفاصيله (السجل، الرقم الضريبي، الهاتف، البريد، العنوان)
  // في الفاتورة — بالمعرّف إن وُجد، وإلا بمطابقة الاسم.
  useEffect(() => {
    let active = true;
    setClient(null);
    if (!invoice) return;
    (async () => {
      try {
        let found = null;
        if (invoice.clientId) {
          found = await base44.entities.Client.get(invoice.clientId).catch(() => null);
        }
        if (!found && invoice.clientName) {
          const matches = await base44.entities.Client.filter({ name: invoice.clientName }).catch(() => []);
          found = matches[0] || null;
        }
        if (active) setClient(found);
      } catch { /* تفاصيل العميل اختيارية */ }
    })();
    return () => { active = false; };
  }, [invoice?.clientId, invoice?.clientName]);

  if (!invoice) return null;

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`
      <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
        <head>
          <meta charset="utf-8" />
          <title>${invoice.invoiceNo || 'Invoice'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
            @font-face { font-family:'saudi_riyal'; src:url('https://cdn.jsdelivr.net/gh/emran-alhaddad/Saudi-Riyal-Font@1.1.1/fonts/regular/saudi_riyal.woff2') format('woff2'); unicode-range:U+20C1; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family:'saudi_riyal','Cairo',sans-serif; color:#111827; padding:28px; margin:0; direction:${lang === 'ar' ? 'rtl' : 'ltr'}; text-align:${lang === 'ar' ? 'right' : 'left'}; }
            img { max-width:100%; }
          </style>
        </head>
        <body><div dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${content}</div></body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold">{t('معاينة الفاتورة', 'Invoice Preview', lang)}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Printer className="size-3.5" />{t('طباعة', 'Print', lang)}</Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}><X className="size-4" /></Button>
          </div>
        </div>

        <div className="overflow-auto max-h-[80vh] bg-muted/30 p-4">
          <div className="bg-white mx-auto max-w-2xl p-8 rounded shadow-sm">
            <InvoiceDocument invoice={invoice} settings={settings} client={client} lang={lang} innerRef={printRef} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}