import crypto from 'crypto';
import { pool } from './db.js';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function tokenSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-this-secret-before-production';
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const candidate = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}

export function signToken(user) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: user.id,
    email: user.email,
    role: user.role,
    sessionVersion: user.tokenVersion ?? user.token_version ?? 0,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  }));
  const signature = crypto.createHmac('sha256', tokenSecret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const expected = crypto.createHmac('sha256', tokenSecret()).update(`${header}.${payload}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
  return decoded;
}

export async function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const decoded = verifyToken(token);
  if (!decoded?.sub) return null;
  const { rows } = await pool.query(`
    SELECT id, email, full_name, role, app_role AS "appRole", job_title AS "jobTitle",
      department, phone, is_active AS "isActive", allowed_modules AS "allowedModules",
      module_permissions AS "modulePermissions", token_version AS "tokenVersion", created_date, updated_date
    FROM app_users WHERE id = $1
  `, [decoded.sub]);
  if (rows[0]?.isActive === false) return null;
  if (rows[0]?.tokenVersion > 0 && decoded.sessionVersion !== rows[0].tokenVersion) return null;
  return rows[0] || null;
}

export async function requireUser(req) {
  const user = await getUserFromRequest(req);
  if (!user) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
  // Attach user to request for logging purposes
  req._user = user;
  return user;
}

export async function isFirstUser() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM app_users');
  return rows[0].count === 0;
}