"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Long-form GitHub-flavoured markdown for lesson prose / worked examples.
 * Styling comes from the `.prose-atlas` rules in globals.css (no typography
 * plugin dependency).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-atlas">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
