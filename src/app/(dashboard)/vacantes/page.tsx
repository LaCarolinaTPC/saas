import { getVacancies } from "@/lib/actions";
import { VacantesClient } from "./vacantes-client";

export default async function VacantesPage() {
  const vacancies = await getVacancies();
  return <VacantesClient vacancies={vacancies} />;
}
