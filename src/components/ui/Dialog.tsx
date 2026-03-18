import { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-[#0f172a]/40 backdrop-blur-sm" />
      <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-2xl shadow-2xl border border-[#E5EAF3] w-full max-w-md">
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Title className="text-lg font-semibold mb-4">
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Description className="text-sm text-gray-600 mb-4">
      {children}
    </DialogPrimitive.Description>
  );
}

export const DialogClose = DialogPrimitive.Close;
