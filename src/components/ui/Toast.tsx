import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const styles: Record<ToastProps['type'], { bg: string; ring: string }> = {
  success: {
    bg: 'linear-gradient(135deg, var(--color-success), #0f766e)',
    ring: 'var(--color-success)',
  },
  error: {
    bg: 'linear-gradient(135deg, var(--color-danger), #b91c1c)',
    ring: 'var(--color-danger)',
  },
  info: {
    bg: 'linear-gradient(135deg, var(--color-text-secondary), #57534e)',
    ring: 'var(--color-text-secondary)',
  },
};

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Mount animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  // Wait for exit animation to finish, then notify parent
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(onClose, 280);
    return () => clearTimeout(timer);
  }, [exiting, onClose]);

  const Icon = icons[type];
  const { bg, ring } = styles[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex max-w-[min(400px,calc(100vw-32px))] items-center gap-2.5 rounded-2xl px-4 py-3 text-white shadow-2xl ring-1 ring-inset transition-all duration-300 ${
        visible && !exiting
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-3 opacity-0 scale-95'
      }`}
      style={{
        backgroundImage: bg,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        // @ts-expect-error CSS custom property in ring
        '--tw-ring-color': ring,
      }}
    >
      <Icon size={16} className="shrink-0 opacity-90" />
      <span className="text-[13px] leading-snug font-medium">{message}</span>
      <button
        onClick={() => setExiting(true)}
        title="关闭提示"
        aria-label="关闭提示"
        className="ml-1 shrink-0 rounded-full p-0.5 transition-colors hover:bg-white/15"
      >
        <X size={14} />
      </button>
    </div>
  );
}
