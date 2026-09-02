/**
 * Client-side CSV export. No server round-trip needed - the data driving
 * these exports (top papers, daily trends) is already in the browser via
 * the same React Query cache the on-screen charts/tables render from, so
 * "export" just means serializing what's already there and triggering a
 * download - no new dependency, no new endpoint.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  // Prefix with a UTF-8 BOM so Excel (which otherwise guesses the system
  // codepage) renders non-ASCII paper titles correctly instead of mojibake.
  const blob = new Blob(['﻿', csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
