import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-slate-800',
  }[type];

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-4 py-3 rounded-xl shadow-xl border border-white/10 flex items-center gap-3 z-50 max-w-[420px]`}>
      <span className="text-sm leading-relaxed">{message}</span>
      <button onClick={onClose} className="hover:opacity-80">
        <X size={16} />
      </button>
    </div>
  );
}
