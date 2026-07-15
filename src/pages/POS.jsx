import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Minus, X, Search, Printer, Receipt as ReceiptIcon, Pause,
  CreditCard, Banknote, Clock, UtensilsCrossed, LogOut,
  ShoppingCart, Trash2, Truck, ShieldCheck,
  CupSoda, Cake, Soup, FolderPlus, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import {
  t, formatCurrency, formatDate, genInvoiceNo,
} from '@/lib/utils-binaa';
import { calcVAT, OperationEngine } from '@/lib/businessEngine';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getBranchSettings, resolveReceiptSettings } from '@/lib/branchSettings';
import {
  saveDraftToTable, getTableDraft, clearTableDraft,
} from '@/lib/tables';
import ReceiptPrintDialog from '@/components/shared/ReceiptPrintDialog';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// POS — نقطة البيع: شاشة مقسّمة (منتجات يسار / إيصال يمين) كاملة الارتفاع.
// يقرأ الطاولة النشطة من localStorage['pos-active-table'] (يضبطها Tables.jsx).
//
// المزايا الخمس:
//   1) خصم الزبائن المسجّلين (discountPercentage) — تلقائياً عند اختيار الزبون
//   2) حقل رسوم توصيل — يظهر فقط للطلبات الخارجية (SERVICE)
//   3) اختيار منصة التوصيل (DeliveryPlatform) — مع احتساب العمولة كمعلومة
//   4) حفظ تلقائي للمسودة في الطاولة (DRAFT) — مع استئناف عند العودة
//   5) إلغاء بكلمة مرور مشرف — مع استثناء المالك
//
// تنقّق المنتجات: عرض شبكة الأقسام أولاً → اختيار قسم → عرض وجباته.
// البحث يطغي على اختيار القسم ويعرض نتائج مسطّحة من كل الأقسام.
// ═══════════════════════════════════════════════════════════════════════

// اختيار أيقونة القسم حسب الاسم (عربي/إنجليزي)
const getCategoryIcon = (catName) => {
  const n = (catName || '').toLowerCase();
  if (n.includes('مشروب') || n.includes('bever')) return CupSoda;
  if (n.includes('حلو') || n.includes('dessert')) return Cake;
  if (n.includes('مقبل') || n.includes('appet')) return Soup;
  if (n.includes('رئيسي') || n.includes('main')) return UtensilsCrossed;
  return FolderPlus;
};

// لوحة ألوان تقدم لمسة بصرية مميزة لكل بطاقة قسم
const CATEGORY_TONES = [
  { bg: 'from-amber-400 to-orange-500',  ring: 'ring-amber-200',  icon: 'bg-white/20' },
  { bg: 'from-emerald-400 to-teal-500',  ring: 'ring-emerald-200', icon: 'bg-white/20' },
  { bg: 'from-rose-400 to-pink-500',     ring: 'ring-rose-200',   icon: 'bg-white/20' },
  { bg: 'from-blue-400 to-indigo-500',   ring: 'ring-blue-200',   icon: 'bg-white/20' },
  { bg: 'from-violet-400 to-purple-500', ring: 'ring-violet-200', icon: 'bg-white/20' },
  { bg: 'from-cyan-400 to-sky-500',      ring: 'ring-cyan-200',   icon: 'bg-white/20' },
  { bg: 'from-lime-400 to-green-500',    ring: 'ring-lime-200',   icon: 'bg-white/20' },
  { bg: 'from-fuchsia-400 to-pink-500',  ring: 'ring-fuchsia-200', icon: 'bg-white/20' },
];
const toneFor = (idx) => CATEGORY_TONES[idx % CATEGORY_TONES.length];

