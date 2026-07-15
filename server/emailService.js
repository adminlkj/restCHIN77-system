/**
 * خدمة إرسال البريد الإلكتروني
 *
 * تستخدم Resend.com API إذا كان RESEND_API_KEY متوفراً في متغيرات البيئة.
 * إذا لم يكن متوفراً، تسجّل الرسالة في console فقط (وضع التطوير).
 *
 * متغيرات البيئة المطلوبة (في Render Dashboard → Environment):
 *   RESEND_API_KEY     - مفتاح API من https://resend.com/api-keys
 *   MAIL_FROM          - عنوان المرسل (مثل: "بِنَاء ERP <noreply@sumoua.com>")
 *                       يجب أن يكون النطاق مُحقَّقاً في Resend.
 *   APP_BASE_URL       - الرابط الأساسي للتطبيق (مثل: https://binaa-system-1.onrender.com)
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'بِنَاء ERP <onboarding@resend.dev>';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://binaa-system-1.onrender.com';

/**
 * يرسل بريداً إلكترونياً عبر Resend API.
 *
 * @param {Object} params
 * @param {string} params.to - عنوان المستلم
 * @param {string} params.subject - عنوان البريد
 * @param {string} params.html - محتوى HTML
 * @param {string} [params.text] - محتوى نصي بديل (اختياري)
 * @returns {Promise<{success: boolean, error?: string, id?: string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    // وضع التطوير: لا مفتاح API → سجّل فقط
    console.log(`📧 [DEV MAIL] To: ${to} | Subject: ${subject}`);
    console.log(`   (لا RESEND_API_KEY — البريد لم يُرسل فعلياً)`);
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  if (!to || !subject || !html) {
    return { success: false, error: 'to, subject, html are required' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`📧 Mail send failed: ${JSON.stringify(data)}`);
      return { success: false, error: data.message || data.error || 'Unknown Resend error' };
    }

    console.log(`📧 Mail sent to ${to}: ${data.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error(`📧 Mail send exception: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * يبني رابط استعادة كلمة المرور.
 */
export function buildResetUrl(token) {
  return `${APP_BASE_URL}/reset-password?token=${token}`;
}

/**
 * يبني قالب HTML لبريد استعادة كلمة المرور.
 */
export function buildResetEmailHTML({ token, userEmail, companyName }) {
  const resetLink = buildResetUrl(token);
  const company = companyName || 'بِنَاء ERP';
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>استعادة كلمة المرور</title>
</head>
<body style="font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; background: #f3f4f6; padding: 24px; margin: 0; direction: rtl;">
  <table style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <tr>
      <td style="background: #059669; padding: 20px 28px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 800;">${company}</h1>
        <p style="color: #d1fae5; margin: 4px 0 0; font-size: 12px;">نظام إدارة المقاولات</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px;">
        <h2 style="color: #111827; margin: 0 0 16px; font-size: 18px;">استعادة كلمة المرور</h2>
        <p style="color: #4b5563; line-height: 1.7; font-size: 14px; margin: 0 0 16px;">
          تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك <strong dir="ltr">${userEmail}</strong>.
        </p>
        <p style="color: #4b5563; line-height: 1.7; font-size: 14px; margin: 0 0 24px;">
          اضغط على الزر أدناه لضبط كلمة مرور جديدة. الرابط صالح لمدة ساعة واحدة فقط.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="display: inline-block; background: #059669; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 700; font-size: 15px;">
            إعادة تعيين كلمة المرور
          </a>
        </div>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6; margin: 0 0 12px;">
          إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:
        </p>
        <p style="background: #f9fafb; padding: 10px; border-radius: 6px; word-break: break-all; font-size: 11px; color: #4b5563; direction: ltr; text-align: left; margin: 0 0 24px;">
          ${resetLink}
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 11px; line-height: 1.6; margin: 0;">
          إذا لم تطلب استعادة كلمة المرور، تجاهل هذه الرسالة. لن يتغير أي شيء في حسابك.<br>
          هذا البريد مُرسل تلقائياً — لا ترد عليه.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
