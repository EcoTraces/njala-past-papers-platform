import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the destructive (red) style. */
  destructive?: boolean;
  onConfirm: () => void;
  isLoading?: boolean;
}

/**
 * A focus-trapped, Escape-closing, backdrop-click-closing confirmation
 * dialog for any action worth a second thought (reject/archive a
 * paper, suspend a user, reject a question, ...). Built on
 * @radix-ui/react-dialog (already a dependency, previously unused
 * anywhere in the app) rather than `window.confirm`, so it can be
 * styled consistently and is screen-reader-announced as a real dialog
 * (`role="alertdialog"`, labelled/described via `aria-labelledby`/
 * `aria-describedby` that Radix wires up automatically from
 * Dialog.Title/Dialog.Description).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          role="alertdialog"
          aria-describedby="confirm-dialog-description"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none"
          onOpenAutoFocus={(e) => {
            // Focus the cancel button, not the (often destructive)
            // confirm button, so a stray Enter/Space keypress right
            // after the dialog opens never accidentally confirms.
            e.preventDefault();
            document.getElementById('confirm-dialog-cancel')?.focus();
          }}
        >
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
              </div>
            )}
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">{title}</Dialog.Title>
              <Dialog.Description id="confirm-dialog-description" className="mt-1 text-sm text-slate-600">
                {description}
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button id="confirm-dialog-cancel" type="button" className="btn-secondary">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={destructive ? 'btn-danger' : 'btn-primary'}
              disabled={isLoading}
              onClick={onConfirm}
            >
              {isLoading ? 'Working…' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
