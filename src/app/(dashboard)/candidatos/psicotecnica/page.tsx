import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Brain } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { datosPsico } from "./actions";
import { PsicoClient } from "./psico-client";

export const dynamic = "force-dynamic";

/** Prueba psicotécnica en PsicoAlianza (24-nov-2026): inscribir, esperar y subir resultados. */
export default async function PsicoPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) redirect("/");
  const datos = await datosPsico();
  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-20 sm:p-6 md:pb-6 lg:p-8">
      <Link href="/candidatos" className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
      </Link>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Prueba psicotécnica</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Inscribir en PsicoAlianza a quienes confirmaron el correo, seguir a los que esperan y subir los resultados para que queden en su proceso.
          </p>
        </div>
      </div>
      <PsicoClient datos={datos} />
    </div>
  );
}
