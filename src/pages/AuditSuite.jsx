import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, PlayCircle, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { loadAuditData, runAudit, AUDIT_GROUPS } from '@/lib/auditEngine';

// شاشة مجموعة التحقق المحاسبي: تشغّل الـ invariants وتعرض تقرير سلامة المحرك.
export default function AuditSuite() {
  const { lang } = useStore();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const run = async () => {
    setRunning(true);
    try {
      const data = await loadAuditData();
      setReport(runAudit(data));
    } finally {
      setRunning(false);
    }
  };

  const groups = Object.keys(AUDIT_GROUPS);

  return (
    <ModuleLayout
      title={t('التحقق المحاسبي', 'Accounting Audit', lang)}
      subtitle={t('فحص سلامة المحرك المحاسبي واتساق التقارير تلقائياً', 'Automated engine integrity & consistency checks', lang)}
      actions={
        <Button onClick={run} disabled={running} className="gap-2">
          {running ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          {t('تشغيل الفحص', 'Run Audit', lang)}
        </Button>
      }
    >
      {!report && !running && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShieldCheck className="size-12 mx-auto mb-3 text-muted-foreground/40" />
            <p>{t('اضغط "تشغيل الفحص" لفحص سلامة المحرك المحاسبي على البيانات الفعلية.', 'Press "Run Audit" to validate the accounting engine against live data.', lang)}</p>
          </CardContent>
        </Card>
      )}

      {running && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Loader2 className="size-10 mx-auto mb-3 animate-spin text-emerald-600" />
            <p>{t('جاري تشغيل الفحوصات...', 'Running checks...', lang)}</p>
          </CardContent>
        </Card>
      )}

      {report && !running && (
        <>
          {/* بطاقة الحالة النهائية */}
          <Card className={`border-t-4 ${report.productionReady ? 'border-t-emerald-500' : 'border-t-rose-500'}`}>
            <CardContent className="p-6 flex items-center gap-4">
              {report.productionReady
                ? <ShieldCheck className="size-12 text-emerald-600 shrink-0" />
                : <ShieldAlert className="size-12 text-rose-600 shrink-0" />}
              <div className="flex-1">
                <p className={`text-xl font-bold ${report.productionReady ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {report.productionReady
                    ? t('المحرك المحاسبي سليم ✓', 'Engine is sound ✓', lang)
                    : t('توجد انحرافات — غير جاهز للإنتاج', 'Deviations found — not production ready', lang)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(`نجح ${report.passedCount} من ${report.totalCount} فحص`, `${report.passedCount} of ${report.totalCount} checks passed`, lang)}
                  {report.errorCount > 0 && ` · ${t(`${report.errorCount} خطأ`, `${report.errorCount} errors`, lang)}`}
                  {report.warningCount > 0 && ` · ${t(`${report.warningCount} تحذير`, `${report.warningCount} warnings`, lang)}`}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* الفحوصات مجمّعة */}
          {groups.map(g => {
            const rows = report.results.filter(r => r.group === g);
            if (!rows.length) return null;
            return (
              <Card key={g}>
                <div className="px-5 py-3 border-b bg-muted/30">
                  <h3 className="font-semibold text-sm">{t(AUDIT_GROUPS[g].ar, AUDIT_GROUPS[g].en, lang)}</h3>
                </div>
                <CardContent className="p-0 divide-y">
                  {rows.map(r => (
                    <div key={r.id} className="flex items-start gap-3 px-5 py-3">
                      {r.passed
                        ? <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                        : r.severity === 'warn'
                          ? <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                          : <XCircle className="size-5 text-rose-600 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className={`text-xs mt-0.5 ${r.passed ? 'text-muted-foreground' : r.severity === 'warn' ? 'text-amber-600' : 'text-rose-600'}`}>{r.detail}</p>
                        {r.samples?.length > 0 && !r.passed && (
                          <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{t('أمثلة:', 'e.g.:', lang)} {r.samples.join('، ')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </ModuleLayout>
  );
}