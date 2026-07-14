import Link from "next/link";
import { BookOpen } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { ApiKeysClient } from "./api-keys-client";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const perms = await getCurrentPermissions();

  if (!perms.isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">API</h1>
        </div>
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          Solo un administrador puede gestionar las API keys.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: keys } = await admin
    .from("api_keys")
    .select("id, name, key_prefix, is_active, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">API</h1>
        <Link
          href="/docs/api"
          target="_blank"
          className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <BookOpen className="h-4 w-4 text-[#4F46E5]" />
          Ver documentación
        </Link>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <ApiKeysClient keys={keys ?? []} />
      </div>
    </div>
  );
}
