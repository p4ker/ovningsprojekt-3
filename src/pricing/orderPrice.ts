import { db } from "../db";
import { computePrice, Price, PriceLine } from "./price";

type Rad = {
  id: number;
  discountCode: string | null;
  percent: number | null;
  quantity: number | null;
  unitPrice: string | null;
};

// Pris för flera beställningar med en enda fråga. Okända id finns inte med i svaret.
// Rabatten används bara när koden finns i discounts. valid_from och valid_to ignoreras,
// som i den äldre Python-koden.
export async function calcOrderPrices(ids: number[]): Promise<Map<number, Price>> {
  const { rows } = await db.query<Rad>(
    `SELECT o.id, o.discount_code AS "discountCode", d.percent,
            l.quantity, l.unit_price AS "unitPrice"
       FROM orders o
       LEFT JOIN discounts d ON d.code = o.discount_code
       LEFT JOIN order_lines l ON l.order_id = o.id
      WHERE o.id = ANY($1)`,
    [ids],
  );

  const ordrar = new Map<number, { percent: number | null; lines: PriceLine[] }>();
  for (const rad of rows) {
    let order = ordrar.get(rad.id);
    if (!order) {
      order = { percent: rad.discountCode ? rad.percent : null, lines: [] };
      ordrar.set(rad.id, order);
    }
    if (rad.quantity !== null && rad.unitPrice !== null) {
      order.lines.push({ quantity: rad.quantity, unitPrice: rad.unitPrice });
    }
  }

  const priser = new Map<number, Price>();
  for (const [id, order] of ordrar) {
    priser.set(id, computePrice(order.lines, order.percent));
  }
  return priser;
}
