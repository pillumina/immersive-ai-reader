import { ReactNode, useId } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

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

export function DialogContent({
  children,
  className = '',
  title = 'Dialog',
  description,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  const generatedId = useId();
  const descId = description ? `dialog-desc-${generatedId}` : undefined;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content
        className={`dialog-content ${className}`}
        aria-describedby={descId}
      >
        <VisuallyHidden asChild>
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
        </VisuallyHidden>
        {description && (
          <VisuallyHidden asChild>
            <DialogPrimitive.Description id={descId}>
              {description}
            </DialogPrimitive.Description>
          </VisuallyHidden>
        )}
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
