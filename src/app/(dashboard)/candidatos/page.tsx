import { getCandidatesPipeline } from "@/lib/actions";
import { CandidatosClient } from "./client";

export default async function CandidatosPage() {
  const pipeline = await getCandidatesPipeline();
  return <CandidatosClient pipeline={pipeline} />;
}
