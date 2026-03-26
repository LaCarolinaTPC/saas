import {
  Settings,
  MessageSquare,
  UserPlus,
  FolderOpen,
  AlertCircle,
  Phone,
} from "lucide-react";
import { getWebhookLogs, getWebhookStats, getWebhookConfigs } from "@/lib/actions";
import { TestWebhookButton } from "./test-webhook-button";
import { NewIntegrationButton } from "./new-integration-button";
import { DeleteWebhookButton } from "./delete-webhook-button";
import { WebhookLogsTable } from "./webhook-logs-table";
import { timeAgoBogota } from "@/lib/utils";
import Link from "next/link";

// ── Server Component ─────────────────────────────────────────────────────────

export default async function IntegracionesPage() {
  const [logs, stats, configs] = await Promise.all([
    getWebhookLogs(),
    getWebhookStats(),
    getWebhookConfigs(),
  ]);

  const statCards = [
    {
      label: "Mensajes Recibidos",
      value: stats.messages.toLocaleString(),
      sub: null as string | null,
      subColor: "",
      icon: MessageSquare,
      iconBg: "bg-[#4F46E5]/10",
      iconColor: "text-[#4F46E5]",
    },
    {
      label: "Candidatos Creados",
      value: stats.candidatesCreated.toLocaleString(),
      sub: null as string | null,
      subColor: "",
      icon: UserPlus,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      label: "Archivos Clasificados",
      value: stats.classifiedDocs.toLocaleString(),
      sub: null as string | null,
      subColor: "",
      icon: FolderOpen,
      iconBg: "bg-[#4F46E5]/10",
      iconColor: "text-[#4F46E5]",
    },
    {
      label: "Pendientes Revision",
      value: stats.pendingReview.toLocaleString(),
      sub: null as string | null,
      subColor: "text-yellow-600",
      icon: AlertCircle,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Integraciones</h1>
      </div>

      <div className="px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Integraciones y Webhooks
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Gestiona conexiones con servicios externos y automatizaciones
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TestWebhookButton />
            <NewIntegrationButton />
          </div>
        </div>

        {/* Stat Cards */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl border border-[#E2E8F0] bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.iconBg}`}
                  >
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {card.value}
                    </p>
                    <p className="text-xs text-gray-500">{card.label}</p>
                    {card.sub && (
                      <p className={`text-xs font-medium ${card.subColor}`}>
                        {card.sub}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Integration Cards */}
        <div className="mb-6 space-y-3">
          {configs.map((cfg: Record<string, unknown>) => {
            const cfgSlug = cfg.slug as string;
            const lastLogForCfg = logs.find((l: Record<string, unknown>) => l.source === cfgSlug);

            return (
              <div key={cfg.id as string} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F46E5]/10">
                      <Phone className="h-6 w-6 text-[#4F46E5]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-gray-900">{cfg.name as string}</h3>
                        {!(cfg.is_active as boolean) && (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        https://gestivo.vercel.app/api/webhooks/{cfgSlug}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-400">
                      {lastLogForCfg
                        ? `Ultimo: ${timeAgoBogota(lastLogForCfg.created_at as string)}`
                        : "Sin actividad"}
                    </p>
                    <Link
                      href={`/integraciones/${cfgSlug}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Settings className="h-3.5 w-3.5" /> Configurar
                    </Link>
                    <DeleteWebhookButton id={cfg.id as string} name={cfg.name as string} />
                  </div>
                </div>
              </div>
            );
          })}
          {configs.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-8 text-center">
              <p className="text-sm text-gray-500">No hay integraciones configuradas</p>
              <p className="mt-1 text-xs text-gray-400">Crea una nueva integración para empezar a recibir webhooks</p>
            </div>
          )}
        </div>

        {/* Actividad Reciente del Webhook */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-6 py-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Actividad Reciente del Webhook
            </h3>
          </div>

          <WebhookLogsTable logs={logs as any} />
        </div>
      </div>
    </div>
  );
}
