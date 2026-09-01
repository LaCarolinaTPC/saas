// Rutas sin sesión. Nada de lo que cuelgue de aquí puede llamar a
// getCurrentPermissions ni asumir un usuario autenticado.
export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
