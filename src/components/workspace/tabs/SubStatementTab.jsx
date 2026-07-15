import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';

// كشف حساب مقاول الباطن: المستحقات (مستخلصات) − الغرامات المطبّقة − المدفوعات = الرصيد.
export default function SubStatementTab({ invoices = [], payments = [], penalties = [] }) {
  const { lang } = useStore();

  const payableInvoices = invoices.filter(r => ['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(r.status));
  const totalInvoiced = payableInvoices.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalPenalties = penalties.filter(p => p.status === 'APPLIED').reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = payments.reduce((s, r) => s + (r.amount || 0), 0);
  const balance = totalInvoiced - totalPenalties - totalPaid;

  // بناء سطور موحّدة مرتبة بالتاريخ.
  const rows = [
    ...payableInvoices.map(r => ({ date: r.date, type: t('مستخلص معتمد', 'Approved Invoice', lang), ref: r.invoiceNo, credit: r.totalAmount || 0, debit: 0 })),
    ...penalties.filter(p => p.status === 'APPLIED').map(r => ({ date: r.date, type: t('غرامة', 'Penalty', lang), ref: r.penaltyNo, credit: 0, debit: r.amount || 0 })),
    ...payments.map(r => ({ date: r.date, type: t('دفعة', 'Payment', lang), ref: r.paymentNo, credit: 0, debit: r.amount || 0 })),
  ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  let running = 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-t-4 border-t-blue-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي المستخلصات', 'Total Invoiced', lang)}</p><p className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(totalInvoiced, lang)}</p></CardContent></Card>
        <Card className="border-t-4 border-t-rose-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('الغرامات المطبّقة', 'Applied Penalties', lang)}</p><p className="text-lg font-bold text-rose-600 mt-1">{formatCurrency(totalPenalties, lang)}</p></CardContent></Card>
        <Card className="border-t-4 border-t-emerald-500"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي المدفوع', 'Total Paid', lang)}</p><p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(totalPaid, lang)}</p></CardContent></Card>
        <Card className={`border-t-4 ${balance > 0 ? 'border-t-amber-500' : 'border-t-teal-500'}`}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t('الرصيد المستحق للمقاول', 'Balance Due', lang)}</p><p className={`text-lg font-bold mt-1 ${balance > 0 ? 'text-amber-600' : 'text-teal-600'}`}>{formatCurrency(balance, lang)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('حركة كشف الحساب', 'Account Ledger', lang)}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                  <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                  <TableHead>{t('المرجع', 'Reference', lang)}</TableHead>
                  <TableHead className="text-end">{t('مستحق (له)', 'Credit', lang)}</TableHead>
                  <TableHead className="text-end">{t('مدفوع/خصم (عليه)', 'Debit', lang)}</TableHead>
                  <TableHead className="text-end">{t('الرصيد', 'Balance', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد حركات', 'No transactions', lang)}</TableCell></TableRow>
                ) : rows.map((r, i) => {
                  running += (r.credit - r.debit);
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                      <TableCell className="text-sm">{r.type}</TableCell>
                      <TableCell className="font-mono text-xs">{r.ref || '—'}</TableCell>
                      <TableCell className="text-end text-emerald-600">{r.credit ? formatCurrency(r.credit, lang) : '—'}</TableCell>
                      <TableCell className="text-end text-rose-600">{r.debit ? formatCurrency(r.debit, lang) : '—'}</TableCell>
                      <TableCell className="text-end font-medium">{formatCurrency(running, lang)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}