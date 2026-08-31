import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * ConfirmDialog (Loop 13) is now the only confirmation UI for every
 * destructive action in the app (reject/archive/publish a paper,
 * suspend a user, reject a question - see PaperDetail.tsx,
 * AdminUsers.tsx, QuestionBank.tsx). A regression here would silently
 * make one of those either impossible to confirm or impossible to
 * cancel, so it gets its own direct coverage rather than relying on
 * each call site's own tests (which are backend-mocked and don't
 * render this dialog).
 */
describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog open={false} onOpenChange={() => {}} title="Delete this?" description="This cannot be undone." onConfirm={() => {}} />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders the title/description and calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Suspend this account?"
        description="They will be signed out immediately."
        confirmLabel="Suspend account"
        destructive
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Suspend this account?');
    expect(screen.getByText('They will be signed out immediately.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange(false) when Cancel is clicked, without calling onConfirm', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Reject this paper?" description="The uploader will be notified." onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes when Escape is pressed', () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Archive this paper?" description="Students will no longer find it in search." onConfirm={() => {}} />,
    );

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a working label and disables the confirm button while isLoading', () => {
    render(
      <ConfirmDialog open onOpenChange={() => {}} title="Publish this paper?" description="This makes it visible to every student." confirmLabel="Publish" onConfirm={() => {}} isLoading />,
    );
    const confirmButton = screen.getByRole('button', { name: 'Working…' });
    expect(confirmButton).toBeDisabled();
  });
});
