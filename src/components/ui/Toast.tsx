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

const colors = {
  success: 'from-emerald-600 to-emerald-700 ring-emerald-500/20',
  error: 'from-rose-600 to-rose-700 ring-rose-500/20',
  info: 'from-slate-700 to-slate-800 ring-slate-500/20',
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

  return (
    <div
      className={`fixed top-5 right-5 z-50 flex max-w-[400px] items-center gap-2.5 rounded-2xl bg-gradient-to-br ${colors[type]} px-4 py-3 text-white shadow-2xl ring-1 ring-inset transition-all duration-280 ${
        visible && !exiting
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-3 opacity-0 scale-95'
      }`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <Icon size={16} className="shrink-0 opacity-90" />
      <span className="text-[13px] leading-snug font-medium">{message}</span>
      <button
        onClick={() => setExiting(true)}
        className="ml-1 shrink-0 rounded-full p-0.5 transition-colors hover:bg-white/15"
      >
        <X size={14} />
      </button>
    </div>
  );
}
