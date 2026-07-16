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
      />
      <main className="flex flex-1 flex-col overflow-auto bg-[#F8FAFC]">
        {children}
      </main>
    </div>
  );
}
