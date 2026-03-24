import { createClient } from "@/lib/supabase/server";
import { Settings, User, Shield, Bell, Palette } from "lucide-react";

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Profile Section */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-center gap-3 mb-6">
            <User className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Perfil</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-[#F1F5F9]">
              <div>
                <p className="text-sm font-medium text-gray-900">Correo electrónico</p>
                <p className="text-sm text-gray-500">{user?.email ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-[#F1F5F9]">
              <div>
                <p className="text-sm font-medium text-gray-900">Nombre</p>
                <p className="text-sm text-gray-500">{user?.user_metadata?.full_name ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Seguridad</h2>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Contraseña</p>
              <p className="text-sm text-gray-500">Última actualización: —</p>
            </div>
            <button className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cambiar
            </button>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Notificaciones</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-[#F1F5F9]">
              <div>
                <p className="text-sm font-medium text-gray-900">Nuevos candidatos</p>
                <p className="text-sm text-gray-500">Recibir notificación cuando llega un nuevo candidato</p>
              </div>
              <div className="h-6 w-11 rounded-full bg-[#4F46E5] relative cursor-pointer">
                <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-[#F1F5F9]">
              <div>
                <p className="text-sm font-medium text-gray-900">Documentos por vencer</p>
                <p className="text-sm text-gray-500">Alerta cuando un documento está próximo a vencer</p>
              </div>
              <div className="h-6 w-11 rounded-full bg-[#4F46E5] relative cursor-pointer">
                <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Webhooks de Varylo</p>
                <p className="text-sm text-gray-500">Notificar errores en el procesamiento de webhooks</p>
              </div>
              <div className="h-6 w-11 rounded-full bg-[#4F46E5] relative cursor-pointer">
                <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
              </div>
            </div>
          </div>
        </div>

        {/* Webhook Config */}
        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Webhook de Varylo</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">URL del Webhook</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-sm text-gray-700">
                  https://tu-dominio.com/api/webhooks/varylo
                </code>
                <button className="rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Copiar
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Método</p>
              <p className="text-sm text-gray-500">POST</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Payload esperado</p>
              <pre className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs text-gray-600 overflow-x-auto">
{`{
  "from": "+573001234567",
  "name": "Nombre del candidato",
  "message_type": "text | image | document | audio",
  "content": "Contenido del mensaje"
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
