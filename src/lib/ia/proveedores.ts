/** Proveedores de IA que Gestivo sabe usar. Sin dependencias de servidor. */

export type ProveedorIA = "anthropic" | "openai" | "openrouter";

export const PROVEEDORES_IA: { id: ProveedorIA; nombre: string; prefijo: string; donde: string; url: string }[] = [
  {
    id: "openrouter",
    nombre: "OpenRouter",
    prefijo: "sk-or-",
    donde: "openrouter.ai → Keys → Create Key (requiere créditos cargados)",
    url: "https://openrouter.ai/settings/keys",
  },
  {
    id: "anthropic",
    nombre: "Claude (Anthropic)",
    prefijo: "sk-ant-",
    donde: "platform.claude.com → API Keys → Create Key",
    url: "https://platform.claude.com/settings/keys",
  },
  {
    id: "openai",
    nombre: "OpenAI",
    prefijo: "sk-",
    donde: "platform.openai.com → API keys. También la usa la transcripción de accidentes",
    url: "https://platform.openai.com/api-keys",
  },
];

export function nombreProveedor(id: ProveedorIA): string {
  return PROVEEDORES_IA.find((p) => p.id === id)?.nombre ?? id;
}
