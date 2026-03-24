"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVacancyStatus } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function VacancyStatusActions({
  vacancyId,
  currentStatus,
}: {
  vacancyId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      await updateVacancyStatus(vacancyId, newStatus);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3">
      {currentStatus === "borrador" && (
        <Button
          onClick={() => handleStatusChange("activa")}
          disabled={isPending}
          className="bg-[#4F46E5] hover:bg-[#4338CA]"
        >
          {isPending ? "Publicando..." : "Publicar"}
        </Button>
      )}
      {currentStatus === "activa" && (
        <Button
          variant="outline"
          onClick={() => handleStatusChange("cerrada")}
          disabled={isPending}
          className="border-red-200 text-red-600 hover:bg-red-50"
        >
          {isPending ? "Cerrando..." : "Cerrar Vacante"}
        </Button>
      )}
      {currentStatus === "cerrada" && (
        <>
          <Button
            variant="outline"
            onClick={() => handleStatusChange("activa")}
            disabled={isPending}
            className="border-[#E2E8F0]"
          >
            {isPending ? "Reactivando..." : "Reactivar"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleStatusChange("archivada")}
            disabled={isPending}
            className="border-[#E2E8F0] text-[#64748B]"
          >
            {isPending ? "Archivando..." : "Archivar"}
          </Button>
        </>
      )}
      {currentStatus === "archivada" && (
        <Button
          variant="outline"
          onClick={() => handleStatusChange("activa")}
          disabled={isPending}
          className="border-[#E2E8F0]"
        >
          {isPending ? "Reactivando..." : "Reactivar"}
        </Button>
      )}
    </div>
  );
}
