import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { WebhookConfigForm } from "./config-form";

export default async function WebhookConfigPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: config, error } = await supabase
    .from("webhook_configs")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !config) notFound();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Configurar Integración</h1>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/integraciones" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Volver a integraciones
        </Link>

        <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">{config.name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              URL del webhook: <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">https://gestivo.vercel.app/api/webhooks/{config.slug}</code>
            </p>
          </div>

          <WebhookConfigForm config={config} />
        </div>
      </div>
    </div>
  );
}
