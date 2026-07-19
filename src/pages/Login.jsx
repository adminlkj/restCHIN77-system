import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import RestaurantLogo from "@/components/shared/RestaurantLogo";

// خلفية احترافية لمطعم — تُستبدل لاحقاً بصورة المطعم نفسه إن توفّرت.
const BG_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // نستخدم login() من AuthContext لتحديث حالة المصادقة داخل الـ SPA،
      // ثم نتنقّل لجذر التطبيق دون إعادة تحميل الصفحة كاملةً (يحافظ على حالة المتجر).
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      // ميّز رسالة الخطأ: الحساب معطّل (بانتظار الموافقة) ← رسالة أوضح للمستخدم.
      if (err?.status === 403 || /inactive|not registered|not approved/i.test(err?.message || "")) {
        setError("حسابك غير مُفعّل بعد — بانتظار موافقة مسؤول النظام");
      } else {
        setError(err.message || "بيانات الدخول غير صحيحة");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="relative min-h-screen w-full overflow-hidden flex items-center justify-center p-4">
      {/* Animated restaurant background */}
      <div
        className="absolute inset-0 bg-cover bg-center animate-kenburns"
        style={{ backgroundImage: `url(${BG_IMAGE})` }}
        aria-hidden="true"
      />
      {/* Warm-to-dark gradient overlay tuned to restaurant ambiance */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-amber-900/30" aria-hidden="true" />

      {/* Glass login card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8">
          <div className="flex flex-col items-center text-center mb-7">
            <RestaurantLogo className="w-16 h-16 shadow-lg mb-4" rounded="rounded-2xl" tint="bg-amber-600" />
            <h1 className="text-2xl font-bold text-white">مرحباً بعودتك</h1>
            <p className="text-sm text-white/70 mt-1">سجّل الدخول إلى نظام المطعم</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/20 border border-rose-400/30 text-rose-100 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/90">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" aria-hidden="true" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10 h-12 bg-white/10 border-white/25 text-white placeholder:text-white/40 focus-visible:ring-orange-400/60"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-white/90">كلمة المرور</Label>
                <Link to="/forgot-password" className="text-xs text-orange-300 hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" aria-hidden="true" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-10 h-12 bg-white/10 border-white/25 text-white placeholder:text-white/40 focus-visible:ring-orange-400/60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-12 font-medium bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-0 shadow-lg shadow-orange-500/25"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري تسجيل الدخول...
                </>
              ) : (
                "تسجيل الدخول"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-white/70 mt-6">
            ليس لديك حساب؟{" "}
            <Link to="/register" className="text-orange-300 font-medium hover:underline">
              أنشئ حساباً
            </Link>
          </p>

          <div className="mt-6 pt-5 border-t border-white/15">
            <p className="text-center text-xs text-white/50 mb-3">للتواصل مع المطور</p>
            <div className="flex items-center justify-center gap-3">
              <a
                href="https://wa.me/966532033832"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="تواصل عبر واتساب"
                className="w-11 h-11 rounded-full bg-emerald-500/90 hover:bg-emerald-500 flex items-center justify-center text-white shadow-lg transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
              <a
                href="mailto:fysl71443@gmail.com"
                aria-label="تواصل عبر البريد الإلكتروني"
                className="w-11 h-11 rounded-full bg-orange-500/90 hover:bg-orange-500 flex items-center justify-center text-white shadow-lg transition-colors"
              >
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}