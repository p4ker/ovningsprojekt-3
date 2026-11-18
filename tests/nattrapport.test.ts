import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db";
import { closeDb, resetDb } from "./helpers/db";
import { kor } from "./helpers/nattrapport";

beforeEach(resetDb);
afterAll(closeDb);

// Karaktärisering av nattrapporten (jobs/nightly_report.py). Utskriften jämförs som exakta strängar.

const loggfil = path.join(__dirname, "..", "src", "legacy", "price_calc.log");

function lasLogg(): string {
  try {
    return fs.readFileSync(loggfil, "utf8");
  } catch {
    return "";
  }
}

async function skapaBetaldOrder(
  skapad: string,
  kod: string | null,
  rader: Array<[number, string]>,
): Promise<number> {
  const order = await db.query(
    "INSERT INTO orders (customer_id, status, discount_code, created_at) VALUES ($1, 'paid', $2, $3) RETURNING id",
    [1, kod, skapad],
  );
  const id: number = order.rows[0].id;
  for (const [antal, styckpris] of rader) {
    await db.query(
      "INSERT INTO order_lines (order_id, product, quantity, unit_price) VALUES ($1, $2, $3, $4)",
      [id, "Testvara", antal, styckpris],
    );
  }
  return id;
}

// Order med total "736.0" (3 x 129.00 + 349.00, SOMMAR20).
function order736(dag: string): Promise<number> {
  return skapaBetaldOrder(`${dag} 12:00:00+00`, "SOMMAR20", [
    [3, "129.00"],
    [1, "349.00"],
  ]);
}

describe("nattrapporten", () => {
  it.each([
    ["2026-10-01", "1187.5"],
    ["2026-10-05", "224.88"],
    ["2026-10-07", "689.56"],
  ])("skriver exakt rad för %s med totalt %s kr", async (dag, total) => {
    const res = await kor([dag]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(`${dag}: 1 betalda ordrar, totalt ${total} kr\n`);
  });

  it("skriver 0 betalda ordrar och totalt 0 kr för en dag utan betalda ordrar", async () => {
    const res = await kor(["2026-10-02"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("2026-10-02: 0 betalda ordrar, totalt 0 kr\n");
  });

  it("använder dagens datum utan argument", async () => {
    // Obs: kan fela precis kring midnatt när lokal dag och UTC-dag skiljer sig. Databasen
    // kör i UTC medan Python använder lokal tid (godkänt i plan.md, Besvarade frågor 6).
    const idagUtc = new Date().toISOString().slice(0, 10);
    await skapaBetaldOrder(`${idagUtc} 12:00:00+00`, null, [[1, "100.00"]]);
    const nu = new Date();
    const lokaltIdag = [
      nu.getFullYear(),
      String(nu.getMonth() + 1).padStart(2, "0"),
      String(nu.getDate()).padStart(2, "0"),
    ].join("-");
    const res = await kor([]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(`${lokaltIdag}: 1 betalda ordrar, totalt 125 kr\n`);
  });

  it("summerar två betalda ordrar samma dag (736.0 + 224.88 = 960.88)", async () => {
    await order736("2026-11-01");
    await skapaBetaldOrder("2026-11-01 12:00:00+00", "VAR10", [[1, "199.90"]]);
    const res = await kor(["2026-11-01"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("2026-11-01: 2 betalda ordrar, totalt 960.88 kr\n");
  });

  it("summerar med lika många decimaler som den längsta termen (736.0 + 1187.5 = 1923.5)", async () => {
    await order736("2026-11-02");
    await skapaBetaldOrder("2026-11-02 12:00:00+00", null, [
      [2, "375.00"],
      [1, "200.00"],
    ]);
    const res = await kor(["2026-11-02"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("2026-11-02: 2 betalda ordrar, totalt 1923.5 kr\n");
  });

  it("lägger till en loggrad per beräknad order", async () => {
    const id1 = await order736("2026-11-01");
    const id2 = await skapaBetaldOrder("2026-11-01 12:00:00+00", "VAR10", [[1, "199.90"]]);
    const fore = lasLogg();
    const res = await kor(["2026-11-01"]);
    expect(res.code).toBe(0);
    const efter = lasLogg();
    expect(efter.startsWith(fore)).toBe(true);
    const nya = efter
      .slice(fore.length)
      .split("\n")
      .filter((r) => r !== "");
    expect(nya).toHaveLength(2);
    for (const rad of nya) {
      expect(rad).toMatch(/^\S+ \d+ (736\.0|224\.88)$/);
    }
    const ider = nya.map((r) => r.split(" ")[1]).sort();
    expect(ider).toEqual([String(id1), String(id2)].sort());
  });
});
