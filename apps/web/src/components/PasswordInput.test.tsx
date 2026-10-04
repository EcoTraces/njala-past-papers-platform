import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('toggles visibility with an accessible non-submit button', () => {
    render(
      <form>
        <PasswordInput aria-label="Password" />
        <button type="submit">Submit</button>
      </form>,
    );

    const input = screen.getByLabelText('Password');
    const showButton = screen.getByRole('button', { name: 'Show password' });

    expect(input).toHaveAttribute('type', 'password');
    expect(showButton).toHaveAttribute('type', 'button');
    fireEvent.click(showButton);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('type', 'button');
  });
});
