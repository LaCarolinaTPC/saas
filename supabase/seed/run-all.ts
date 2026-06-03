import { run as seedConductores } from "./seed-conductores";
import { run as seedCierres } from "./seed-cierres";
import { run as seedVP } from "./seed-viajes-perdidos";
import { run as seedAusentismo } from "./seed-ausentismo";
import { run as seedFamilia } from "./seed-familia";

async function main() {
  console.log("========================================");
  console.log("  MTC La Carolina — Data Seed");
  console.log("========================================");

  const start = Date.now();

  // Order matters: conductores first (FK references)
  await seedConductores();
  await seedCierres();
  await seedVP();
  await seedAusentismo();
  await seedFamilia();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`  Seed complete in ${elapsed}s`);
  console.log(`========================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
