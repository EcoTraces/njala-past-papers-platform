import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { api, ApiError } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface Field {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'checkbox';
}

interface Resource {
  key: string;
  label: string;
  path: string;
  fields: Field[];
  displayName: (item: Record<string, unknown>) => string;
}

const RESOURCES: Resource[] = [
  { key: 'faculties', label: 'Faculties', path: '/faculties', fields: [{ name: 'name', label: 'Name' }, { name: 'code', label: 'Code' }], displayName: (i) => `${i.code} - ${i.name}` },
  { key: 'departments', label: 'Departments', path: '/departments', fields: [{ name: 'name', label: 'Name' }, { name: 'code', label: 'Code' }, { name: 'facultyId', label: 'Faculty ID' }], displayName: (i) => `${i.code} - ${i.name}` },
  { key: 'programmes', label: 'Programmes', path: '/programmes', fields: [{ name: 'name', label: 'Name' }, { name: 'code', label: 'Code' }, { name: 'departmentId', label: 'Department ID' }], displayName: (i) => `${i.code} - ${i.name}` },
  { key: 'courses', label: 'Courses', path: '/courses', fields: [{ name: 'code', label: 'Code' }, { name: 'title', label: 'Title' }, { name: 'departmentId', label: 'Department ID' }], displayName: (i) => `${i.code} - ${i.title}` },
  {
    key: 'academic-years',
    label: 'Academic Years',
    path: '/academic-years',
    fields: [{ name: 'name', label: 'Name (YYYY/YYYY)' }, { name: 'startDate', label: 'Start date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' }],
    displayName: (i) => String(i.name),
  },
  {
    key: 'semesters',
    label: 'Semesters',
    path: '/semesters',
    fields: [{ name: 'name', label: 'Name' }, { name: 'academicYearId', label: 'Academic Year ID' }, { name: 'startDate', label: 'Start date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' }],
    displayName: (i) => String(i.name),
  },
];

export function AcademicStructure(): JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Academic structure</h1>
      <Tabs.Root defaultValue="faculties">
        <Tabs.List className="mb-6 flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">
          {RESOURCES.map((r) => (
            <Tabs.Trigger key={r.key} value={r.key} className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow">
              {r.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {RESOURCES.map((r) => (
          <Tabs.Content key={r.key} value={r.key}>
            <ResourcePanel resource={r} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}

function ResourcePanel({ resource }: { resource: Resource }): JSX.Element {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [resource.key],
    queryFn: () => api.get<{ items: Array<Record<string, unknown>> }>(resource.path),
  });

  const create = useMutation({
    mutationFn: () => api.post(resource.path, values),
    onSuccess: () => {
      setValues({});
      void queryClient.invalidateQueries({ queryKey: [resource.key] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create record'),
  });

  return (
    <div className="space-y-6">
      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Add {resource.label.toLowerCase().slice(0, -1)}</h2>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          {resource.fields.map((f) => (
            <div key={f.name}>
              <label className="label" htmlFor={`${resource.key}-${f.name}`}>{f.label}</label>
              <input
                id={`${resource.key}-${f.name}`}
                type={f.type ?? 'text'}
                className="input"
                required
                value={values[f.name] ?? ''}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add'}
        </button>
      </form>

      {listQuery.isLoading || !listQuery.data ? (
        <PageSpinner />
      ) : listQuery.data.items.length === 0 ? (
        <EmptyState title={`No ${resource.label.toLowerCase()} yet`} />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {listQuery.data.items.map((item) => (
            <li key={String(item.id)} className="px-4 py-2 text-sm text-slate-700">{resource.displayName(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
