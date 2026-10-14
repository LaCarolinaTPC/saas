import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { getCurrentPermissions } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perms = await getCurrentPermissions();

  return (
    // El provider abarca menú y contenido: las preferencias del menú (ancho,
    // grupos abiertos) viven en el navegador y las comparten ambos lados.
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          allowedModules={perms.modules}
          allowedSubmodules={perms.submodules}
          // Los módulos ya llegan efectivos en perms.modules; las sub-funciones
          // necesitan los ajustes aparte para aplicar la misma regla que el
          // middleware y el servidor.
          allowedSubsIndividuales={perms.individuales.submodulos ?? {}}
          isAdmin={perms.isAdmin}
          userEmail={perms.userEmail}
          userType={perms.userType}
        />
        {/* min-w-0: sin esto el flex item se estira al ancho de su contenido (min-width:auto),
            y una tabla ancha se sale del contenedor `overflow-hidden` sin generar scroll. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-[#F8FAFC]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
