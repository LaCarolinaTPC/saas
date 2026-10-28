import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { LatidoTareas } from "@/components/layout/latido-tareas";
import { PermisosProvider } from "@/components/permisos/permisos-provider";
import { getCurrentPermissions } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perms = await getCurrentPermissions();
  // El super los tiene todos: no hace falta mandar la lista.
  const permisos = perms.isAdmin ? [] : [...perms.efectivos.permisos];

  return (
    // El provider abarca menú y contenido: las preferencias del menú (ancho,
    // grupos abiertos) viven en el navegador y las comparten ambos lados.
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          // Permisos efectivos: el menú los filtra con el mismo motor que el
          // proxy (src/lib/permisos/motor.ts).
          permisos={permisos}
          isAdmin={perms.isAdmin}
          userEmail={perms.userEmail}
          userType={perms.userType}
        />
        {/* min-w-0: sin esto el flex item se estira al ancho de su contenido (min-width:auto),
            y una tabla ancha se sale del contenedor `overflow-hidden` sin generar scroll. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-[#F8FAFC]">
          <PermisosProvider permisos={permisos} superUsuario={perms.isAdmin}>
            {children}
          </PermisosProvider>
        </main>
      </div>
      {/* Tareas programadas estilo wp-cron: ver src/lib/tareas. */}
      <LatidoTareas />

    </SidebarProvider>
  );
}
