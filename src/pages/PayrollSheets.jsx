import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Printer, Users, User, RefreshCw, FileText, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import ModuleLayout from '@/components/shared/ModuleLayout';
import PayrollDocument, { empNet } from '@/components/shared/PayrollDocument';
import { printHtml } from '@/lib/printDocument';
import { toast } from 'sonner';

const MONTHS = { 1: 'يناير / January', 2: 'فبراير / February', 3: 'مارس / March', 4: 'أبريل / April', 5: 'مايو / May', 6: 'يونيو / June', 7: 'يوليو / July', 8: 'أغسطس / August', 9: 'سبتمبر / September', 10: 'أكتوبر / October', 11: 'نوفمبر / November', 12: 'ديسمبر / December' };
const now = new Date();

export default function PayrollSheets() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('group'); // group | individual
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(now.getFullYear());
  const [dept, setDept] = useState('ALL');
  const [empId, setEmpId] = useState('ALL');
  const printRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const e = await base44.entities.Employee.filter({ status: 'ACTIVE' }, 'code', 200);
      setEmployees(e);
    } catch { toast.error(t('فشل تحميل الموظفين', 'Failed to load employees', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))), [employees]);

  // الموظفون المطابقون للفلاتر
  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (dept !== 'ALL' && e.department !== dept) return false;
      if (mode === 'individual' && empId !== 'ALL' && e.id !== empId) return false;
      return true;
    });
  }, [employees, dept, empId, mode]);

  const totalNet = filtered.reduce((s, e) => s + empNet(e), 0);

  const docTitle = () => (mode === 'individual' ? t('بطاقات رواتب', 'Payslips', lang) : t('كشف رواتب', 'Payroll Sheet', lang));

  const handlePrint = () => {
    if (!filtered.length) return toast.error(t('لا يوجد موظفون مطابقون للفلاتر', 'No employees match the filters', lang));
    printHtml(printRef.current?.innerHTML, { title: docTitle(), lang });
  };

  const handleExport = async () => {
    if (!filtered.length) return toast.error(t('لا يوجد موظفون مطابقون للفلاتر', 'No employees match the filters', lang));
    const el = printRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let remaining = imgH;
      let position = 0;
      pdf.addImage(img, 'PNG', 0, position, pageW, imgH);
      remaining -= pageH;
      while (remaining > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(img, 'PNG', 0, position, pageW, imgH);
        remaining -= pageH;
      }
      pdf.save(`${docTitle()}-${year}-${month}.pdf`);
    } catch {
      toast.error(t('فشل التصدير', 'Export failed', lang));
    }
    setExporting(false);
  };

  return (
    <ModuleLayout
      title={t('كشوفات الرواتب', 'Payroll Sheets', lang)}
      subtitle={t('طباعة كشف رواتب جماعي أو بطاقات رواتب فردية', 'Print a group payroll sheet or individual payslips', lang)}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2"><Download className="size-4" />{exporting ? t('جاري التصدير...', 'Exporting...', lang) : t('تصدير PDF', 'Export PDF', lang)}</Button>
          <Button onClick={handlePrint} className="gap-2 bg-violet-600 hover:bg-violet-700"><Printer className="size-4" />{t('طباعة', 'Print', lang)}</Button>
        </div>
      }
    >
      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <Label>{t('نوع الكشف', 'Sheet Type', lang)}</Label>
            <div className="flex gap-1 rounded-lg border p-1">
              <button onClick={() => setMode('group')} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'group' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                <Users className="size-4" />{t('جماعي', 'Group', lang)}
              </button>
              <button onClick={() => setMode('individual')} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'individual' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                <User className="size-4" />{t('فردي', 'Individual', lang)}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('الشهر', 'Month', lang)}</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MONTHS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('السنة', 'Year', lang)}</Label>
            <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || now.getFullYear())} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('القسم', 'Department', lang)}</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('كل الأقسام', 'All Departments', lang)}</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('الموظف', 'Employee', lang)}</Label>
            <Select value={empId} onValueChange={setEmpId} disabled={mode !== 'individual'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('كل الموظفين', 'All Employees', lang)}</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.code} — {lang === 'ar' ? (e.nameAr || e.name) : e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
          <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2 text-center">
            <p className="text-lg font-bold text-violet-700">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">{t('موظف مطابق', 'Matching', lang)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-center">
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalNet, lang)}</p>
            <p className="text-xs text-muted-foreground">{t('إجمالي الصافي', 'Total Net', lang)}</p>
          </div>
        </div>
      </Card>

      {/* Live preview */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{t('معاينة الكشف', 'Sheet Preview', lang)}</span>
        </div>
        <div className="overflow-auto max-h-[70vh] bg-muted/20 p-4">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">{t('لا يوجد موظفون مطابقون للفلاتر', 'No employees match the filters', lang)}</div>
          ) : (
            <div className="bg-white mx-auto max-w-3xl p-8 rounded shadow-sm">
              <PayrollDocument
                mode={mode}
                employees={filtered}
                settings={settings}
                lang={lang}
                month={parseInt(month)}
                year={year}
                innerRef={printRef}
              />
            </div>
          )}
        </div>
      </Card>
    </ModuleLayout>
  );
}