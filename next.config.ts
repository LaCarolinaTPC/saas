import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` (MGX) se carga de node_modules en el servidor y no se empaqueta: el
  // bundler intentaría resolver `pg-native`, que es opcional y no está.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
