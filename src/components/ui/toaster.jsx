import { CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

// Map each toast variant to its leading icon + color.
const ICONS = {
  default: { Icon: Info, color: "text-slate-500" },
  success: { Icon: CheckCircle2, color: "text-emerald-500" },
  destructive: { Icon: AlertCircle, color: "text-rose-500" },
  warning: { Icon: AlertTriangle, color: "text-amber-500" },
};

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, variant = "default", ...props }) {
        const { Icon, color } = ICONS[variant] || ICONS.default;
        return (
          <Toast key={id} variant={variant} {...props}>
            <Icon className={`size-5 shrink-0 mt-0.5 ${color}`} />
            <div className="grid gap-0.5 flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}