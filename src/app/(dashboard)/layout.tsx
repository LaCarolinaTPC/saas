import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentPermissions } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perms = await getCurrentPermissions();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        allowedModules={perms.modules}
        allowedSubmodules={perms.submodules}
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
  );
}
