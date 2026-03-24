import { getEmployees, getDepartments } from "@/lib/actions";
import { EmpleadosClient } from "./empleados-client";

export default async function EmpleadosPage() {
  const [employees, departments] = await Promise.all([
    getEmployees(),
    getDepartments(),
  ]);

  return <EmpleadosClient employees={employees} departments={departments} />;
}
