// Nattlig rapport: summerar en dags betalda ordrar (ADR 0002). Ersätter
// jobs/nightly_report.py och ger exakt samma utskrift. Körs med
// `npm run rapport:natt -- [ÅÅÅÅ-MM-DD]`, och utan argument gäller dagens lokala datum.
import { db } from "../src/db";
import { calcOrderPrices } from "../src/pricing/orderPrice";
import { addDec, Dec, formatDec, parseMoney } from "../src/pricing/price";

function lokaltIdag(): string {
  const nu = new Date();
  const tva = (n: number) => String(n).padStart(2, "0");
  return `${nu.getFullYear()}-${tva(nu.getMonth() + 1)}-${tva(nu.getDate())}`;
}

async function main(): Promise<void> {
  const dag = process.argv[2] ?? lokaltIdag();
  const { rows } = await db.query<{ id: number }>(
    "SELECT id FROM orders WHERE status = 'paid' AND created_at::date = $1::date",
    [dag],
  );
  const priser = await calcOrderPrices(rows.map((rad) => rad.id));

  // Som summa = 0 i Python: heltalet 0, och summan får den längsta termens decimaler.
  let summa: Dec = { units: 0n, scale: 0 };
  for (const pris of priser.values()) {
    summa = addDec(summa, parseMoney(pris.total));
  }
  console.log(`${dag}: ${priser.size} betalda ordrar, totalt ${formatDec(summa)} kr`);
}

main()
  .catch((fel: unknown) => {
    console.error(fel);
    process.exitCode = 1;
  })
  .finally(() => db.end());
