// Jämförelsetest mellan TypeScript-varianten och den äldre Python-koden (plan steg 8,
// kriterium 17). Den här filen är Python-specifik och ska tas bort tillsammans med
// Python i den senare uppgiften (research.md, Besvarat 8).
import { execFile } from "node:child_process";
import path from "node:path";
import { db } from "../src/db";
import { calcOrderPrices } from "../src/pricing/orderPrice";
import type { Price } from "../src/pricing/price";
import { closeDb, resetDb } from "./helpers/db";

beforeEach(resetDb);
afterAll(closeDb);

const root = path.join(__dirname, "..");

function pythonPris(id: number): Promise<Price> {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      ["src/legacy/price_calc.py", String(id)],
      { cwd: root, env: process.env },
      (fel, stdout, stderr) => {
        if (fel) {
          reject(new Error(`Python misslyckades för order ${id}: ${fel.message} ${stderr}`));
          return;
        }
        resolve(JSON.parse(stdout) as Price);
      },
    );
  });
}

type Rad = { antal: number; pris: string };

async function skapaOrder(kod: string | null, rader: Rad[]): Promise<number> {
  const order = await db.query(
    "INSERT INTO orders (customer_id, discount_code) VALUES ($1, $2) RETURNING id",
    [1, kod],
  );
  const id = order.rows[0].id as number;
  for (const [i, rad] of rader.entries()) {
    await db.query(
      "INSERT INTO order_lines (order_id, product, quantity, unit_price) VALUES ($1, $2, $3, $4)",
      [id, `Produkt ${i + 1}`, rad.antal, rad.pris],
    );
  }
  return id;
}

describe("calcOrderPrices mot Python", () => {
  it("ger samma strängar som Python för seed-ordrarna", async () => {
    for (let id = 1040; id <= 1047; id++) {
      const ts = (await calcOrderPrices([id])).get(id);
      expect(ts).toEqual(await pythonPris(id));
    }
  }, 60000);

  it("ger samma strängar som Python för skapade ordrar", async () => {
    const procent = [0, 1, 7, 10, 15, 33, 50, 99, 100];
    for (const p of procent) {
      await db.query("INSERT INTO discounts (code, percent) VALUES ($1, $2)", [`P${p}`, p]);
    }
    // Kod för order i position n: P<procent> i tur och ordning, var tionde order utan kod.
    const kodFor = (n: number): string | null =>
      n % 10 === 9 ? null : `P${procent[n % procent.length]}`;

    const antal = [1, 2, 3, 7, 50];
    const priser = ["0.01", "0.99", "19.95", "129.00", "199.90", "99999999.99"];
    const ordrar: { kod: string | null; rader: Rad[] }[] = [];

    // 30 ordrar med en rad: alla kombinationer av antal och pris.
    for (const a of antal) {
      for (const pris of priser) {
        ordrar.push({ kod: kodFor(ordrar.length), rader: [{ antal: a, pris }] });
      }
    }
    // 30 ordrar med två eller tre rader, valda deterministiskt ur listorna.
    for (let i = 0; i < 30; i++) {
      const rader: Rad[] = [
        { antal: antal[i % antal.length], pris: priser[i % priser.length] },
        { antal: antal[(i + 2) % antal.length], pris: priser[(i * 2 + 1) % priser.length] },
      ];
      if (i % 3 === 0) {
        rader.push({ antal: antal[(i + 4) % antal.length], pris: priser[(i + 3) % priser.length] });
      }
      ordrar.push({ kod: kodFor(ordrar.length), rader });
    }
    // Varje rabatt minst en gång på en order med flera ören att trunkera.
    for (const p of procent) {
      ordrar.push({
        kod: `P${p}`,
        rader: [
          { antal: 3, pris: "19.95" },
          { antal: 7, pris: "0.99" },
        ],
      });
    }
    // Specialfall: utan rader, okänd kod och utan kod.
    ordrar.push({ kod: "P10", rader: [] });
    ordrar.push({ kod: "FINNSINTE", rader: [{ antal: 2, pris: "19.95" }] });
    ordrar.push({ kod: null, rader: [{ antal: 2, pris: "19.95" }] });

    const ids: number[] = [];
    const radText = new Map<number, string>();
    for (const o of ordrar) {
      const id = await skapaOrder(o.kod, o.rader);
      ids.push(id);
      radText.set(id, `kod=${o.kod} rader=${JSON.stringify(o.rader)}`);
    }

    const ts = await calcOrderPrices(ids);
    const jamforelse: {
      id: number;
      order: string | undefined;
      ts: Price | undefined;
      py: Price;
    }[] = [];
    for (const id of ids) {
      jamforelse.push({ id, order: radText.get(id), ts: ts.get(id), py: await pythonPris(id) });
    }
    const avvikelser = jamforelse.filter((j) => JSON.stringify(j.ts) !== JSON.stringify(j.py));
    expect(avvikelser).toEqual([]);
    expect(jamforelse).toHaveLength(ordrar.length);
  }, 60000);

  it("ger samma resultat för flera id som för ett i taget och utelämnar okända id", async () => {
    const flera = await calcOrderPrices([1040, 1041, 1042, 9999]);
    expect([...flera.keys()].sort()).toEqual([1040, 1041, 1042]);
    for (const id of [1040, 1041, 1042]) {
      expect(flera.get(id)).toEqual((await calcOrderPrices([id])).get(id));
    }
  });
});
