import { Result, ok, err } from "../result";
import { calcOrderPrices } from "./orderPrice";
import { Price } from "./price";

export type { Price };

// All prisberäkning går hit (docs/standard.md). Räknas i TypeScript (ADR 0003).
// Alla fel ger not_found, även oväntade som att databasen inte svarar, precis som när
// den äldre Python-modulen räknade (research, Besvarat 3b).
export async function calcPrice(orderId: number): Promise<Result<Price>> {
  try {
    const pris = (await calcOrderPrices([orderId])).get(orderId);
    if (pris) {
      return ok(pris);
    }
  } catch {
    // Faller igenom till not_found.
  }
  return err("not_found", `Pris för beställning ${orderId} kunde inte räknas.`);
}
