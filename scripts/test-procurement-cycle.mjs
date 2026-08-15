// اختبار سريع لمنطق GR + فاتورة مورد المرتبطة — يتحقق من النتيجة الصافية النظيفة.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStandardAccounts } from '../src/lib/standardChart.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let source = fs.readFileSync(path.join(__dirname,'..','base44','functions','postOperation','entry.ts'),'utf8');
source = source.replace(/^import\s+\{\s*createClientFromRequest\s*\}\s+from\s+['"]npm:@base44\/sdk@[^'"]+['"];?\s*/m,'');
const serveIndex = source.indexOf('Deno.serve'); if(serveIndex>=0) source = source.slice(0,serveIndex);
const { HANDLERS, guarded } = new Function(`${source}\nreturn { HANDLERS, guarded };`)();
const store = {}; const uuid=()=>'id-'+Math.random().toString(36).slice(2,10);
function mk(n){const s=()=>{if(!store[n])store[n]=new Map();return store[n];};return{create:async(d)=>{const id=d.id||uuid();const r={...d,id,created_date:new Date().toISOString()};s().set(id,r);if(n==='JournalEntry')captured.push(r);return r;},get:async(id)=>s().get(id)||null,update:async(id,d)=>{const c=s().get(id)||{};const nx={...c,...d};s().set(id,nx);return nx;},updateMany:async(q,u)=>{for(const r of s().values())if(Object.keys(q).every(k=>r[k]===q[k]))Object.assign(r,u);return{updated:true};},list:async()=>[...s().values()],filter:async(q)=>{let a=[...s().values()];if(q&&typeof q==='object')a=a.filter(r=>Object.keys(q).every(k=>r[k]===q[k]));return a;},delete:async(id)=>{s().delete(id);return{success:true};}};}
const captured=[];
const base44={asServiceRole:{entities:new Proxy({},{get:(_,n)=>mk(String(n))})}};
for(const a of buildStandardAccounts())store['ChartAccount']=store['ChartAccount']||new Map(),store['ChartAccount'].set(a.code,{...a,id:a.code});
store['FiscalYear']=new Map([['fy1',{id:'fy1',status:'OPEN',isCurrent:true,startDate:'2026-01-01',endDate:'2026-12-31'}]]);
store['Supplier']=new Map([['sp1',{id:'sp1',name:'مورد اللحوم'}]]);
store['Project']=new Map([['pr1',{id:'pr1',name:'PALACE'}]]);
async function run(op,mode,p){captured.length=0;const h=HANDLERS[op]?.[mode];if(!h)throw new Error('no handler');const r=await guarded(base44,{operation:op,mode,...p},h);return{record:r,jes:[...captured]};}
const linesOf=(je)=>je.lines.map(l=>`${l.accountCode}:${l.debit}/${l.credit}`);
const lineWith=(je,c)=>je.lines.find(l=>l.accountCode===c);

console.log('════ اختبار GR + فاتورة مورد مرتبطة ════\n');
// 1) استلام بضاعة من مورد
const { record: gr, jes: grJEs } = await run('GOODS_RECEIPT','create',{data:{receiptNo:'GR1',date:'2026-08-13',supplierId:'sp1',supplierName:'مورد اللحوم',warehouseId:'pr1',warehouseName:'PALACE',lines:[{description:'دجاج',unit:'كجم',receivingQty:10,unitPrice:20}]}});
const grJE = grJEs[0];
console.log('▶ استلام من مورد: ' + (grJE?linesOf(grJE).join('  '):'لا قيد'));
console.log('  ✓ 1131 مخزون مدين 200:', lineWith(grJE,'1131')?.debit===200);
console.log('  ✓ 2110 ذمم دائن 200 (لا 3900):', lineWith(grJE,'2110')?.credit===200 && !lineWith(grJE,'3900'));

// 2) فاتورة مورد مرتبطة بـ GR
const { record: inv, jes: invJEs } = await run('SUPPLIER_INVOICE','create',{data:{invoiceNo:'SI1',date:'2026-08-13',supplierId:'sp1',supplierName:'مورد اللحوم',baseAmount:200,vatRate:0.15,vatAmount:30,totalAmount:230,paidAmount:0,goodsReceiptId:gr.id,status:'DRAFT'}});
const appr = await run('SUPPLIER_INVOICE','approve',{id:inv.id});
console.log('\n▶ فاتورة مورد مرتبطة بـ GR — قيود الاعتماد:');
appr.jes.forEach((je,i)=>console.log('  قيد '+(i+1)+': '+linesOf(je).join('  ')));

// 3) النتيجة الصافية (تجميع كل القيود المتعلقة)
const allLines = [...grJEs, ...appr.jes].flatMap(je=>je.lines);
const net = {};
allLines.forEach(l=>{net[l.accountCode]=(net[l.accountCode]||0)+l.debit-l.credit;});
console.log('\n▶ النتيجة الصافية (رصيد كل حساب بعد كل القيود):');
Object.entries(net).sort().forEach(([code,bal])=>console.log('  '+code+': '+(bal>=0?'مدين ':'دائن ')+Math.abs(bal).toFixed(2)));

// التحقق
console.log('\n▶ التحقق:');
console.log('  ✓ 5110 تكلفة مدين 200 (COGS):', net['5110']===200);
console.log('  ✓ 1140 VAT مدين 30:', net['1140']===30);
console.log('  ✓ 2110 ذمم دائن 230 (تكلفة+VAT):', net['2110']===-230);
console.log('  ✓ 1131 مخزون = صفر (عُكس بالكامل):', (net['1131']||0)===0);
console.log('  ✓ 3900 لم يُستخدم:', (net['3900']||0)===0);
const ok = net['5110']===200 && net['1140']===30 && net['2110']===-230 && (net['1131']||0)===0 && (net['3900']||0)===0;
console.log('\n════ '+(ok?'✓ الإصلاح ناجح — النتيجة نظيفة':'✗ فشل')+' ════');
process.exit(ok?0:1);
