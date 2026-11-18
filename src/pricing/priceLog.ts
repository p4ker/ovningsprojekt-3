import fs from "node:fs";
import path from "node:path";

// Samma loggfil och samma rad som den äldre Python-koden skriver (price_calc.py:51-56):
// "<lokal tid> <order-id> <total>". Raden innehåller inga personuppgifter.
export const PRICE_LOG_PATH = path.join(__dirname, "..", "legacy", "price_calc.log");

const tva = (n: number) => String(n).padStart(2, "0");

// Som Pythons datetime.now().isoformat(): lokal tid utan tidszon. JavaScript har bara
// millisekunder, så mikrosekunderna slutar alltid på 000. Bråkdelen utelämnas när den är 0.
export function formatLogTimestamp(d: Date): string {
  const datum = `${d.getFullYear()}-${tva(d.getMonth() + 1)}-${tva(d.getDate())}`;
  const tid = `${tva(d.getHours())}:${tva(d.getMinutes())}:${tva(d.getSeconds())}`;
  const ms = d.getMilliseconds();
  const brak = ms === 0 ? "" : `.${String(ms).padStart(3, "0")}000`;
  return `${datum}T${tid}${brak}`;
}

export function formatLogLine(now: Date, orderId: number, total: string): string {
  return `${formatLogTimestamp(now)} ${orderId} ${total}`;
}

// Kastar aldrig: ett fel vid skrivningen ska inte påverka priset, som i Python.
export function writePriceLog(
  orderId: number,
  total: string,
  options: { path?: string; now?: Date } = {},
): void {
  try {
    const rad = formatLogLine(options.now ?? new Date(), orderId, total);
    fs.appendFileSync(options.path ?? PRICE_LOG_PATH, `${rad}\n`);
  } catch {
    // Avsiktligt tyst.
  }
}
