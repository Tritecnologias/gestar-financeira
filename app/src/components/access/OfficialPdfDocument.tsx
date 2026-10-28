"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

function PdfPage({ pdf, number, width, onPaint, onError }: {
  pdf: PDFDocumentProxy; number: number; width: number; onPaint: () => void; onError: () => void;
}) {
  const root = useRef<HTMLElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(number === 1), [ratio, setRatio] = useState(595 / 842);
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible || !root.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { root: root.current.closest(".term-reader-scroll"), rootMargin: "500px" });
    observer.observe(root.current); return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    let cancelled = false, render: RenderTask | undefined;
    void (async () => {
      const page = await pdf.getPage(number);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / unscaled.width });
      const element = canvas.current!, context = element.getContext("2d");
      if (!context) throw new Error("PDF_CANVAS_UNAVAILABLE");
      const density = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.floor(viewport.width * density); element.height = Math.floor(viewport.height * density);
      setRatio(viewport.width / viewport.height);
      render = page.render({ canvas: element, canvasContext: context, viewport,
        transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
      await render.promise;
      if (cancelled) return;
      const content = await page.getTextContent();
      if (!cancelled) { setText(content.items.map(item => "str" in item ? item.str : "").join(" ")); onPaint(); }
    })().catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; render?.cancel(); };
  }, [pdf, number, width, visible, onPaint, onError]);
  return <section ref={root} className="term-pdf-sheet" style={{ width, aspectRatio: ratio }} aria-label={`Página ${number} do PDF oficial`}>
    <canvas ref={canvas} aria-hidden="true" /><p className="term-pdf-accessible-text">{text || `Página ${number} do documento oficial.`}</p>
  </section>;
}

/** Both the canvas and accessible text are derived from the verified PDF bytes. */
export default function OfficialPdfDocument({ bytes, zoom, onReady, onError }: {
  bytes: Uint8Array; zoom: number; onReady: () => void; onError: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [width, setWidth] = useState(600);
  useEffect(() => {
    let cancelled = false, task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void import("pdfjs-dist").then(lib => {
      if (cancelled) return;
      lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const loading = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useWasm: false });
      task = loading; return loading.promise;
    }).then(document => { if (document && !cancelled) setPdf(document); })
      .catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [bytes, onError]);
  useEffect(() => {
    const element = scroll.current; if (!element) return;
    const resize = new ResizeObserver(() => setWidth(Math.max(200, Math.min(1100, element.clientWidth - (element.clientWidth < 600 ? 16 : 40)))));
    resize.observe(element); return () => resize.disconnect();
  }, []);
  return <div ref={scroll} className="term-reader-scroll" tabIndex={0} aria-label="Documento PDF oficial — área de leitura com rolagem">
    {pdf ? <div className="term-pdf-pages" data-page-count={pdf.numPages}>
      <span className="term-pdf-count">{pdf.numPages} {pdf.numPages === 1 ? "página" : "páginas"}</span>
      {Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i + 1} pdf={pdf} number={i + 1} width={Math.round(width * zoom / 100)} onPaint={onReady} onError={onError} />)}
    </div> : <p className="term-reader-loading" role="status">Preparando o PDF oficial…</p>}
  </div>;
}
