"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
}

export default function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`p-1.5 hover:bg-surface-container rounded transition-all flex items-center justify-center shrink-0 border border-border-light cursor-pointer ${
        copied ? "bg-success/5 border-success/30 text-success" : "text-on-surface-variant"
      }`}
      title={copied ? "Tersalin!" : "Salin ke Papan Klip"}
    >
      <span className="material-symbols-outlined text-sm font-semibold">
        {copied ? "check" : "content_copy"}
      </span>
    </button>
  );
}
