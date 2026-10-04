import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface Field {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'checkbox';
  parentKey?: string;
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
  { key: 'departments', label: 'Departments', path: '/departments', fields: [{ name: 'name', label: 'Name' }, { name: 'code', label: 'Code' }, { name: 'facultyId', label: 'Faculty', parentKey: 'faculties' }], displayName: (i) => `${i.code} - ${i.name}` },
  { key: 'programmes', label: 'Programmes', path: '/programmes', fields: [{ name: 'name', label: 'Name' }, { name: 'code', label: 'Code' }, { name: 'departmentId', label: 'Department', parentKey: 'departments' }], displayName: (i) => `${i.code} - ${i.name}` },
  { key: 'courses', label: 'Courses', path: '/courses', fields: [{ name: 'code', label: 'Code' }, { name: 'title', label: 'Title' }, { name: 'departmentId', label: 'Department', parentKey: 'departments' }], displayName: (i) => `${i.code} - ${i.title}` },
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
    fields: [{ name: 'name', label: 'Name' }, { name: 'academicYearId', label: 'Academic Year', parentKey: 'academic-years' }, { name: 'startDate', label: 'Start date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' }],
    displayName: (i) => String(i.name),
  },
];

export function AcademicStructure(): JSX.Element {
  const [activeTab, setActiveTab] = useState('faculties');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Academic structure</h1>
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="mb-6 flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">
          {RESOURCES.map((r) => (
            <Tabs.Trigger id={`academic-structure-tab-${r.key}`} key={r.key} value={r.key} className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow">
              {r.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {RESOURCES.map((r) => (
          <Tabs.Content key={r.key} value={r.key}>
            <ResourcePanel resource={r} onSelectTab={setActiveTab} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}

function ResourcePanel({ resource, onSelectTab }: { resource: Resource; onSelectTab: (key: string) => void }): JSX.Element {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [resource.key],
    queryFn: () => api.get<{ items: Array<Record<string, unknown>> }>(resource.path),
  });
  const parentFields = resource.fields.filter((field) => field.parentKey);
  const parentQueries = useQueries({
    queries: parentFields.map((field) => {
      const parent = RESOURCES.find((candidate) => candidate.key === field.parentKey)!;
      return {
        queryKey: [parent.key],
        queryFn: () => api.get<{ items: Array<Record<string, unknown>> }>(parent.path),
      };
    }),
  });
  const parentsReady = parentQueries.every((query) => query.isSuccess && Boolean(query.data?.items.length));

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
              {f.parentKey ? (
                (() => {
                  const index = parentFields.findIndex((parentField) => parentField.name === f.name);
                  const parent = RESOURCES.find((candidate) => candidate.key === f.parentKey)!;
                  const query = parentQueries[index]!;
                  return (
                    <ParentSelect
                      field={f}
                      parent={parent}
                      resourceKey={resource.key}
                      value={values[f.name] ?? ''}
                      items={query.data?.items ?? []}
                      isLoading={query.isLoading}
                      isError={query.isError}
                      onRetry={() => void query.refetch()}
                      onChange={(value) => setValues({ ...values, [f.name]: value })}
                      onSelectTab={onSelectTab}
                    />
                  );
                })()
              ) : (
                <input
                  id={`${resource.key}-${f.name}`}
                  type={f.type ?? 'text'}
                  className="input"
                  required
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        <button type="submit" className="btn-primary" disabled={create.isPending || !parentsReady}>
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

function ParentSelect({
  field,
  parent,
  resourceKey,
  value,
  items,
  isLoading,
  isError,
  onRetry,
  onChange,
  onSelectTab,
}: {
  field: Field;
  parent: Resource;
  resourceKey: string;
  value: string;
  items: Array<Record<string, unknown>>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onChange: (value: string) => void;
  onSelectTab: (key: string) => void;
}): JSX.Element {
  if (isError) {
    return (
      <div>
        <p role="alert" className="mb-2 text-sm text-red-700">Could not load {parent.label.toLowerCase()}.</p>
        <button type="button" className="text-sm font-medium text-brand-700 underline" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No {parent.label.toLowerCase()} exist.{' '}
        <Link
          to={`#academic-structure-tab-${parent.key}`}
          onClick={(event) => {
            event.preventDefault();
            onSelectTab(parent.key);
          }}
          className="font-medium text-brand-700 underline"
        >
          Add a {parent.label.slice(0, -1).toLowerCase()} first
        </Link>
      </p>
    );
  }

  return (
    <select
      id={`${resourceKey}-${field.name}`}
      className="input"
      required
      disabled={isLoading}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{isLoading ? 'Loading…' : `Select ${field.label.toLowerCase()}`}</option>
      {items.map((item) => (
        <option key={String(item.id)} value={String(item.id)}>{parent.displayName(item)}</option>
      ))}
    </select>
  );
}
