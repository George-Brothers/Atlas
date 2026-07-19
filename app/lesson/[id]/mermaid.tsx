"use client";

import { useEffect, useId, useState } from "react";

/**
 * Client-side Mermaid renderer. Mermaid is imported dynamically inside the
 * effect so it never runs during SSR (it needs the DOM). The diagram source is
 * authored text stored in the `mermaid` content block.
 */
export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
        });
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-md bg-zinc-100 p-4 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        {chart}
      </pre>
    );
  }

  return (
    <div
      className="flex justify-center overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      // Mermaid returns sanitized SVG (securityLevel: strict).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
