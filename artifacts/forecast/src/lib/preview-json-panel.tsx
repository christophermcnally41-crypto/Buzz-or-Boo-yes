import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Collapsible <details> panel that shows a pretty-printed JSON preview and
 * provides a "Copy" button that writes the JSON to the clipboard.
 *
 * Extracted so the behavior (toggle visibility, clipboard write, Copied! state)
 * can be tested in isolation without mocking the full admin forms.
 */
interface PreviewJsonPanelProps {
  json: string;
}

export function PreviewJsonPanel({ json }: PreviewJsonPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <details className="group">
      <summary
        className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none list-none flex items-center gap-1"
        aria-label="Preview JSON"
      >
        <span className="group-open:rotate-90 transition-transform inline-block" aria-hidden="true">▶</span>
        Preview JSON
      </summary>
      <div className="relative mt-2">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-background/80 border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          title="Copy JSON"
          aria-label={copied ? "Copied!" : "Copy JSON"}
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <pre
          data-testid="preview-json-pre"
          className="p-2 bg-muted/60 rounded text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all border border-border/40"
        >
          {json}
        </pre>
      </div>
    </details>
  );
}
