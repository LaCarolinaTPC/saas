import { getCandidatesPipeline, getAllCandidates } from "@/lib/actions";
import { CandidatosClient } from "./client";

export default async function CandidatosPage() {
  const [pipeline, allCandidates] = await Promise.all([
    getCandidatesPipeline(),
    getAllCandidates(),
  ]);
  return <CandidatosClient pipeline={pipeline} allCandidates={allCandidates} />;
}
