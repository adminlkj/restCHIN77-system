import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import PartyStatementSection from '@/components/partners/PartyStatementSection';
import { toast } from 'sonner';

export default function PartnerFollowUp() {
  const { lang } = useStore();
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cl, sp] = await Promise.all([
          base44.entities.Client.list('name', 1000),
          base44.entities.Supplier.list('name', 1000),
        ]);
        setClients(cl || []);
        setSuppliers(sp || []);
      } catch (err) {
        toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load', lang));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <ModuleLayout
      title={t('متابعة العملاء والموردين', 'Clients & Suppliers Follow-up', lang)}
      subtitle={t('أرصدة وكشوفات العملاء والموردين من القيود المرحّلة', 'Balances and statements from posted journal entries', lang)}
    >
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</div>
      ) : (
        <Tabs defaultValue="clients" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <TabsList>
            <TabsTrigger value="clients">{t('العملاء', 'Clients', lang)}</TabsTrigger>
            <TabsTrigger value="suppliers">{t('الموردون', 'Suppliers', lang)}</TabsTrigger>
          </TabsList>
          <TabsContent value="clients" className="mt-4"><PartyStatementSection partyType="CLIENT" parties={clients} /></TabsContent>
          <TabsContent value="suppliers" className="mt-4"><PartyStatementSection partyType="SUPPLIER" parties={suppliers} /></TabsContent>
        </Tabs>
      )}
    </ModuleLayout>
  );
}