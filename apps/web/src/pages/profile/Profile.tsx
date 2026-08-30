import { useAuth } from '../../hooks/useAuth';

export function Profile(): JSX.Element {
  const { user } = useAuth();
  if (!user) return <></>;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
      <div className="card space-y-3">
        <Field label="Full name" value={user.fullName} />
        {user.studentId && <Field label="Student ID" value={user.studentId} />}
        {user.staffId && <Field label="Staff ID" value={user.staffId} />}
        <Field label="Roles" value={user.roles.join(', ')} />
        <Field label="Status" value={user.status} />
      </div>
      <p className="text-sm text-slate-500">
        To change your password, use "Forgot password" on the sign-in page, or ask an administrator for an
        account-assisted reset.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
