"use client";

import { useState } from "react";
import { Zap, Check, X, Loader2 } from "lucide-react";
import { testWebhookConnection } from "@/lib/actions";

export function TestWebhookButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleTest() {
    setStatus("loading");
    try {
      const result = await testWebhookConnection();
      setStatus(result.success ? "success" : "error");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <button
      onClick={handleTest}
      disabled={status === "loading"}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
        status === "success"
          ? "border-green-300 bg-green-50 text-green-700"
          : status === "error"
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-[#E2E8F0] bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
      {status === "success" && <Check className="h-4 w-4" />}
      {status === "error" && <X className="h-4 w-4" />}
      {status === "idle" && <Zap className="h-4 w-4" />}
      {status === "loading" ? "Probando..." : status === "success" ? "Conectado" : status === "error" ? "Error" : "Probar Webhook"}
    </button>
  );
}
