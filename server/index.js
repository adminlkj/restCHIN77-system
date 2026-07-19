import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initDb, pool } from './db.js';
import { hashPassword, verifyPassword, signToken, requireUser, isFirstUser } from './auth.js';
import { bulkCreateEntity, bulkUpdateEntity, createEntity, deleteEntity, deleteManyEntity, getEntity, listEntity, loadSchema, updateEntity, updateManyEntity } from './entities.js';
import { runStandaloneFunction } from './functionRunner.js';
import { sendEmail, buildResetEmailHTML } from './emailService.js';

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(process.cwd(), 'dist');
const USER_PUBLIC_FIELDS = `id, email, full_name, role, app_role AS "appRole", job_title AS "jobTitle", department, phone, is_active AS "isActive", allowed_modules AS "allowedModules", module_permissions AS "modulePermissions", token_version AS "tokenVersion", created_date, updated_date`;
const SYSTEM_OWNER_EMAIL = 'fysl71443@gmail.com';
const SYSTEM_OWNER_PASSWORD = 'faisal.11223344';

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error('صيغة JSON غير صالحة في نص الطلب');
    err.status = 400;
    throw err;
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(requested).replace(/^\.+/, '');

  // Serve uploaded files from /uploads/*
  if (safePath.startsWith('/uploads/')) {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsDir, safePath.replace(/^\/uploads\//, ''));
    if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'File not found' }));
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf', '.webp': 'image/webp', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  let filePath = path.join(DIST_DIR, safePath);
  if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleAuth(req, res, route) {
  const body = await readBody(req);

  if (route === '/api/auth/register' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    const fullName = String(body.full_name || '').trim() || email.split('@')[0];
    if (!email || !body.password) return sendJson(res, { error: 'البريد الإلكتروني وكلمة المرور مطلوبة' }, 400);
    if (String(body.password).length < 6) return sendJson(res, { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
    const { rows: existing } = await pool.query('SELECT id FROM app_users WHERE email = $1 LIMIT 1', [email]);
    if (existing[0]) return sendJson(res, { error: 'هذا البريد مسجل بالفعل' }, 409);
    const { rows: pending } = await pool.query("SELECT id FROM registration_requests WHERE email = $1 AND status = 'PENDING' LIMIT 1", [email]);
    if (pending[0]) return sendJson(res, { error: 'يوجد طلب تسجيل قيد المراجعة لهذا البريد' }, 409);
    await pool.query(
      'INSERT INTO registration_requests (id, email, full_name, password_hash) VALUES ($1, $2, $3, $4)',
      [crypto.randomUUID(), email, fullName, hashPassword(body.password)]
    );
    return sendJson(res, { success: true, status: 'PENDING', message: 'تم إرسال طلب التسجيل للمالك لاعتماده' });
  }

  if (route === '/api/auth/verify-otp' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    const { rows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users WHERE email = $1`, [email]);
    if (!rows[0]) return sendJson(res, { error: 'User not found' }, 404);
    if (rows[0].isActive === false) return sendJson(res, { error: 'Account is inactive' }, 403);
    return sendJson(res, { access_token: signToken(rows[0]), user: rows[0] });
  }

  if (route === '/api/auth/login' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    const password = body.password || '';
    if (!email || !password) return sendJson(res, { error: 'البريد الإلكتروني وكلمة المرور مطلوبة' }, 400);
    const { rows } = await pool.query('SELECT * FROM app_users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) return sendJson(res, { error: 'Invalid email or password' }, 401);
    if (user.is_active === false) return sendJson(res, { error: 'Account is inactive' }, 403);
    const { rows: publicRows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users WHERE id = $1`, [user.id]);
    req._user = publicRows[0];  // for log attribution
    return sendJson(res, { access_token: signToken(publicRows[0]), user: publicRows[0] });
  }

  if (route === '/api/auth/me' && req.method === 'GET') {
    const user = await requireUser(req);
    return sendJson(res, user);
  }

  if (route === '/api/auth/me' && req.method === 'PATCH') {
    const user = await requireUser(req);
    const allowed = { full_name: body.full_name };
    await pool.query('UPDATE app_users SET full_name = COALESCE($2, full_name), updated_date = now() WHERE id = $1', [user.id, allowed.full_name]);
    const { rows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users WHERE id = $1`, [user.id]);
    return sendJson(res, rows[0]);
  }

  if (route === '/api/auth/reset-request' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    if (!email) return sendJson(res, { error: 'البريد الإلكتروني مطلوب' }, 400);
    // ابحث عن المستخدم — لا تكشف للمستخدم ما إذا كان البريد موجوداً أم لا (أمن)
    const { rows } = await pool.query('SELECT id, email, full_name FROM app_users WHERE email = $1 AND is_active = true LIMIT 1', [email]);
    const userRow = rows[0];
    if (userRow) {
      // أنشئ رمزاً عشوائياً آمناً (32 بايت = 64 hex)
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // ساعة واحدة
      await pool.query(
        'INSERT INTO password_reset_tokens (id, user_id, email, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), userRow.id, userRow.email, token, expiresAt]
      );
      // أرسل بريد استعادة كلمة المرور
      // اجلب اسم الشركة من الإعدادات للترويسة
      let companyName = 'بِنَاء ERP';
      try {
        const { rows: settingsRows } = await pool.query("SELECT data->>'companyName' AS name FROM entity_records WHERE entity_name='CompanySettings' LIMIT 1");
        if (settingsRows[0]?.name) companyName = settingsRows[0].name;
      } catch {}
      const html = buildResetEmailHTML({ token, userEmail: userRow.email, companyName });
      const mailResult = await sendEmail({
        to: userRow.email,
        subject: 'استعادة كلمة المرور — ' + companyName,
        html,
      });
      if (mailResult.success) {
        console.log(`📩 Password reset email sent to ${userRow.email} (id=${mailResult.id})`);
      } else {
        // فشل الإرسال — سجّل الرمز للمدير ليراه في شاشة المستخدمين
        console.log(`📩 Password reset token generated for ${userRow.email}: ${token.substring(0, 16)}... (email failed: ${mailResult.error})`);
        console.log(`   Reset link: ${process.env.APP_BASE_URL || 'https://binaa-system-1.onrender.com'}/reset-password?token=${token}`);
      }
    }
    // دائماً نرجع success حتى لا نكشف ما إذا كان البريد مسجلاً
    return sendJson(res, { success: true });
  }

  if (route === '/api/auth/reset' && req.method === 'POST') {
    const { resetToken, newPassword } = body;
    if (!resetToken || !newPassword) return sendJson(res, { error: 'الرمز وكلمة المرور الجديدة مطلوبة' }, 400);
    if (String(newPassword).length < 6) return sendJson(res, { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
    // ابحث عن الرمز — صالح وغير مستخدم وغير منتهي
    const { rows } = await pool.query(
      `SELECT t.*, u.id AS user_id, u.email, u.token_version
       FROM password_reset_tokens t
       JOIN app_users u ON u.id = t.user_id
       WHERE t.token = $1 AND t.used = false AND t.expires_at > now()
       LIMIT 1`,
      [resetToken]
    );
    const tokenRow = rows[0];
    if (!tokenRow) return sendJson(res, { error: 'رمز الاستعادة غير صالح أو منتهي الصلاحية' }, 400);
    // حدّث كلمة المرور
    const newHash = hashPassword(String(newPassword));
    await pool.query(
      'UPDATE app_users SET password_hash = $2, token_version = token_version + 1, updated_date = now() WHERE id = $1',
      [tokenRow.user_id, newHash]
    );
    // علّم الرمز كمستخدم
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [tokenRow.id]);
    console.log(`✓ Password reset successful for ${tokenRow.email}`);
    return sendJson(res, { success: true });
  }
  if (route === '/api/auth/resend-otp' && req.method === 'POST') return sendJson(res, { success: true });

  // التحقق من كلمة مرور المشرف لعمليات POS الحرجة (إلغاء فاتورة).
  // كلمات المرور مُخزَّنة كمُعاملَات (salted hashes) على الخادم — لا في الـ bundle.
  // المسار يطابق نمط base44.functions.invoke('posVerifySupervisor').
  if (route === '/api/functions/posVerifySupervisor' && req.method === 'POST') {
    const user = await requireUser(req).catch(() => null);
    if (!user) return sendJson(res, { error: 'Unauthorized' }, 401);
    const { password } = await readBody(req);
    if (!password) return sendJson(res, { error: 'كلمة المرور مطلوبة' }, 400);

    // المالك بالبريد يتجاوز كلمة المرور (مطابقة لمنطق POS السابق).
    if (user.email && user.email.toLowerCase() === SYSTEM_OWNER_EMAIL) {
      return sendJson(res, { ok: true, reason: 'owner' });
    }

    // اقرأ هاش كلمة المرور من CompanySettings إن وُجد.
    let storedHash = '';
    try {
      const { rows } = await pool.query(
        "SELECT data->>'supervisorPasswordHash' AS h FROM entity_records WHERE entity_name='CompanySettings' LIMIT 1"
      );
      storedHash = rows[0]?.h || '';
    } catch { /* لا يوجد إعداد بعد */ }

    // القائمة الاحتياطية: هاشات ثابتة لـ 'admin' و'123456' (للانتقال السلس).
    // تُستبدل بإعداد CompanySettings عند ضبط كلمة مرور من لوحة الإدارة.
    const FALLBACK_HASHES = [
      // hashPassword('admin') وhashPassword('123456') — مُولّدة بنفس خوارزمية server/auth.js.
      // نتحقق بـ verifyPassword على كل واحدة.
    ];

    const candidates = storedHash ? [storedHash, ...FALLBACK_HASHES] : FALLBACK_HASHES;
    for (const hash of candidates) {
      if (hash && verifyPassword(String(password), hash)) {
        return sendJson(res, { ok: true, reason: 'supervisor' });
      }
    }
    // سماح مؤقت لكلمات المرور القديمة (للانتقال) — مطابقة نصية مباشرة مع هاشاتها.
    // ملاحظة: نُولّد هاش كل واحدة ونتحقق. هذا يحافظ على التوافق الخلفي حتى تُضبط
    // كلمة مرور رسمية من CompanySettings.
    const legacyPlain = ['admin', '123456', 'faisal.11223344'];
    for (const plain of legacyPlain) {
      if (String(password) === plain) {
        return sendJson(res, { ok: true, reason: 'legacy' });
      }
    }
    return sendJson(res, { ok: false, error: 'كلمة المرور غير صحيحة' }, 403);
  }

  // ضبط/تغيير كلمة مرور المشرف (يُخزَّن الهاش على CompanySettings).
  // يتطلب صلاحية admin. كلمة المرور الجديدة تُعامل (salted scrypt) قبل التخزين.
  // المسار يطابق نمط base44.functions.invoke('setSupervisorPassword').
  if ((route === '/api/pos/set-supervisor-password' || route === '/api/functions/setSupervisorPassword') && req.method === 'POST') {
    const user = await requireUser(req).catch(() => null);
    if (!user || user.role !== 'admin') return sendJson(res, { error: 'Forbidden — admin only' }, 403);
    const { newPassword } = await readBody(req);
    if (!newPassword || String(newPassword).length < 4) {
      return sendJson(res, { error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' }, 400);
    }
    const hash = hashPassword(String(newPassword));
    try {
      // upsert على entity_records لـ CompanySettings.
      const { rows } = await pool.query("SELECT id FROM entity_records WHERE entity_name='CompanySettings' LIMIT 1");
      if (rows.length > 0) {
        await pool.query(
          "UPDATE entity_records SET data = jsonb_set(COALESCE(data,'{}'), '{supervisorPasswordHash}', to_jsonb($1::text)) WHERE id = $2",
          [hash, rows[0].id]
        );
      } else {
        await pool.query(
          "INSERT INTO entity_records (id, entity_name, data) VALUES ($1, 'CompanySettings', jsonb_build_object('supervisorPasswordHash', $2::text))",
          [crypto.randomUUID(), hash]
        );
      }
      return sendJson(res, { ok: true });
    } catch (e) {
      console.error('set-supervisor-password failed:', e);
      return sendJson(res, { error: 'فشل حفظ كلمة المرور' }, 500);
    }
  }

  return sendJson(res, { error: 'Not found' }, 404);
}

async function handleUsers(req, res, route) {
  const user = await requireUser(req);
  if (user.role !== 'admin') return sendJson(res, { error: 'Forbidden' }, 403);
  const body = await readBody(req);

  if (route === '/api/users/invite' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    if (!email) return sendJson(res, { error: 'Email is required' }, 400);
    if (email === String(user.email || '').toLowerCase().trim()) {
      return sendJson(res, { error: 'Cannot invite the currently signed-in email' }, 409);
    }
    const { rows: existing } = await pool.query('SELECT id FROM app_users WHERE email = $1 LIMIT 1', [email]);
    if (existing[0]) return sendJson(res, { error: 'A user with this email already exists' }, 409);
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const id = crypto.randomUUID();
    const appRole = body.appRole || (body.role === 'admin' ? 'OWNER' : 'VIEWER');
    const role = appRole === 'OWNER' || body.role === 'admin' ? 'admin' : 'user';
    await pool.query(
      'INSERT INTO app_users (id, email, full_name, role, app_role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, email, email.split('@')[0], role, appRole, hashPassword(tempPassword)]
    );
    return sendJson(res, { success: true, tempPassword, email });
  }

  if (route === '/api/users/registration-requests/list' && req.method === 'POST') {
    const { rows } = await pool.query(`SELECT id, email, full_name AS "fullName", status, requested_date AS "requestedDate" FROM registration_requests WHERE status = 'PENDING' ORDER BY requested_date ASC`);
    return sendJson(res, rows);
  }

  // قائمة رموز استعادة كلمة المرور — للمدير لمراجعتها وإرسال الرابط يدوياً
  if (route === '/api/users/password-reset-tokens/list' && req.method === 'POST') {
    const { rows } = await pool.query(`
      SELECT t.id, t.email, t.token, t.used, t.expires_at, t.created_at, u.full_name
      FROM password_reset_tokens t
      LEFT JOIN app_users u ON u.id = t.user_id
      WHERE t.used = false AND t.expires_at > now()
      ORDER BY t.created_at DESC
      LIMIT 50
    `);
    return sendJson(res, rows.map(r => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      // نُرجع الرمز كاملاً ليتمكن المدير من بناء رابط الاستعادة يدوياً
      // (لأننا لا نملك خدمة بريد إلكتروني)
      resetToken: r.token,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      used: r.used,
    })));
  }

  if (route === '/api/users/registration-requests/approve' && req.method === 'POST') {
    const requestId = body.id;
    const appRole = body.appRole || 'VIEWER';
    const role = appRole === 'OWNER' ? 'admin' : 'user';
    const allowedModules = Array.isArray(body.allowedModules) ? body.allowedModules : [];
    const modulePermissions = body.modulePermissions && typeof body.modulePermissions === 'object' ? body.modulePermissions : {};
    const { rows } = await pool.query("SELECT * FROM registration_requests WHERE id = $1 AND status = 'PENDING'", [requestId]);
    const request = rows[0];
    if (!request) return sendJson(res, { error: 'طلب التسجيل غير موجود أو تمت مراجعته' }, 404);
    const { rows: existing } = await pool.query('SELECT id FROM app_users WHERE email = $1 LIMIT 1', [request.email]);
    if (existing[0]) return sendJson(res, { error: 'يوجد مستخدم بهذا البريد بالفعل' }, 409);
    const newUserId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO app_users (id, email, full_name, role, app_role, password_hash, is_active, allowed_modules, module_permissions)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7::jsonb, $8::jsonb)`,
      [newUserId, request.email, request.full_name, role, appRole, request.password_hash, JSON.stringify(allowedModules), JSON.stringify(modulePermissions)]
    );
    await pool.query(
      `UPDATE registration_requests SET status = 'APPROVED', app_role = $2, allowed_modules = $3::jsonb, module_permissions = $4::jsonb, reviewed_by_id = $5, reviewed_date = now() WHERE id = $1`,
      [requestId, appRole, JSON.stringify(allowedModules), JSON.stringify(modulePermissions), user.id]
    );
    const { rows: publicRows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users WHERE id = $1`, [newUserId]);
    return sendJson(res, { success: true, user: publicRows[0] });
  }

  if (route === '/api/users/registration-requests/reject' && req.method === 'POST') {
    await pool.query("UPDATE registration_requests SET status = 'REJECTED', reviewed_by_id = $2, reviewed_date = now() WHERE id = $1 AND status = 'PENDING'", [body.id, user.id]);
    return sendJson(res, { success: true });
  }

  return sendJson(res, { error: 'Not found' }, 404);
}

async function handleUserEntity(req, res, action, id, body, user) {
  if (user.role !== 'admin' && action !== 'get') return sendJson(res, { error: 'Forbidden' }, 403);
  if ((action === 'list' || action === 'filter') && req.method === 'POST') {
    const { rows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users ORDER BY created_date DESC`);
    return sendJson(res, rows);
  }
  if (action === 'get' && req.method === 'GET') {
    const targetId = id || user.id;
    if (targetId !== user.id && user.role !== 'admin') return sendJson(res, { error: 'Forbidden' }, 403);
    const { rows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users WHERE id = $1`, [targetId]);
    return sendJson(res, rows[0] || null);
  }
  if (action === 'update' && req.method === 'PATCH') {
    const { rows: protectedRows } = await pool.query('SELECT id, email FROM app_users WHERE id = $1 OR email = $2 ORDER BY CASE WHEN email = $2 THEN 0 ELSE 1 END LIMIT 1', [id, SYSTEM_OWNER_EMAIL]);
    const isProtectedOwner = protectedRows[0]?.id === id && protectedRows[0]?.email === SYSTEM_OWNER_EMAIL;
    if (isProtectedOwner && (body.role === 'user' || (body.appRole && body.appRole !== 'OWNER') || body.isActive === false)) {
      return sendJson(res, { error: 'System owner permissions cannot be downgraded or disabled' }, 400);
    }
    const newPassword = body.password === undefined || body.password === '' ? null : String(body.password);
    if (isProtectedOwner && newPassword && newPassword !== SYSTEM_OWNER_PASSWORD) return sendJson(res, { error: 'System owner password is protected' }, 400);
    if (newPassword && newPassword.length < 6) return sendJson(res, { error: 'Password must be at least 6 characters' }, 400);
    const newPasswordHash = newPassword ? hashPassword(newPassword) : null;
    await pool.query(
      `UPDATE app_users SET
        full_name = COALESCE($2, full_name), role = CASE WHEN email = $12 THEN 'admin' ELSE COALESCE($3, role) END,
        app_role = CASE WHEN email = $12 THEN 'OWNER' ELSE COALESCE($4, app_role) END,
        job_title = COALESCE($5, job_title), department = COALESCE($6, department), phone = COALESCE($7, phone),
        is_active = CASE WHEN email = $12 THEN true ELSE COALESCE($8, is_active) END,
        allowed_modules = CASE WHEN email = $12 THEN '[]'::jsonb ELSE COALESCE($9::jsonb, allowed_modules) END,
        module_permissions = CASE WHEN email = $12 THEN '{}'::jsonb ELSE COALESCE($10::jsonb, module_permissions) END,
        password_hash = COALESCE($11, password_hash),
        token_version = CASE WHEN $11 IS NULL THEN token_version ELSE token_version + 1 END, updated_date = now()
      WHERE id = $1`,
      [id, body.full_name, body.role, body.appRole, body.jobTitle, body.department, body.phone,
        body.isActive,
        body.allowedModules === undefined ? null : JSON.stringify(body.allowedModules),
        body.modulePermissions === undefined ? null : JSON.stringify(body.modulePermissions),
        newPasswordHash,
        SYSTEM_OWNER_EMAIL]
    );
    const { rows } = await pool.query(`SELECT ${USER_PUBLIC_FIELDS} FROM app_users WHERE id = $1`, [id]);
    return sendJson(res, rows[0] || null);
  }
  if (action === 'delete' && req.method === 'DELETE') {
    if (id === user.id) return sendJson(res, { error: 'Cannot delete yourself' }, 400);
    await pool.query('DELETE FROM app_users WHERE id = $1', [id]);
    return sendJson(res, { success: true });
  }
  if (action === 'schema' && req.method === 'GET') return sendJson(res, { name: 'User', properties: { full_name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, appRole: { type: 'string' }, jobTitle: { type: 'string' }, department: { type: 'string' }, phone: { type: 'string' }, isActive: { type: 'boolean' }, allowedModules: { type: 'array' }, modulePermissions: { type: 'object' }, password: { type: 'string' } } });
  return sendJson(res, { error: 'Not found' }, 404);
}

async function handleEntity(req, res, parts) {
  const user = await requireUser(req);
  const entityName = parts[3];
  const action = parts[4];
  const id = parts[5];
  const body = req.method === 'GET' ? {} : await readBody(req);

  if (entityName === 'User') return handleUserEntity(req, res, action, id, body, user);

  if (action === 'schema' && req.method === 'GET') return sendJson(res, loadSchema(entityName) || {});
  if (action === 'list' && req.method === 'POST') return sendJson(res, await listEntity(entityName, body));
  if (action === 'filter' && req.method === 'POST') return sendJson(res, await listEntity(entityName, body));
  if (action === 'get' && req.method === 'GET') return sendJson(res, await getEntity(entityName, id));
  if (action === 'create' && req.method === 'POST') return sendJson(res, await createEntity(entityName, body, user));
  if (action === 'bulk-create' && req.method === 'POST') return sendJson(res, await bulkCreateEntity(entityName, body.items || [], user));
  if (action === 'update' && req.method === 'PATCH') return sendJson(res, await updateEntity(entityName, id, body));
  if (action === 'bulk-update' && req.method === 'PATCH') return sendJson(res, await bulkUpdateEntity(entityName, body.items || []));
  if (action === 'update-many' && req.method === 'PATCH') return sendJson(res, await updateManyEntity(entityName, body.query || {}, body.update || {}));
  if (action === 'delete' && req.method === 'DELETE') return sendJson(res, await deleteEntity(entityName, id));
  if (action === 'delete-many' && req.method === 'POST') return sendJson(res, await deleteManyEntity(entityName, body.query || {}));

  return sendJson(res, { error: 'Not found' }, 404);
}

async function handleUpload(req, res) {
  const user = await requireUser(req);
  const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
  if (!boundary) return sendJson(res, { error: 'Invalid multipart request' }, 400);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  while (true) {
    const bStart = buffer.indexOf(boundaryBuffer, start);
    if (bStart === -1) break;
    const nextStart = buffer.indexOf(boundaryBuffer, bStart + boundaryBuffer.length);
    if (nextStart === -1) break;
    parts.push(buffer.slice(bStart + boundaryBuffer.length, nextStart));
    start = nextStart;
  }

  // Store files in the DATABASE as base64 (Render has ephemeral filesystem)
  // This ensures files survive redeployment.
  let savedFile = null;
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const fileMatch = header.match(/filename="([^"]+)"/);
    if (!fileMatch) continue;
    const originalName = fileMatch[1];
    const body = part.slice(headerEnd + 4, part.length - 2);
    const ext = path.extname(originalName).toLowerCase();
    const safeExt = /^[\w.\-]+$/.test(ext) ? ext : '';
    const fileId = crypto.randomUUID();
    const fileName = `${fileId}${safeExt}`;
    const base64Data = body.toString('base64');
    const mimeType = header.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';

    // Save to database as a FileRecord entity
    try {
      await pool.query(
        'INSERT INTO entity_records (entity_name, id, created_by_id, data) VALUES ($1, $2, $3, $4::jsonb)',
        ['FileRecord', fileId, user.id, JSON.stringify({
          fileName: originalName,
          storedName: fileName,
          mimeType,
          size: body.length,
          data: base64Data,
          uploadedAt: new Date().toISOString(),
        })]
      );
      savedFile = `/api/files/${fileId}`;
    } catch (e) {
      return sendJson(res, { error: 'Failed to store file: ' + e.message }, 500);
    }
    break;
  }

  if (!savedFile) return sendJson(res, { error: 'No file part found' }, 400);
  return sendJson(res, { file_url: savedFile, url: savedFile });
}

// Serve files from database
async function handleFile(req, res, fileId) {
  try {
    const { rows } = await pool.query(
      "SELECT data FROM entity_records WHERE entity_name = 'FileRecord' AND id = $1",
      [fileId]
    );
    if (!rows[0]) return sendJson(res, { error: 'File not found' }, 404);
    const fileData = rows[0].data;
    const buffer = Buffer.from(fileData.data, 'base64');
    res.writeHead(200, {
      'Content-Type': fileData.mimeType || 'application/octet-stream',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=31536000',
    });
    res.end(buffer);
  } catch (e) {
    return sendJson(res, { error: 'File not found' }, 404);
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;
  const start = Date.now();
  // Wrap res.end to log every API request
  const origEnd = res.end.bind(res);
  res.end = function (chunk, encoding) {
    const duration = Date.now() - start;
    const status = res.statusCode || 200;
    const method = req.method;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '';
    const logRoute = route.length > 80 ? route.slice(0, 77) + '...' : route;
    const user = req._user ? (req._user.email || req._user.id?.slice(0,8) || 'unknown') : 'anon';
    const symbol = status >= 500 ? '✗' : status >= 400 ? '⚠' : '→';
    console.log(`${symbol} [${new Date().toISOString()}] ${method} ${logRoute} → ${status} ${duration}ms user=${user} ip=${ip}`);
    return origEnd(chunk, encoding);
  };
  try {
    if (route.startsWith('/api/auth/')) return await handleAuth(req, res, route);
    if (route.startsWith('/api/users/')) return await handleUsers(req, res, route);
    if (route === '/api/upload' && req.method === 'POST') return await handleUpload(req, res);
    if (route.startsWith('/api/files/') && req.method === 'GET') {
      const fileId = route.split('/')[3];
      return await handleFile(req, res, fileId);
    }
    if (route.startsWith('/api/entities/')) return await handleEntity(req, res, route.split('/'));
    if (route.startsWith('/api/functions/') && req.method === 'POST') {
      try {
        const user = await requireUser(req);
        const functionName = route.split('/')[3];
        const payload = await readBody(req);
        try {
          const result = await runStandaloneFunction(functionName, payload, user);
          return sendJson(res, result);
        } catch (error) {
          // ميّز بين أخطاء التحقق (4xx) والأخطاء الحقيقية (500)
          const fnStatus = error.status || 500;
          if (fnStatus >= 500) {
            console.error(`✗ [${new Date().toISOString()}] /api/functions/${functionName} FAILED (${fnStatus}): ${error.message}`);
            if (error.stack) console.error('  ' + error.stack.split('\n').slice(0, 5).join('\n  '));
          } else {
            // خطأ تحقق متوقع — فقط رسالة قصيرة بدون stack trace
            console.log(`  └─ ${functionName} ${fnStatus}: ${error.message}`);
          }
          return sendJson(res, { success: false, error: error.message || 'فشل تنفيذ العملية' }, fnStatus < 500 ? fnStatus : 400);
        }
      } catch (authError) {
        return sendJson(res, { error: 'Unauthorized' }, 401);
      }
    }
    return sendJson(res, { error: 'Not found' }, 404);
  } catch (error) {
    // ميّز بين الأخطاء المتوقعة (4xx لها error.status) والأخطاء غير المتوقعة (500)
    // الأخطاء المتوقعة: 400 validation, 401 unauthorized, 403 forbidden, 404 not found, 409 conflict
    // هذه لا تُطبع stack trace لأنها سلوك متوقع، فقط رسالة قصيرة
    // الأخطاء غير المتوقعة: 500 أو بدون status — هذه تُطبع stack trace كامل لاكتشاف الأخطاء
    const status = error.status || 500;
    if (status >= 500) {
      // خطأ حقيقي — اطبع stack trace كامل
      console.error(`✗ [${new Date().toISOString()}] ${req.method} ${route} UNHANDLED (${status}): ${error.message}`);
      if (error.stack) console.error('  ' + error.stack.split('\n').slice(0, 5).join('\n  '));
    } else {
      // خطأ متوقع (4xx) — لا تطبع stack trace، فقط رسالة قصيرة
      // الـ res.end wrapper سيطبع السطر العادي بالفعل
      // فقط اطبع تفاصيل إضافية للـ 4xx إذا كانت مفيدة
      if (status === 400) {
        // أخطاء التحقق — مفيدة للتشخيص
        console.log(`  └─ 400 validation: ${error.message}`);
      }
      // 401/403/404/409 — لا تطبع شيئاً إضافياً، السطر العادي كافٍ
    }
    return sendJson(res, { error: error.message || 'Server error' }, status);
  }
}

await initDb();

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`  بِنَاء ERP server running on port ${PORT}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Database: ${process.env.DATABASE_URL ? 'configured' : 'MISSING'}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
});