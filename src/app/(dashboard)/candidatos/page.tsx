import { getCandidatesPipeline, getAllCandidates, getActiveVacancies } from "@/lib/actions";
import { CandidatosClient } from "./client";

export default async function CandidatosPage() {
  const [pipeline, allCandidates, vacancies] = await Promise.all([
    getCandidatesPipeline(),
    getAllCandidates(),
    getActiveVacancies(),
  ]);
  return <CandidatosClient pipeline={pipeline} allCandidates={allCandidates} vacancies={vacancies} />;
}
