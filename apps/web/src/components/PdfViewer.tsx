import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PageSpinner } from './Spinner';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const THUMBNAIL_SCALE = 0.15;
// A real exam paper is never remotely this long; caps rendering cost
// against a pathological file rather than never rendering thumbnails at all.
const MAX_THUMBNAILS = 300;
const MIN_SEARCH_LENGTH = 2;

interface SearchMatch {
  page: number;
  snippet: string;
}

interface PdfViewerProps {
  url: string;
  title: string;
}

/**
 * Canvas-based PDF viewer (replaces the previous native <iframe> preview):
 * page-by-page rendering via pdfjs-dist, a page-thumbnail sidebar, zoom
 * controls, and in-document search. Search matches against each page's
 * extracted text content and jumps to the page - it lists matching pages
 * with a snippet rather than highlighting the exact glyphs in the canvas,
 * a deliberate simplification (a full text-layer overlay is real added
 * complexity for a benefit most users won't notice) rather than a cut
 * corner in what it actually does.
 *
 * Known accessibility limitation: canvas rendering has no text for a
 * screen reader to read, same as the iframe it replaces did with a
 * non-HTML PDF. The "Download" button (kept in PaperDetail.tsx, outside
 * this component) remains the accessible path to the actual document.
 */
export function PdfViewer({ url, title }: PdfViewerProps): JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docLoading, setDocLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageRendering, setPageRendering] = useState(false);
  const [scale, setScale] = useState(1.1);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textCacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setDocLoading(true);
    setLoadError(null);
    setCurrentPage(1);
    setThumbnails({});
    setSearchResults(null);
    setSearchQuery('');
    textCacheRef.current = new Map();

    const loadingTask = pdfjsLib.getDocument(url);
    loadingTask.promise
      .then((pdf) => {
        if (cancelled) return;
        setDoc(pdf);
        setDocLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load this document.');
        setDocLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!doc) return undefined;
    let cancelled = false;
    setPageRendering(true);

    (async () => {
      try {
        const page = await doc.getPage(currentPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === 'RenderingCancelledException')) {
          setLoadError(err instanceof Error ? err.message : 'Could not render this page.');
        }
      } finally {
        if (!cancelled) setPageRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [doc, currentPage, scale]);

  useEffect(() => {
    if (!doc) return undefined;
    let cancelled = false;
    const pageCount = Math.min(doc.numPages, MAX_THUMBNAILS);

    (async () => {
      for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
        if (cancelled) return;
        try {
          const page = await doc.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
          const dataUrl = canvas.toDataURL();
          setThumbnails((prev) => ({ ...prev, [pageNum]: dataUrl }));
        } catch {
          // A single failed thumbnail shouldn't stop the rest from rendering.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc]);

  async function ensureTextCache(pdf: PDFDocumentProxy): Promise<void> {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      if (textCacheRef.current.has(pageNum)) continue;
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      textCacheRef.current.set(pageNum, text);
    }
  }

  async function runSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!doc || trimmed.length < MIN_SEARCH_LENGTH) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      await ensureTextCache(doc);
      const needle = trimmed.toLowerCase();
      const matches: SearchMatch[] = [];
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
        const text = textCacheRef.current.get(pageNum) ?? '';
        const idx = text.toLowerCase().indexOf(needle);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + needle.length + 40);
        const snippet = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
        matches.push({ page: pageNum, snippet });
      }
      setSearchResults(matches);
    } finally {
      setSearching(false);
    }
  }

  if (docLoading) return <PageSpinner />;

  if (loadError && !doc) {
    return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>;
  }

  if (!doc) return <PageSpinner />;

  const pageCount = doc.numPages;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 md:flex-row">
      <div className="flex max-h-40 shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2 md:max-h-[70vh] md:w-40 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r">
        {Array.from({ length: Math.min(pageCount, MAX_THUMBNAILS) }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            aria-label={`Go to page ${pageNum}`}
            aria-current={currentPage === pageNum ? 'true' : undefined}
            onClick={() => setCurrentPage(pageNum)}
            className={`shrink-0 rounded border-2 p-0.5 transition-colors ${currentPage === pageNum ? 'border-brand-600' : 'border-transparent hover:border-slate-300'}`}
          >
            {thumbnails[pageNum] ? (
              <img src={thumbnails[pageNum]} alt="" className="w-20 md:w-full" />
            ) : (
              <div className="skeleton h-28 w-20 md:w-full" />
            )}
            <span className="mt-0.5 block text-center text-xs text-slate-500">{pageNum}</span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-secondary px-2 py-1"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[6rem] text-center text-sm text-slate-600">
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className="btn-secondary px-2 py-1"
              aria-label="Next page"
              disabled={currentPage >= pageCount}
              onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-secondary px-2 py-1"
              aria-label="Zoom out"
              disabled={scale <= MIN_SCALE}
              onClick={() => setScale((s) => Math.max(MIN_SCALE, Math.round((s - SCALE_STEP) * 100) / 100))}
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[3.5rem] text-center text-sm text-slate-600">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              className="btn-secondary px-2 py-1"
              aria-label="Zoom in"
              disabled={scale >= MAX_SCALE}
              onClick={() => setScale((s) => Math.min(MAX_SCALE, Math.round((s + SCALE_STEP) * 100) / 100))}
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(searchQuery);
            }}
          >
            <label htmlFor="pdf-search" className="sr-only">Search in document</label>
            <input
              id="pdf-search"
              type="search"
              className="input h-8 w-40 py-1 text-sm"
              placeholder="Search in document…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="btn-secondary px-2 py-1" aria-label="Search" disabled={searching}>
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
            {searchResults !== null && (
              <button
                type="button"
                className="btn-secondary px-2 py-1"
                aria-label="Clear search"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults(null);
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </form>
        </div>

        {searchResults !== null && (
          <div className="max-h-40 overflow-y-auto border-b border-slate-200 bg-slate-50 p-2 text-sm" role="status">
            {searching ? (
              <p className="text-slate-500">Searching…</p>
            ) : searchResults.length === 0 ? (
              <p className="text-slate-500">No matches for &ldquo;{searchQuery.trim()}&rdquo;.</p>
            ) : (
              <ul className="space-y-1">
                {searchResults.map((match) => (
                  <li key={match.page}>
                    <button type="button" className="text-left text-brand-700 hover:underline" onClick={() => setCurrentPage(match.page)}>
                      <span className="font-medium">Page {match.page}:</span> {match.snippet}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loadError && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        )}

        <div className="relative flex flex-1 items-start justify-center overflow-auto bg-slate-100 p-4">
          {pageRendering && <div className="skeleton absolute inset-4" />}
          <canvas ref={canvasRef} role="img" aria-label={`${title}, page ${currentPage} of ${pageCount}`} className="relative shadow-sm" />
        </div>
      </div>
    </div>
  );
}
