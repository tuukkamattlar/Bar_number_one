import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import { loadPdf } from '../lib/pdf';

interface Props {
  url: string;
  pageNumber: number;
  /** Drawn exactly over the rendered page (e.g. sticky notes), positioned in % of the page. */
  overlay?: ReactNode;
  /** When set, a tap on the page reports where it landed (0–1 across and down) instead of bubbling. */
  onPick?: (x: number, y: number) => void;
}

/** Renders one PDF page scaled to fit (contain) its parent box, sharp on high-DPI screens. */
export function PdfPage({ url, pageNumber, overlay, onPick }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2 ? prev : { w: width, h: height },
      );
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!size || size.w < 10 || size.h < 10) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    setError(null);

    (async () => {
      try {
        const doc = await loadPdf(url);
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(size.w / base.width, size.h / base.height);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        // Render offscreen, then swap in one go, so a page never appears half-drawn.
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.floor(viewport.width);
        offscreen.height = Math.floor(viewport.height);
        task = page.render({ canvas: offscreen, viewport });
        await task.promise;
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        canvas.getContext('2d')!.drawImage(offscreen, 0, 0);
        setReady(true);
      } catch (e) {
        if (!cancelled && (e as Error)?.name !== 'RenderingCancelledException') {
          setError((e as Error)?.message ?? 'Could not render page');
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, pageNumber, size]);

  return (
    <div ref={boxRef} className="pdf-page">
      {error ? (
        <div className="pdf-error">Couldn’t show this page — {error}</div>
      ) : (
        <div
          className={`pdf-sheet ${onPick ? 'picking' : ''}`}
          onClick={
            onPick &&
            ((e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onPick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            })
          }
        >
          <canvas ref={canvasRef} className={ready ? 'ready' : ''} />
          {ready && overlay}
        </div>
      )}
    </div>
  );
}
