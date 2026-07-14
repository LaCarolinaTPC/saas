"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Bloque de código oscuro estilo Stripe con botón de copiar.
export function CodeBlock({
  code,
  title,
}: {
  code: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#0F172A]">
      <div className="flex items-center justify-between border-b border-[#1E293B] px-4 py-2">
        <span className="text-xs font-medium text-[#94A3B8]">{title ?? ""}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#94A3B8] transition-colors hover:bg-[#1E293B] hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="p-4 text-[13px] leading-relaxed text-[#E2E8F0]">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
