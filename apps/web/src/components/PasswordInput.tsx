import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className = 'input', ...props },
  ref,
): JSX.Element {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...props} ref={ref} type={visible ? 'text' : 'password'} className={`${className} pr-10`} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
      </button>
    </div>
  );
});
