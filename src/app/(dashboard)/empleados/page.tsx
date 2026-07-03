import { getEmployees } from "@/lib/actions";
import { EmpleadosClient } from "./empleados-client";

export default async function EmpleadosPage() {
  const employees = await getEmployees();

  return <EmpleadosClient employees={employees} />;
}
