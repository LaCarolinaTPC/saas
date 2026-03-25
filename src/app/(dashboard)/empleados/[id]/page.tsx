import { getEmployee } from "@/lib/actions";
import { EMPLOYEE_STATUSES } from "@/lib/constants";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { EmpleadoDetailClient } from "./empleado-detail-client";

export default async function EmpleadoPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getEmployee(id);
  } catch {
    notFound();
  }

  const { employee, events, disciplinaryRecords, documents, notes } = data;

  const statusConfig = EMPLOYEE_STATUSES.find((s) => s.value === employee.status);

  const hireDateFormatted = employee.hire_date
    ? format(new Date(employee.hire_date), "d 'de' MMMM, yyyy", { locale: es })
    : "No especificada";

  const hireYears = employee.hire_date
    ? `${Math.floor((Date.now() - new Date(employee.hire_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} años`
    : "—";

  const salaryFormatted = employee.salary
    ? `$${Number(employee.salary).toLocaleString("es-CO")} COP/mes`
    : "No especificado";

  const contractTypeMap: Record<string, string> = {
    indefinido: "Término indefinido",
    fijo: "Término fijo",
    obra_labor: "Obra o labor",
    prestacion_servicios: "Prestación de servicios",
  };

  return (
    <EmpleadoDetailClient
      employee={{
        ...employee,
        hireDateFormatted,
        hireYears,
        salaryFormatted,
        contractTypeLabel: contractTypeMap[employee.contract_type] || employee.contract_type || "No especificado",
        departmentName: employee.departments?.name ?? "Sin departamento",
        statusLabel: statusConfig?.label ?? employee.status,
        statusBg: statusConfig?.bg ?? "#F1F5F9",
        statusColor: statusConfig?.color ?? "#64748B",
      }}
      events={events}
      disciplinaryRecords={disciplinaryRecords}
      documents={documents}
      notes={notes}
    />
  );
}
