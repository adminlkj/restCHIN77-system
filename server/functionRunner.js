import fs from 'fs';
import path from 'path';
import { createBase44Adapter } from './base44Adapter.js';

const cache = new Map();

function loadFunctionScope(functionName) {
  if (cache.has(functionName)) return cache.get(functionName);

  const filePath = path.join(process.cwd(), 'base44', 'functions', functionName, 'entry.ts');
  let source = fs.readFileSync(filePath, 'utf8');
  source = source.replace(/^import\s+\{\s*createClientFromRequest\s*\}\s+from\s+['"]npm:@base44\/sdk@[^'"]+['"];?\s*/m, '');
  const serveIndex = source.indexOf('Deno.serve');
  if (serveIndex >= 0) source = source.slice(0, serveIndex);

  const factory = new Function(`${source}\nreturn {\n  HANDLERS: typeof HANDLERS !== 'undefined' ? HANDLERS : undefined,\n  guarded: typeof guarded !== 'undefined' ? guarded : undefined,\n  capitalizeAsset: typeof capitalizeAsset !== 'undefined' ? capitalizeAsset : undefined,\n  depreciateAsset: typeof depreciateAsset !== 'undefined' ? depreciateAsset : undefined,\n  depreciateAll: typeof depreciateAll !== 'undefined' ? depreciateAll : undefined,\n};`);
  const scope = factory();
  cache.set(functionName, scope);
  return scope;
}

export async function runStandaloneFunction(functionName, payload, user) {
  const base44 = createBase44Adapter(user);

  if (functionName === 'postOperation') {
    const { HANDLERS, guarded } = loadFunctionScope('postOperation');
    const { operation, mode } = payload || {};
    const group = HANDLERS?.[operation];
    if (!group) throw new Error(`عملية غير معروفة: ${operation}`);
    const handler = group[mode];
    if (!handler) throw new Error(`وضع غير معروف: ${mode}`);
    const record = guarded ? await guarded(base44, payload, handler) : await handler(base44, payload);
    return { success: true, record };
  }

  if (functionName === 'assetDepreciation') {
    if (user.role !== 'admin') throw new Error('صلاحية المدير مطلوبة');
    const { capitalizeAsset, depreciateAsset, depreciateAll } = loadFunctionScope('assetDepreciation');
    const { mode, id, period } = payload || {};
    let record;
    if (mode === 'capitalize') record = await capitalizeAsset(base44, id);
    else if (mode === 'depreciate') record = await depreciateAsset(base44, id, period);
    else if (mode === 'depreciateAll') record = await depreciateAll(base44, period);
    else throw new Error(`وضع غير معروف: ${mode}`);
    return { success: true, record };
  }

  throw new Error(`دالة غير مدعومة على السيرفر المستقل: ${functionName}`);
}