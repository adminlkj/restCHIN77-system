import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, FileDown } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { printDocument } from '@/lib/printTemplate';

/**
 * Shared print + CSV-export toolbar for any data table.
 *
 * Props:
 *  - columns: [{ header:{ar,en}|string, value:(row)=>string|number }]
 *  - rows: array of records to print/export
 *  - title: { ar, en } | string  — heading shown on the printed page & file name
 *  - fileName: optional base name for the CSV file (defaults to the title)
 *  - subheading: optional { ar, en } | string shown under the printed heading (filter/period)
 */
export default function TableToolbar({ columns, rows, title, fileName, subheading }) {
  const { lang } = useStore();
  const { settings } = useCompanySettings();

  const label = (h) => (typeof h === 'string' ? h : t(h.ar, h.en, lang));
  const heading = typeof title === 'string' ? title : t(title.ar, title.en, lang);
  const base = (fileName || heading || 'export').replace(/[^\p{L}\p{N}_-]+/gu, '_');

  const cell = (row, col) => {
    const v = col.value(row);
    return v === null || v === undefined ? '' : String(v);
  };

  const exportCsv = () => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const header = columns.map((c) => esc(label(c.header))).join(',');
    const body = rows.map((r) => columns.map((c) => esc(cell(r, c))).join(',')).join('\n');
    // BOM so Excel reads Arabic/UTF-8 correctly.
    const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    printDocument({
      settings,
      lang,
      heading,
      subheading: subheading ? (typeof subheading === 'string' ? subheading : t(subheading.ar, subheading.en, lang)) : '',
      headers: columns.map((c) => label(c.header)),
      rows: rows.map((r) => columns.map((c) => cell(r, c))),
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={print} className="gap-1.5" disabled={!rows.length}>
        <Printer className="size-4" /> {t('طباعة', 'Print', lang)}
      </Button>
      <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5" disabled={!rows.length}>
        <FileDown className="size-4" /> {t('تصدير', 'Export', lang)}
      </Button>
    </div>
  );
}