// طرق الدفع المتاحة في نقطة البيع.
// الدفع الآجل (CREDIT) حصري لعملاء المنصات — لا يُعرض كزر في القسم العام.
// لا توجد محافظ إلكترونية — فقط نقداً وبطاقات (مدى/فيزا/ماستركارد/أخرى).
const PAYMENT_METHODS = [
  { key: 'CASH',       ar: 'نقداً',     en: 'Cash',       Icon: Banknote,    color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { key: 'CARD_MADA',  ar: 'مدى',       en: 'Mada',       Icon: CreditCard,  color: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'CARD_VISA',  ar: 'فيزا',      en: 'Visa',       Icon: CreditCard,  color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'CARD_MC',    ar: 'ماستركارد', en: 'Mastercard', Icon: CreditCard,  color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: 'CARD_OTHER', ar: 'بطاقة أخرى', en: 'Other Card', Icon: CreditCard,  color: 'bg-slate-100 text-slate-700 border-slate-300' },
];

// ─── Feature 5: كلمات مرور المشرف المقبولة عند الإلغاء ───────────────
const SUPERVISOR_PASSWORDS = ['admin', '123456', 'faisal.11223344'];
const OWNER_EMAIL = 'fysl71443@gmail.com';
const MAX_CANCEL_ATTEMPTS = 3;

// قيمة sentinel لخيار "توصيل مباشر" في القائمة المنسدلة (Radix لا يقبل قيمة فارغة)
const DIRECT_PLATFORM_VALUE = '__direct__';

const POS_ACTIVE_TABLE_KEY = 'pos-active-table';

function readActiveTable() {
  try {
    const raw = localStorage.getItem(POS_ACTIVE_TABLE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearActiveTable() {
  try { localStorage.removeItem(POS_ACTIVE_TABLE_KEY); } catch { /* ignore */ }
}

export default function POS() {
  const { lang, activeProjectId, activeProjectName, setActiveItem } = useStore();
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const cashier = user?.full_name || (lang === 'ar' ? 'الكاشير' : 'Cashier');
  const isOwner = (user?.email || '').toLowerCase() === OWNER_EMAIL;

  // ─── حالة ───────────────────────────────────────────────────────────
  const [cart, setCart] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [search, setSearch] = useState('');
  // null = اعرض شبكة الأقسام، '__all__' = اعرض كل الأصناف، categoryId = اعرض أصناف قسم محدد
  const [activeCategoryView, setActiveCategoryView] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  // Feature 1: نخزّن كائن الزبون الكامل للوصول إلى discountPercentage و isCash
  const [customer, setCustomer] = useState(null);
  const [payments, setPayments] = useState([]); // [{ method, amount }]
  const [cashReceived, setCashReceived] = useState('');
  const [printReceipt, setPrintReceipt] = useState(null); // invoice object
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [activeTable, setActiveTable] = useState(() => readActiveTable());

  // Feature 2 & 3: نوع الإيصال (CONSTRUCTION=صالة, SERVICE=توصيل) + رسوم التوصيل + المنصة
  const [invoiceType, setInvoiceType] = useState('CONSTRUCTION'); // CONSTRUCTION=dine-in, SERVICE=delivery
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [platformId, setPlatformId] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [notes, setNotes] = useState('');

  // Feature 5: حالة حوار الإلغاء بكلمة مرور المشرف
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelAttempts, setCancelAttempts] = useState(0);
  const [cancelError, setCancelError] = useState('');

  // مرجع يمنع تكرار تحميل المسودة عند العودة للطاولة نفسها
  const draftLoadedRef = useRef(false);
  // مرجع يمنع تشغيل الـ auto-clear عند الخروج المتعمّد (hold/cancel/print)
  const skipAutoClearRef = useRef(false);

  // اسم الفرع من إعدادات الفرع (المدمجة مع إعدادات الشركة)
  const branchSettings = useMemo(
    () => activeProjectId ? getBranchSettings(activeProjectId) : {},
    [activeProjectId]
  );
  const branchLabel = activeProjectName || branchSettings.branchName || t('الفرع', 'Branch', lang);
  const tableLabel = activeTable?.tableName || t('طاولة', 'Table', lang);

  // ─── تحميل المنتجات والزبائن والمنصات ───────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      setMenuLoading(true);
      try {
        // حمّل الأقسام والأصناف معاً — الأقسام مرتّبة حسب sortOrder
        const [cats, items] = await Promise.all([
          base44.entities.MenuCategory.filter({ isActive: true }),
          base44.entities.InventoryItem.filter({ isActive: true }),
        ]);
        if (!active) return;
        const sortedCats = (cats || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setCategories(sortedCats);
        setMenuItems(Array.isArray(items) ? items : []);
      } catch (e) {
        console.warn('Menu load failed:', e);
        if (!active) return;
        setCategories([]);
        setMenuItems([]);
      } finally {
        if (active) setMenuLoading(false);
      }

      // الزبائن (اختياري)
      try {
        const cs = await base44.entities.Client.list();
        if (active && Array.isArray(cs)) setCustomers(cs);
      } catch { /* الزبائن اختياريون */ }

      // Feature 3: منصات التوصيل — فقط المنصات ذات العمولة (>0)
      // خيار "توصيل مباشر" يُضاف افتراضياً في القائمة المنسدلة (بلا عمولة)
      try {
        const ps = await base44.entities.DeliveryPlatform.filter({ isActive: true });
        if (active && Array.isArray(ps) && ps.length) {
          const filtered = ps.filter(p => (parseFloat(p.commissionRate) || 0) > 0);
          setPlatforms(filtered);
        } else if (active) {
          setPlatforms([]);
        }
      } catch {
        if (active) setPlatforms([]);
      }
    })();
    return () => { active = false; };
  }, []);

  // ─── Feature 4: استئناف المسودة المحفوظة في الطاولة عند فتح POS ────
  useEffect(() => {
    if (draftLoadedRef.current) return;
    if (!activeTable?.tableId) { draftLoadedRef.current = true; return; }
    if (menuLoading) return; // انتظر تحميل القائمة والزبائن

    const draft = getTableDraft(activeTable.tableId);
    if (draft && Array.isArray(draft.cart) && draft.cart.length > 0) {
      // منع تشغيل الـ auto-clear عند استعادة السلة
      skipAutoClearRef.current = true;
      setCart(draft.cart);
      setCustomerId(draft.customerId || '');
      setCustomerName(draft.customerName || '');
      setInvoiceType(draft.invoiceType || 'CONSTRUCTION');
      setPlatformId(draft.platformId || '');
      setDeliveryFee(typeof draft.deliveryFee === 'number' ? draft.deliveryFee : 0);
      setNotes(draft.notes || '');
      if (draft.customerId) {
        const c = (customers || []).find(c => c.id === draft.customerId);
        if (c) setCustomer(c);
      }
      toast.info(t('تم استئناف المسودة المحفوظة', 'Resumed saved draft', lang));
      // حرّر العلم بعد لحظة كافية ليتحقق الـ auto-save من السلة غير الفارغة
      setTimeout(() => { skipAutoClearRef.current = false; }, 100);
    }
    draftLoadedRef.current = true;
  }, [menuLoading, customers, activeTable?.tableId, lang]);

  // ─── Feature 4: حفظ تلقائي للمسودة (debounced 500ms) ─────────────────
  useEffect(() => {
    if (!activeTable?.tableId) return;

    const tid = setTimeout(() => {
      if (skipAutoClearRef.current) return;
      const discountPct = (customer && !customer.isCash)
        ? (parseFloat(customer.discountPercentage) || 0)
        : 0;

      if (cart.length > 0) {
        // حفظ/تحديث المسودة في الطاولة — تُصبح الطاولة DRAFT تلقائياً
        try {
          saveDraftToTable(activeTable.tableId, {
            cart,
            customerId,
            customerName,
            invoiceType,
            platformId,
            deliveryFee,
            discountPercentage: discountPct,
            notes,
          });
        } catch { /* ignore */ }
      } else {
        // السلة فارغة + الطاولة لها مسودة → حرّر الطاولة
        const draft = getTableDraft(activeTable.tableId);
        if (draft) {
          try { clearTableDraft(activeTable.tableId); } catch { /* ignore */ }
          toast.success(t('تم تحرير الطاولة — السلة فارغة', 'Table freed — cart is empty', lang));
        }
      }
    }, 500);

    return () => clearTimeout(tid);
  }, [
    cart, customerId, customerName, invoiceType, platformId,
    deliveryFee, notes, customer, activeTable?.tableId, lang,
  ]);

  // ─── فلترة المنتجات ─────────────────────────────────────────────────
  // - عند البحث: تجاهل فلتر القسم واعرض نتائج مسطّحة من كل الأقسام
  // - عند اختيار قسم محدد: اعرض أصنافه فقط
  // - '__all__' أو لا شيء (مع عدم بحث): يُعالج في العرض
  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchSearch = !q ||
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.nameEn || '').toLowerCase().includes(q) ||
        String(item.code || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
      // عند البحث، أظهر نتائج من كل الأقنام
      if (q) return true;
      // بدون بحث: اعرض فقط أصناف القسم المختار (أو الكل إن اختار "__all__")
      if (activeCategoryView === null) return false; // لا قائمة هنا — عرض الأقسام
      if (activeCategoryView === '__all__') return true;
      return item.categoryId === activeCategoryView;
    });
  }, [menuItems, activeCategoryView, search]);

  // عدد الأصناف لكل قسم — لعرضه على بطاقة القسم
  const countByCategory = useMemo(() => {
    const m = new Map();
    menuItems.forEach((it) => {
      const k = it.categoryId || '__none__';
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [menuItems]);

  // هل نحن في وضع عرض شبكة الأقسام؟ (لا بحث + لا قسم مختار)
  const showCategoriesGrid = !search.trim() && activeCategoryView === null;

  // ─── عربة التسوّق ───────────────────────────────────────────────────
  const addToCart = (item) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.itemId === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        nameEn: item.nameEn || '',
        price: parseFloat(item.salePrice ?? item.unitCost) || 0,
        qty: 1,
      }];
    });
  };

  const changeQty = (itemId, delta) => {
    setCart(prev => prev
      .map(c => c.itemId === itemId ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    );
  };

  const setQty = (itemId, qty) => {
    const q = Math.max(0, parseInt(qty) || 0);
    if (q === 0) {
      setCart(prev => prev.filter(c => c.itemId !== itemId));
    } else {
      setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, qty: q } : c));
    }
  };

  const removeItem = (itemId) => {
    setCart(prev => prev.filter(c => c.itemId !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setPayments([]);
    setCashReceived('');
    setInvoiceType('CONSTRUCTION');
    setDeliveryFee(0);
    setPlatformId('');
    setNotes('');
    setCustomer(null);
    setCustomerId('');
    setCustomerName('');
  };

  // ─── Feature 1: الخصم + Feature 2: رسوم التوصيل + Feature 3: العمولة ─
  const discountPercentage = useMemo(() => {
    if (!customer || customer.isCash) return 0;
    return parseFloat(customer.discountPercentage) || 0;
  }, [customer]);

  const discountAmount = useMemo(
    () => +(subtotal_raw(cart) * (discountPercentage / 100)).toFixed(2),
    [cart, discountPercentage]
  );

  const isDelivery = invoiceType === 'SERVICE';
  const effectiveDeliveryFee = isDelivery ? (parseFloat(deliveryFee) || 0) : 0;

  // المنصة المختارة (إن وُجدت)
  const selectedPlatform = useMemo(
    () => platforms.find(p => p.id === platformId) || null,
    [platformId, platforms]
  );

  // هل هذا طلب عبر منصة توصيل؟ (توصيل + منصة محددة وليست "توصيل مباشر")
  // مبيعات المنصات دائماً آجلة — تُحصّل لاحقاً عبر كشف المنصة.
  const isPlatformSale = isDelivery && !!platformId && !!selectedPlatform;

  // subtotal
  const subtotal = useMemo(
    () => subtotal_raw(cart),
    [cart]
  );

  // القاعدة الخاضعة للضريبة = subtotal - discount + deliveryFee
  const vatBase = useMemo(
    () => Math.max(0, subtotal - discountAmount + effectiveDeliveryFee),
    [subtotal, discountAmount, effectiveDeliveryFee]
  );

  const vatCalc = useMemo(() => calcVAT(vatBase, 0.15), [vatBase]);
  const total = vatCalc.total; // = vatBase + vat

  // عمولة المنصة (للمعلومة فقط — لا تُخصم من الإجمالي)
  const platformCommission = useMemo(() => {
    if (!isDelivery || !selectedPlatform) return 0;
    const rate = parseFloat(selectedPlatform.commissionRate) || 0;
    if (rate <= 0) return 0;
    return +(total * (rate / 100)).toFixed(2);
  }, [isDelivery, selectedPlatform, total]);

  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments]
  );
  const change = totalPaid > total ? totalPaid - total : 0;
  // مبيعات المنصات آجلة دائماً — تُعتبر "مكتملة الدفع" تلقائياً لتمكين طباعة الإيصال
  // لكن paidAmount الفعلي = 0 (تُحصّل لاحقاً عبر كشف المنصة).
  const isFullyPaid = isPlatformSale
    ? (total > 0)
    : (totalPaid >= total && total > 0);

  // ─── المدفوعات ──────────────────────────────────────────────────────
  const addPayment = (method, amount = null) => {
    const amt = amount !== null ? amount : parseFloat(cashReceived);
    if (!amt || amt <= 0) {
      toast.error(t('أدخل مبلغاً صحيحاً', 'Enter a valid amount', lang));
      return;
    }
    const remaining = total - totalPaid;
    if (amt > remaining + 0.01 && method !== 'CREDIT') {
      toast.info(t('المبلغ أكبر من المتبقي — الباقي للزبون', 'Amount exceeds remaining — change due', lang));
    }
    setPayments(prev => [...prev, { method, amount: +amt.toFixed(2) }]);
    setCashReceived('');
  };

  const removePayment = (idx) => {
    setPayments(prev => prev.filter((_, i) => i !== idx));
  };

  // ─── إجراءات ────────────────────────────────────────────────────────
  const exitToTables = () => {
    clearActiveTable();
    setActiveItem('tables');
  };

  // طباعة طلب المطبخ (إيصال داخلي للمنتجات فقط — بلا أسعار)
  const printOrder = () => {
    if (!cart.length) {
      toast.error(t('السلة فارغة', 'Cart is empty', lang));
      return;
    }
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) {
      toast.error(t('الرجاء السماح بالنوافذ المنبثقة', 'Please allow pop-ups', lang));
      return;
    }
    const rtl = lang === 'ar';
    const itemsHtml = cart.map((c, i) => `
      <tr>
        <td style="padding:4px 6px; border-bottom:1px dashed #ccc;">${i + 1}</td>
        <td style="padding:4px 6px; border-bottom:1px dashed #ccc; font-weight:700;">${c.name}</td>
        <td style="padding:4px 6px; border-bottom:1px dashed #ccc; text-align:center; font-weight:700;">${c.qty}</td>
      </tr>
    `).join('');
    w.document.write(`
      <html dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}">
        <head><meta charset="utf-8"><title>${t('طلب المطبخ', 'Kitchen Order', lang)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
          body { font-family:'Cairo','Tahoma',sans-serif; padding:8px; color:#000; direction:${rtl ? 'rtl' : 'ltr'}; }
          .h { text-align:center; font-size:18px; font-weight:800; }
          .sub { text-align:center; font-size:11px; color:#555; margin-bottom:6px; }
          table { width:100%; border-collapse:collapse; font-size:13px; }
          th { background:#000; color:#fff; padding:6px; font-size:12px; }
          .meta { font-size:11px; color:#555; margin:4px 0 8px; }
          @page { size: 80mm auto; margin: 4mm; }
        </style></head>
        <body>
          <div class="h">${t('طلب المطبخ', 'Kitchen Order', lang)}</div>
          <div class="sub">${branchLabel} — ${tableLabel}</div>
          <div class="meta">
            ${t('التاريخ', 'Date', lang)}: ${formatDate(new Date().toISOString(), lang)} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            ${t('الكاشير', 'Cashier', lang)}: ${cashier}
          </div>
          <table>
            <thead><tr><th>#</th><th>${t('الصنف', 'Item', lang)}</th><th>${t('الكمية', 'Qty', lang)}</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    toast.success(t('تم إرسال طلب المطبخ للطباعة', 'Kitchen order sent to printer', lang));
  };

  // تعليق الطلب — يحفظ المسودة في الطاولة (DRAFT) ويعود لشاشة الطاولات
  const holdInvoice = () => {
    if (!cart.length) {
      toast.error(t('السلة فارغة', 'Cart is empty', lang));
      return;
    }
    // حفظ نهائي للمسودة قبل الخروج (تُصبح الطاولة DRAFT)
    if (activeTable?.tableId) {
      try {
        saveDraftToTable(activeTable.tableId, {
          cart,
          customerId,
          customerName,
          invoiceType,
          platformId,
          deliveryFee,
          discountPercentage,
          notes,
        });
      } catch { /* ignore */ }
    }
    // منع الـ auto-clear من تحرير الطاولة عند إفراغ السلة
    skipAutoClearRef.current = true;
    toast.success(t('تم تعليق الطلب — يمكن استئنافه من الطاولة', 'Order held — can be resumed from the table', lang));
    clearActiveTable();
    setActiveTable(null);
    clearCart();
    setActiveItem('tables');
  };

  // ─── Feature 5: فتح حوار الإلغاء بكلمة مرور المشرف ─────────────────
  const openCancelDialog = () => {
    if (!cart.length) {
      exitToTables();
      return;
    }
    setCancelPassword('');
    setCancelAttempts(0);
    setCancelError('');
    setConfirmCancelOpen(true);
  };

  const performCancel = () => {
    skipAutoClearRef.current = true;
    if (activeTable?.tableId) {
      try { clearTableDraft(activeTable.tableId); } catch { /* ignore */ }
    }
    clearCart();
    setConfirmCancelOpen(false);
    toast.info(t('تم إلغاء الطلب', 'Order cancelled', lang));
    clearActiveTable();
    setActiveTable(null);
    setActiveItem('tables');
  };

  const submitCancelPassword = () => {
    // المالك لا يحتاج كلمة مرور
    if (isOwner) {
      performCancel();
      return;
    }
    if (SUPERVISOR_PASSWORDS.includes(cancelPassword)) {
      performCancel();
      return;
    }
    // كلمة مرور خاطئة
    const nextAttempts = cancelAttempts + 1;
    if (nextAttempts >= MAX_CANCEL_ATTEMPTS) {
      setConfirmCancelOpen(false);
      toast.error(t('تجاوزت المحاولات المسموحة — تم إغلاق النافذة', 'Max attempts exceeded — dialog closed', lang));
      return;
    }
    setCancelAttempts(nextAttempts);
    setCancelError(t('كلمة المرور غير صحيحة', 'Incorrect password', lang));
    setCancelPassword('');
  };

  // ─── حفظ الإيصال + طباعته ─────────────────────────────────────────
  const handlePrintReceipt = async () => {
    if (!cart.length) {
      toast.error(t('السلة فارغة', 'Cart is empty', lang));
      return;
    }
    if (!isFullyPaid) {
      toast.error(t('المبلغ المدفوع أقل من الإجمالي', 'Paid amount is less than total', lang));
      return;
    }

    // بناء الإيصال
    const year = new Date().getFullYear();
    const invoiceNo = genInvoiceNo('INV', year, Date.now() % 10000);
    const lineItems = cart.map(c => ({
      description: c.name,
      descriptionEn: c.nameEn || '',
      qty: c.qty,
      unitPrice: c.price,
      total: +(c.price * c.qty).toFixed(2),
    }));
    // إعدادات الإيصال المدمجة (فرع + شركة) — تُرفق للإيصال للطباعة المستقبلية
    const branchReceiptSettings = activeProjectId
      ? await resolveReceiptSettings(activeProjectId, companySettings)
      : companySettings;
    const platformName = isDelivery
      ? (selectedPlatform?.name || (platformId ? '' : t('توصيل مباشر', 'Direct Delivery', lang)))
      : '';
    const invoice = {
      invoiceNo,
      invoiceType, // CONSTRUCTION=صالة / SERVICE=توصيل
      projectId: activeProjectId || '',
      projectName: activeProjectName || branchLabel,
      clientId: customerId || '',
      clientName: customerName || t('زبون نقدي', 'Cash Customer', lang),
      date: new Date().toISOString(),
      lineItems,
      subtotal: +subtotal.toFixed(2),
      // Feature 1: خصم الزبون
      discountPercentage,
      discountAmount,
      // Feature 2: رسوم التوصيل
      deliveryFee: effectiveDeliveryFee,
      vatRate: 0.15,
      vatAmount: vatCalc.vat,
      totalAmount: total,
      // مبيعات المنصات آجلة دائماً — paidAmount=0 و status=PARTIALLY_PAID
      // تُحصّل لاحقاً عبر كشف/تسوية المنصة.
      paidAmount: isPlatformSale ? 0 : totalPaid,
      status: isPlatformSale ? 'PARTIALLY_PAID' : (isFullyPaid ? 'PAID' : 'PARTIALLY_PAID'),
      description: isPlatformSale
        ? `${t('طلب منصة', 'Platform Order')}: ${platformName}`
        : `${t('طاولة', 'Table', lang)}: ${tableLabel}`,
      // Feature 3: المنصة والعمولة (للمعلومة فقط)
      platformId: isDelivery ? platformId : '',
      platformName,
      platformCommission,
      notes: JSON.stringify({
        tableId: activeTable?.tableId || '',
        tableName: tableLabel,
        payments: isPlatformSale ? [] : payments,
        cashier,
        platform: isDelivery ? { platformId, platformName, platformCommission } : null,
        isPlatformSale,
        deliveryFee: effectiveDeliveryFee,
        discountPercentage,
        items: lineItems,
        branchSettings: branchReceiptSettings,
      }),
      cashier,
      tableNo: tableLabel,
      branchSettings: branchReceiptSettings,
    };

    // محاولة الحفظ على الخادم عبر OperationEngine (يُرحّل القيد المحاسبي)
    let saved = null;
    let backendOk = false;
    try {
      // 1) إنشاء الإيصال كـ DRAFT عبر OperationEngine
      const draftInvoice = { ...invoice, status: 'DRAFT' };
      saved = await OperationEngine.createSalesInvoice(draftInvoice, [], customers);

      // 2) اعتماد الإيصال فوراً ← ترحيل القيد المحاسبي
      if (saved?.id) {
        try {
          await OperationEngine.approveSalesInvoice(saved.id);
        } catch (approveErr) {
          console.warn('Auto-approve failed:', approveErr);
        }

        // 3) لغير مبيعات المنصات: نعليم الإيصال كـ PAID
        if (!isPlatformSale) {
          try {
            await base44.entities.SalesInvoice.update(saved.id, {
              status: 'PAID',
              paidAmount: total,
            });
            saved = { ...saved, status: 'PAID', paidAmount: total };
          } catch (updErr) {
            console.warn('Update to PAID failed:', updErr);
          }
        }
      }
      backendOk = true;
    } catch (e) {
      toast.error(e?.message || t('فشل حفظ الإيصال', 'Failed to save receipt', lang));
      console.error('handlePrintReceipt error:', e);
      return;
    }

    // Feature 4: تحرير الطاولة + مسح المسودة عند إتمام البيع
    skipAutoClearRef.current = true;
    if (activeTable?.tableId) {
      try { clearTableDraft(activeTable.tableId); } catch { /* ignore */ }
    }

    // فتح معاينة الإيصال الحراري
    setPrintReceipt(saved || invoice);

    if (backendOk) {
      toast.success(t('تم حفظ الإيصال وطباعته', 'Receipt saved and printed', lang));
    } else {
      toast.warning(t('تعذر الحفظ على الخادم — معاينة فقط', 'Could not save to server — preview only', lang));
    }

    // تنظيف
    clearCart();
  };

  // ─── عرض ───────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* الرأس العلوي */}
      <div className="shrink-0 border-b bg-white px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className="size-9 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ background: branchSettings.primaryColor || '#d97706' }}
          >
            <UtensilsCrossed className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-foreground text-sm">{branchLabel}</div>
            <div className="text-[11px] text-muted-foreground">
              {branchSettings.posTerminalId && (
                <span dir="ltr" className="font-mono">{branchSettings.posTerminalId}</span>
              )}
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-border mx-1" />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('الطاولة', 'Table', lang)}:</span>
          <span className="font-bold text-foreground bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
            {tableLabel}
          </span>
        </div>

        <div className="h-8 w-px bg-border mx-1" />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('الكاشير', 'Cashier', lang)}:</span>
          <span className="font-semibold text-foreground">{cashier}</span>
        </div>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={exitToTables}
          className="gap-1.5"
        >
          <LogOut className="size-4" />
          {t('خروج', 'Exit', lang)}
        </Button>
      </div>

      {/* الجسم: شبكة منقسمة */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ─── الجزء الأيمن: المنتجات (يسار في RTL) ─── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-50">
          {/* شريط البحث */}
          <div className="shrink-0 p-3 border-b bg-white">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('ابحث عن صنف...', 'Search items...', lang)}
                className="ps-9 h-10"
              />
            </div>
          </div>

          {/* محتوى المنتجات: شبكة الأقسام أو شبكة الأصناف */}
          <div className="flex-1 overflow-y-auto p-3">
            {menuLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="h-28 animate-pulse bg-muted/40" />
                ))}
              </div>
            ) : showCategoriesGrid ? (
              /* ───── عرض شبكة الأقسام ───── */
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FolderPlus className="size-4" />
                  {t('اختر قسماً لتصفّح وجباته', 'Select a category to browse its items', lang)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {/* بطاقة "كل الأصناف" */}
                  <button
                    type="button"
                    onClick={() => setActiveCategoryView('__all__')}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-4 h-32 flex flex-col items-start justify-between text-start shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.98] ring-2 ring-slate-200 hover:ring-slate-400"
                  >
                    <div className="size-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <UtensilsCrossed className="size-6" />
                    </div>
                    <div className="leading-tight">
                      <div className="font-bold text-base">{t('كل الأصناف', 'All Items', lang)}</div>
                      <div className="text-[11px] text-white/80">{t('تصفّح الكل', 'Browse all', lang)}</div>
                    </div>
                    <span className="absolute end-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                      {menuItems.length}
                    </span>
                  </button>

                  {categories.map((cat, idx) => {
                    const Icon = getCategoryIcon(cat.name || cat.nameEn);
                    const tone = toneFor(idx);
                    const count = countByCategory.get(cat.id) || 0;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategoryView(cat.id)}
                        className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${tone.bg} text-white p-4 h-32 flex flex-col items-start justify-between text-start shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.98] ring-2 ${tone.ring} hover:ring-offset-2`}
                      >
                        <div className={`size-10 rounded-lg ${tone.icon} flex items-center justify-center`}>
                          <Icon className="size-6" />
                        </div>
                        <div className="leading-tight">
                          <div className="font-bold text-base line-clamp-1">{cat.name}</div>
                          {cat.nameEn && (
                            <div dir="ltr" className="text-[11px] text-white/80 line-clamp-1 text-start">{cat.nameEn}</div>
                          )}
                        </div>
                        <span className="absolute end-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <ShoppingCart className="size-12 mb-2 opacity-50" />
                <p className="text-sm">{t('لا توجد أصناف', 'No items found', lang)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* زر الرجوع للأقسام (يُخفى أثناء البحث) */}
                {!search.trim() && (
                  <button
                    type="button"
                    onClick={() => setActiveCategoryView(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md px-3 py-1.5 transition-colors"
                  >
                    {lang === 'ar' ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
                    {t('رجوع للأقسام', 'Back to Categories', lang)}
                  </button>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredMenu.map(item => {
                    const price = parseFloat(item.salePrice ?? item.unitCost) || 0;
                    return (
                      <Card
                        key={item.id}
                        onClick={() => addToCart(item)}
                        className="p-3 cursor-pointer hover:shadow-md hover:border-emerald-400 transition-all active:scale-[0.98] flex flex-col gap-1"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-bold text-sm text-foreground leading-tight line-clamp-2">
                            {item.name}
                          </div>
                        </div>
                        {item.nameEn && (
                          <div dir="ltr" className="text-[10px] text-muted-foreground line-clamp-1 text-start">
                            {item.nameEn}
                          </div>
                        )}
                        <div className="mt-auto pt-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-mono">{item.code}</span>
                          <span className="font-bold text-emerald-700 text-sm">
                            {formatCurrency(price, lang)}
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── الجزء الأيسر: الإيصال (يمين في RTL) ─── */}
        <div className="w-[400px] shrink-0 border-s bg-white flex flex-col overflow-hidden">
          {/* رأس الإيصال: زبون + طاولة + نوع الطلب */}
          <div className="shrink-0 p-3 border-b bg-slate-50 space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                {t('الزبون', 'Customer', lang)}:
              </Label>
              <Select
                value={customerId || '__cash__'}
                onValueChange={(v) => {
                  if (v === '__cash__') {
                    setCustomerId('');
                    setCustomerName('');
                    setCustomer(null);
                  } else {
                    const c = customers.find(c => c.id === v);
                    setCustomerId(v);
                    setCustomerName(c?.name || '');
                    setCustomer(c || null);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t('زبون نقدي', 'Cash Customer', lang)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__cash__">{t('زبون نقدي', 'Cash Customer', lang)}</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {!c.isCash && c.discountPercentage > 0
                        ? ` — ${t('خصم', 'Discount', lang)} ${c.discountPercentage}%`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Feature 1: شارة الخصم بجانب اسم الزبون */}
              {customer && !customer.isCash && discountPercentage > 0 && (
                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {t(`خصم ${discountPercentage}%`, `${discountPercentage}% off`, lang)}
                </span>
              )}
            </div>
            {!customerId && (
              <Input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder={t('اسم الزبون (اختياري)', 'Customer name (optional)', lang)}
                className="h-8 text-xs"
              />
            )}

            {/* Feature 2 & 3: نوع الطلب (صالة/توصيل) + حقول التوصيل */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={invoiceType === 'CONSTRUCTION' ? 'default' : 'outline'}
                onClick={() => {
                  setInvoiceType('CONSTRUCTION');
                  // عند العودة للصالة: لا حاجة لرسوم التوصيل أو المنصة
                  setDeliveryFee(0);
                  setPlatformId('');
                }}
                className={`h-8 text-xs gap-1.5 ${invoiceType === 'CONSTRUCTION' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
              >
                <UtensilsCrossed className="size-3.5" />
                {t('صالة', 'Dine-in', lang)}
              </Button>
              <Button
                variant={invoiceType === 'SERVICE' ? 'default' : 'outline'}
                onClick={() => setInvoiceType('SERVICE')}
                className={`h-8 text-xs gap-1.5 ${invoiceType === 'SERVICE' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
              >
                <Truck className="size-3.5" />
                {t('توصيل', 'Delivery', lang)}
              </Button>
            </div>

            {isDelivery && (
              <>
                <Input
                  type="number" min="0" step="0.01"
                  value={deliveryFee === 0 ? '' : deliveryFee}
                  onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)}
                  placeholder={t('رسوم التوصيل', 'Delivery Fee', lang)}
                  className="h-8 text-xs"
                />
                <Select
                  value={platformId || DIRECT_PLATFORM_VALUE}
                  onValueChange={(v) => setPlatformId(v === DIRECT_PLATFORM_VALUE ? '' : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('اختر منصة التوصيل', 'Select delivery platform', lang)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DIRECT_PLATFORM_VALUE}>
                      {t('توصيل مباشر (بدون عمولة)', 'Direct delivery (no commission)', lang)}
                    </SelectItem>
                    {platforms.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.commissionRate > 0 ? ` (${p.commissionRate}%)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlatform && selectedPlatform.commissionRate > 0 && (
                  <div className="text-[11px] text-muted-foreground italic">
                    {t(
                      `عمولة المنصة (${selectedPlatform.commissionRate}%): ${formatCurrency(platformCommission, lang)} — تُحتسب في كشف المنصة`,
                      `Platform commission (${selectedPlatform.commissionRate}%): ${formatCurrency(platformCommission, lang)} — tracked in platform statement`,
                      lang
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('الطاولة', 'Table', lang)}: <span className="font-bold text-foreground">{tableLabel}</span></span>
              <span>{t('الكاشير', 'Cashier', lang)}: <span className="font-bold text-foreground">{cashier}</span></span>
            </div>
          </div>

          {/* قائمة الأصناف */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
                <ShoppingCart className="size-10 mb-2 opacity-40" />
                <p className="text-sm text-center">
                  {t('السلة فارغة — اضغط على صنف لإضافته', 'Cart is empty — tap an item to add it', lang)}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {cart.map((item, idx) => (
                  <div key={item.itemId} className="p-2.5 hover:bg-slate-50">
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-muted-foreground font-mono mt-0.5 shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">{item.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline" size="icon"
                              className="size-6"
                              onClick={() => changeQty(item.itemId, -1)}
                            >
                              <Minus className="size-3" />
                            </Button>
                            <Input
                              value={item.qty}
                              onChange={e => setQty(item.itemId, e.target.value)}
                              className="h-6 w-10 text-center text-xs px-1"
                            />
                            <Button
                              variant="outline" size="icon"
                              className="size-6"
                              onClick={() => changeQty(item.itemId, 1)}
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(item.price, lang)} × {item.qty}
                          </span>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className="font-bold text-sm text-foreground">
                          {formatCurrency(item.price * item.qty, lang)}
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="size-6 text-destructive hover:text-destructive mt-0.5"
                          onClick={() => removeItem(item.itemId)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الملخّص المالي */}
          <div className="shrink-0 border-t bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('المجموع الفرعي', 'Subtotal', lang)}</span>
              <span className="font-medium">{formatCurrency(subtotal, lang)}</span>
            </div>
            {/* Feature 1: بند الخصم */}
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-sm text-rose-700">
                <span>{t(`خصم (${discountPercentage}%)`, `Discount (${discountPercentage}%)`, lang)}</span>
                <span>-{formatCurrency(discountAmount, lang)}</span>
              </div>
            )}
            {/* Feature 2: بند رسوم التوصيل */}
            {isDelivery && effectiveDeliveryFee > 0 && (
              <div className="flex items-center justify-between text-sm text-blue-700">
                <span>{t('رسوم توصيل', 'Delivery Fee', lang)}</span>
                <span>+{formatCurrency(effectiveDeliveryFee, lang)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('ضريبة القيمة المضافة (15%)', 'VAT (15%)', lang)}</span>
              <span className="font-medium">{formatCurrency(vatCalc.vat, lang)}</span>
            </div>
            {/* Feature 3: عمولة المنصة (معلومة فقط) */}
            {isDelivery && platformCommission > 0 && (
              <div className="flex items-center justify-between text-xs text-amber-700 italic">
                <span>{t(`عمولة المنصة (${selectedPlatform?.commissionRate}%)`, `Platform commission (${selectedPlatform?.commissionRate}%)`, lang)}</span>
                <span>{formatCurrency(platformCommission, lang)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold border-t pt-2">
              <span>{t('الإجمالي', 'Total', lang)}</span>
              <span className="text-emerald-700">{formatCurrency(total, lang)}</span>
            </div>

            {/* المدفوعات المطبّقة */}
            {payments.length > 0 && !isPlatformSale && (
              <div className="bg-white rounded-md border p-2 space-y-1">
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {t('المدفوعات المطبّقة', 'Applied Payments', lang)}:
                </div>
                {payments.map((p, i) => {
                  const m = PAYMENT_METHODS.find(m => m.key === p.method);
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        {m && <m.Icon className="size-3" />}
                        {m ? (lang === 'ar' ? m.ar : m.en) : p.method}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">{formatCurrency(p.amount, lang)}</span>
                        <Button
                          variant="ghost" size="icon"
                          className="size-5 text-destructive"
                          onClick={() => removePayment(i)}
                        >
                          <X className="size-3" />
                        </Button>
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between text-xs font-semibold border-t pt-1">
                  <span>{t('المدفوع', 'Paid', lang)}</span>
                  <span>{formatCurrency(totalPaid, lang)}</span>
                </div>
                {change > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
                    <span>{t('الباقي للزبون', 'Change', lang)}</span>
                    <span>{formatCurrency(change, lang)}</span>
                  </div>
                )}
              </div>
            )}

            {/* تنبيه: طلب منصة — آجل التحصيل */}
            {isPlatformSale && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-1">
                <div className="flex items-center gap-2 text-blue-800 font-semibold text-xs">
                  <Clock className="size-4" />
                  {t('طلب منصة — آجل التحصيل', 'Platform Order — Deferred Payment')}
                </div>
                <div className="text-[11px] text-blue-700">
                  {t('سيُحصّل مبلغ هذا الطلب لاحقاً عبر كشف تسوية المنصة', 'This order will be collected later via the platform settlement statement', lang)}
                </div>
                {platformCommission > 0 && (
                  <div className="text-[11px] text-blue-700">
                    {t('عمولة المنصة', 'Platform Commission')}: <strong>{formatCurrency(platformCommission, lang)}</strong>
                  </div>
                )}
                <div className="text-[11px] text-blue-700">
                  {t('المستحق بعد العمولة', 'Net after commission')}: <strong>{formatCurrency(total - platformCommission, lang)}</strong>
                </div>
              </div>
            )}

            {/* المبلغ المستلم + طرق الدفع — تُخفى لطلبات المنصات (آجلة) */}
            {!isPlatformSale && (
            <>
            {/* الدفع نقداً — مع إدخال المبلغ */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number" min="0" step="0.01"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                placeholder={t('المبلغ المستلم', 'Amount received', lang)}
                className="h-9"
              />
              <Button
                onClick={() => addPayment('CASH')}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 gap-1"
              >
                <Banknote className="size-4" /> {t('نقداً', 'Cash', lang)}
              </Button>
            </div>

            {/* الدفع بالبطاقات — مدى / فيزا / ماستركارد / أخرى */}
            <div className="text-[10px] font-semibold text-muted-foreground pt-1">
              {t('الدفع بالبطاقة', 'Card Payment', lang)}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: 'CARD_MADA',  ar: 'مدى',       en: 'Mada',       cls: 'border-green-300 text-green-700 hover:bg-green-50' },
                { key: 'CARD_VISA',  ar: 'فيزا',      en: 'Visa',       cls: 'border-blue-300 text-blue-700 hover:bg-blue-50' },
                { key: 'CARD_MC',    ar: 'ماستركارد', en: 'Mastercard', cls: 'border-orange-300 text-orange-700 hover:bg-orange-50' },
                { key: 'CARD_OTHER', ar: 'أخرى',      en: 'Other',      cls: 'border-slate-300 text-slate-700 hover:bg-slate-50' },
              ].map(card => (
                <Button
                  key={card.key}
                  variant="outline"
                  onClick={() => {
                    const remaining = +(total - totalPaid).toFixed(2);
                    if (remaining > 0) addPayment(card.key, remaining);
                    else toast.error(t('لا يوجد مبلغ متبقٍ', 'No remaining amount', lang));
                  }}
                  className={`h-9 gap-1 text-xs ${card.cls}`}
                >
                  <CreditCard className="size-3.5" /> {lang === 'ar' ? card.ar : card.en}
                </Button>
              ))}
            </div>
            </>
            )}

            {/* أزرار الإجراءات */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                onClick={printOrder}
                variant="outline"
                className="h-10 gap-1.5"
                disabled={!cart.length}
              >
                <Printer className="size-4" />
                {t('طباعة الطلب', 'Print Order', lang)}
              </Button>
              <Button
                onClick={handlePrintReceipt}
                className="h-10 gap-1.5 bg-amber-600 hover:bg-amber-700"
                disabled={!cart.length || !isFullyPaid}
              >
                <ReceiptIcon className="size-4" />
                {t('طباعة الإيصال', 'Print Receipt', lang)}
              </Button>
              <Button
                onClick={holdInvoice}
                variant="outline"
                className="h-9 gap-1.5 text-xs"
                disabled={!cart.length}
              >
                <Pause className="size-3.5" />
                {t('تعليق', 'Hold', lang)}
              </Button>
              <Button
                onClick={openCancelDialog}
                variant="outline"
                className="h-9 gap-1.5 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                {t('إلغاء', 'Cancel', lang)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* معاينة الإيصال الحراري */}
      <ReceiptPrintDialog
        open={!!printReceipt}
        onOpenChange={(o) => {
          setPrintReceipt(o ? printReceipt : null);
          if (!o) {
            // عند إغلاق المعاينة — تحرير الطاولة (إن لم تُحرّر) والعودة لشاشة الطاولات
            skipAutoClearRef.current = true;
            if (activeTable?.tableId) {
              try { clearTableDraft(activeTable.tableId); } catch { /* ignore */ }
            }
            clearActiveTable();
            setActiveTable(null);
            setActiveItem('tables');
          }
        }}
        invoice={printReceipt}
      />

      {/* Feature 5: تأكيد الإلغاء بكلمة مرور مشرف */}
      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-amber-600" />
              {t('تأكيد الإلغاء — يتطلب صلاحية مشرف', 'Confirm Cancel — Supervisor Required', lang)}
            </DialogTitle>
          </DialogHeader>

          {isOwner ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2.5">
                {t('المالك — لا يحتاج كلمة مرور', 'Owner — no password required', lang)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  'سيتم إفراغ السلة وتحرير الطاولة. هل أنت متأكد؟',
                  'The cart will be cleared and the table freed. Are you sure?',
                  lang
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t(
                  'سيتم إفراغ السلة وتحرير الطاولة. يتطلب هذا الإجراء صلاحية مشرف.',
                  'The cart will be cleared and the table freed. This action requires supervisor authority.',
                  lang
                )}
              </p>
              <Label className="text-xs font-semibold">{t('كلمة مرور المشرف', 'Supervisor Password', lang)}</Label>
              <Input
                type="password"
                value={cancelPassword}
                onChange={e => { setCancelPassword(e.target.value); setCancelError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') submitCancelPassword(); }}
                placeholder="••••••••"
                autoFocus
                className="h-9"
              />
              {cancelError && (
                <p className="text-xs text-destructive font-medium">{cancelError}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {t(
                  `المحاولات المتبقية: ${MAX_CANCEL_ATTEMPTS - cancelAttempts}`,
                  `Attempts remaining: ${MAX_CANCEL_ATTEMPTS - cancelAttempts}`,
                  lang
                )}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmCancelOpen(false)}>
              {t('تراجع', 'Back', lang)}
            </Button>
            <Button variant="destructive" onClick={submitCancelPassword}>
              <Trash2 className="size-4" />
              {t('تأكيد الإلغاء', 'Confirm Cancel', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── مساعد حسابي داخلي للمجموع الفرعي (يستخدم قبل تعريف الميمو) ──────
function subtotal_raw(cartArr) {
  return cartArr.reduce((s, c) => s + (c.price * c.qty), 0);
}
