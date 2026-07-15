import React, { useRef, useState, useEffect } from 'react';
import { Printer, X, Receipt } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { resolveReceiptSettings } from '@/lib/branchSettings';
import ThermalReceiptDocument from '@/components/shared/ThermalReceiptDocument';

// ═══════════════════════════════════════════════════════════════════════
// معاينة وطباعة إيصال حراري بعرض 80mm لطابعات الإيصالات الحرارية.
// الطباعة تُنفّذ عبر نافذة مستقلة بإعدادات @page size: 80mm لتناسب الطابعة.
// هذا المكون بديل InvoicePrintDialog لكنه مخصّص للمطاعم والإيصالات الحرارية.
//
// إن كان الإيصال مرتبطاً بفرع (invoice.projectId) تُدمج إعدادات الفرع
// مع إعدادات الشركة الأم — الأولوية للفرع في كل حقل.
// ═══════════════════════════════════════════════════════════════════════

export default function ReceiptPrintDialog({ open, onOpenChange, invoice }) {
  const { lang } = useStore();
  const { settings: companySettings } = useCompanySettings();
  const printRef = useRef(null);
  const [client, setClient] = useState(null);

  // دمج إعدادات الشركة مع إعدادات الفرع المرتبط بالإيصال (إن وُجد).
  // resolveReceiptSettings دالة async (تتصل بالخادم)، لذا نستخدم useEffect.
  const [settings, setSettings] = useState(companySettings);

  useEffect(() => {
    let active = true;
    const branchId = invoice?.projectId || invoice?.branchId;
    if (!branchId) {
      setSettings(companySettings);
      return;
    }
    (async () => {
      try {
        const resolved = await resolveReceiptSettings(branchId, companySettings);
        if (active) setSettings(resolved);
      } catch {
        if (active) setSettings(companySettings);
      }
    })();
    return () => { active = false; };
  }, [invoice?.projectId, invoice?.branchId, companySettings]);

  // جلب سجل العميل الكامل لعرض تفاصيله (السجل، الرقم الضريبي، الهاتف)
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
    const rtl = lang === 'ar';
    const w = window.open('', '_blank', 'width=380,height=620');
    if (!w) return;
    w.document.write(`
      <html dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}">
        <head>
          <meta charset="utf-8" />
          <title>${invoice.invoiceNo || 'Receipt'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
            @font-face { font-family:'saudi_riyal'; src:url('https://cdn.jsdelivr.net/gh/emran-alhaddad/Saudi-Riyal-Font@1.1.1/fonts/regular/saudi_riyal.woff2') format('woff2'); unicode-range:U+20C1; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            html, body { margin: 0; padding: 0; background: #fff; }
            body { font-family: 'saudi_riyal', 'Cairo', 'Tahoma', sans-serif; color: #000; direction: ${rtl ? 'rtl' : 'ltr'}; }
            .receipt-wrap { width: 80mm; margin: 0 auto; padding: 2mm; }
            img { max-width: 100%; }
            @page { size: 80mm auto; margin: 2mm; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
            }
            @media screen {
              body { background: #f1f5f9; padding: 16px; }
            }
          </style>
        </head>
        <body>
          <div class="receipt-wrap">${content}</div>
          <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] max-h-[92vh] p-0 overflow-hidden">
        <DialogTitle className="sr-only">{t('معاينة الإيصال الحراري', 'Thermal Receipt Preview', lang)}</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50">
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-amber-600" />
            <span className="font-semibold">{t('معاينة الإيصال الحراري', 'Thermal Receipt Preview', lang)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1 bg-amber-600 hover:bg-amber-700">
              <Printer className="size-3.5" />{t('طباعة', 'Print', lang)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}><X className="size-4" /></Button>
          </div>
        </div>

        <div className="overflow-auto max-h-[80vh] bg-slate-100 p-4 flex justify-center">
          <div className="bg-white shadow-md" style={{ width: '300px', padding: '8px' }}>
            <ThermalReceiptDocument invoice={invoice} settings={settings} client={client} lang={lang} innerRef={printRef} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
