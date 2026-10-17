"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import "@fortune-sheet/react/dist/index.css";

const Workbook = dynamic(
  () =>
    import("@fortune-sheet/react")
      .then((mod) => mod.Workbook)
      .catch((err) => {
        console.error("Dynamic import failed:", err);
        throw err;
      }),
  { ssr: false, loading: () => <div className="p-4 text-amber-400">Loading Workbook bundle...</div> }
);

export default function SheetBenchmarkPage() {
  const [data, setData] = useState<any[]>([]);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<{
    genTimeMs: number;
    mountTimeMs: number;
    rows: number;
    cols: number;
  } | null>(null);

  useEffect(() => {
    const handleErr = (evt: ErrorEvent) => {
      setErrorLog((prev) => [...prev, `${evt.message} at ${evt.filename}:${evt.lineno}`]);
    };
    window.addEventListener("error", handleErr);

    try {
      const t0 = performance.now();
      const rowCount = 10000;
      const colCount = 50;
      const celldata: any[] = [];

      for (let r = 0; r < rowCount; r++) {
        celldata.push({ r, c: 0, v: { v: r + 1, m: String(r + 1), ct: { fa: "General", t: "n" } } });
        celldata.push({ r, c: 1, v: { v: 100 + r, m: String(100 + r), ct: { fa: "General", t: "n" } } });
        celldata.push({ r, c: 2, v: { v: 200 + r, m: String(200 + r), ct: { fa: "General", t: "n" } } });
        celldata.push({
          r,
          c: 3,
          v: { f: `=SUM(A${r + 1}:C${r + 1})`, v: (r + 1) + (100 + r) + (200 + r), m: String((r + 1) + (100 + r) + (200 + r)), ct: { fa: "General", t: "n" } }
        });
        celldata.push({ r, c: 4, v: { v: `Item #${r + 1}`, m: `Item #${r + 1}`, ct: { fa: "General", t: "s" } } });
      }

      const t1 = performance.now();
      const sheet = {
        name: "Benchmark 10k x 50",
        id: "sheet_bench_1",
        row: rowCount,
        column: colCount,
        celldata,
        status: 1,
      };

      setData([sheet]);
      const t2 = performance.now();
      setMetrics({
        genTimeMs: Math.round(t1 - t0),
        mountTimeMs: Math.round(t2 - t1),
        rows: rowCount,
        cols: colCount,
      });
    } catch (e: any) {
      setErrorLog((prev) => [...prev, `Setup error: ${e.message || String(e)}`]);
    }

    return () => window.removeEventListener("error", handleErr);
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-[var(--bg)] text-white">
      <div id="benchmark-header" className="p-3 bg-[var(--panel)] border-b border-[var(--border)] flex items-center justify-between text-xs">
        <span className="font-bold">FortuneSheet 10k x 50 Benchmark</span>
        {metrics && (
          <span id="benchmark-metrics" className="text-emerald-400 font-mono">
            Generated {metrics.rows.toLocaleString()} rows x {metrics.cols} cols in {metrics.genTimeMs}ms (State ready: {metrics.mountTimeMs}ms)
          </span>
        )}
      </div>
      {errorLog.length > 0 && (
        <div id="error-log" className="p-3 bg-red-900 text-white text-xs space-y-1">
          {errorLog.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
      <div className="w-full relative" style={{ height: "calc(100vh - 60px)" }}>
        {data.length > 0 && (
          <Workbook data={data} showToolbar={true} showFormulaBar={true} />
        )}
      </div>
    </div>
  );
}
