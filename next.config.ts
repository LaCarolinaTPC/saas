import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` (MGX) se carga de node_modules en el servidor y no se empaqueta: el
  // bundler intentaría resolver `pg-native`, que es opcional y no está.
  serverExternalPackages: ["pg"],
  experimental: {
    agentUpgrade: "security",
    // Documentos en el chat de prueba de Selección (PDF, Word…): hasta 4 MB por archivo, más la
    // codificación del formulario. Por defecto Next acepta 1 MB. (Vercel corta en ~4,5 MB por petición.)
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
