import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, ApiError } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';

interface UserRow {
  id: string;
  student_id: string | null;
  staff_id: string | null;
  full_name: string;
  status: string;
  user_roles: Array<{ roles: { name: string } | null }>;
}

const STAFF_ROLES = ['LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

const STATUS_BADGE_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  DEACTIVATED: 'bg-slate-200 text-slate-600',
};

export function AdminUsers(): JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [createdCredential, setCreatedCredential] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', staffId: '', role: 'LECTURER' as (typeof STAFF_ROLES)[number] });

  const usersQuery = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<{ items: UserRow[] }>('/admin/users') });

  const createStaff = useMutation({
    mutationFn: () => api.post<{ email: string; temporaryPassword: string }>('/admin/staff', form),
    onSuccess: (res) => {
      setCreatedCredential(res);
      setForm({ fullName: '', email: '', staffId: '', role: 'LECTURER' });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create account'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/admin/users/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Users</h1>

      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setCreatedCredential(null);
          createStaff.mutate();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Provision a staff account</h2>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {createdCredential && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Account created for {createdCredential.email}. Temporary password: <code className="font-mono">{createdCredential.temporaryPassword}</code>
            {' '}- share it through a secure channel; the user should change it after first login.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="staffId">Staff ID</label>
            <input id="staffId" className="input" required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="role">Role</label>
            <select id="role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={createStaff.isPending}>
          {createStaff.isPending ? 'Creating…' : 'Create staff account'}
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">All users</h2>
        {usersQuery.isLoading || !usersQuery.data ? (
          <PageSpinner />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">ID</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Roles</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersQuery.data.items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-medium text-slate-900">{u.full_name}</td>
                    <td className="px-4 py-2 text-slate-600">{u.student_id ?? u.staff_id}</td>
                    <td className="px-4 py-2 text-slate-600">{u.user_roles.map((r) => r.roles?.name).filter(Boolean).join(', ')}</td>
                    <td className="px-4 py-2">
                      <span className={clsx('badge', STATUS_BADGE_STYLES[u.status] ?? 'bg-slate-100 text-slate-700')}>{u.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {u.status === 'ACTIVE' ? (
                        <button type="button" className="btn-danger" onClick={() => updateStatus.mutate({ id: u.id, status: 'SUSPENDED' })}>Suspend</button>
                      ) : u.status === 'PENDING' ? (
                        <button type="button" className="btn-primary" onClick={() => updateStatus.mutate({ id: u.id, status: 'ACTIVE' })}>Activate</button>
                      ) : (
                        <button type="button" className="btn-secondary" onClick={() => updateStatus.mutate({ id: u.id, status: 'ACTIVE' })}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
