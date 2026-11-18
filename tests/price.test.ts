import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { closeDb, resetDb } from "./helpers/db";

const app = createApp();

beforeEach(resetDb);
afterAll(closeDb);

// Karaktärisering av GET /orders/:id/price mot den äldre Python-koden. Strängarna är
// exakta (str(Decimal)) och jämförs aldrig som tal.

async function skapaOrder(
  kundId: number,
  kod: string | null,
  antal: number,
  styckpris: string,
): Promise<number> {
  const order = await db.query(
    "INSERT INTO orders (customer_id, discount_code) VALUES ($1, $2) RETURNING id",
    [kundId, kod],
  );
  const id: number = order.rows[0].id;
  await db.query(
    "INSERT INTO order_lines (order_id, product, quantity, unit_price) VALUES ($1, $2, $3, $4)",
    [id, "Testvara", antal, styckpris],
  );
  return id;
}

describe("GET /orders/:id/price", () => {
  it.each([
    [1040, 1, "899", "224.75", "1123.75"],
    [1041, 2, "588.8", "147.2", "736.0"],
    [1042, 1, "950", "237.5", "1187.5"],
    [1043, 3, "0", "0", "0"],
    [1044, 4, "179.91", "44.97", "224.88"],
    [1045, 5, "551.65", "137.91", "689.56"],
    [1046, 6, "899", "224.75", "1123.75"],
    [1047, 2, "529", "132.25", "661.25"],
  ])("ger exakta strängar för order %i (kund %i)", async (orderId, kundId, net, vat, total) => {
    const res = await request(app)
      .get(`/orders/${orderId}/price`)
      .set("X-Customer-Id", String(kundId));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net, vat, total });
  });

  it("trunkerar momsen för order 1044 till 44.97 och inte 44.98", async () => {
    const res = await request(app).get("/orders/1044/price").set("X-Customer-Id", "4");
    expect(res.status).toBe(200);
    expect(res.body.vat).toBe("44.97");
  });

  it("trunkerar nettot för 0.99 med VAR10 till 0.89 (summa 0.891)", async () => {
    const id = await skapaOrder(1, "VAR10", 1, "0.99");
    const res = await request(app).get(`/orders/${id}/price`).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "0.89", vat: "0.22", total: "1.11" });
  });

  it("ger exakt 0, 0 och 0 för en order utan rader", async () => {
    const res = await request(app).get("/orders/1043/price").set("X-Customer-Id", "3");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "0", vat: "0", total: "0" });
  });

  it("trunkerar nettot för 0.95 med VAR10 till 0.85 och inte 0.86 (summa 0.855)", async () => {
    // Skiljer trunkering från avrundning: 0.855 avrundat uppåt vore 0.86.
    // net 0.85 -> vat trunc(0.2125) = 0.21 -> total 1.06.
    const id = await skapaOrder(1, "VAR10", 1, "0.95");
    const res = await request(app).get(`/orders/${id}/price`).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "0.85", vat: "0.21", total: "1.06" });
  });
});

describe("GET /orders/:id/price, rabatt och format", () => {
  async function hamtaPris(orderId: number, kundId: number) {
    return request(app).get(`/orders/${orderId}/price`).set("X-Customer-Id", String(kundId));
  }

  it("tillämpar den utgångna rabatten GAMMAL15 på order 1045 (valid_to ignoreras)", async () => {
    // Konstigt: GAMMAL15 gick ut 2024 men rabatten tillämpas ändå.
    const res = await hamtaPris(1045, 5);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "551.65", vat: "137.91", total: "689.56" });
  });

  it("ger samma pris för en okänd rabattkod som utan rabattkod", async () => {
    // Konstigt: en kod som inte finns i discounts ger tyst ingen rabatt.
    const medKod = await skapaOrder(1, "FINNSINTE", 1, "100.00");
    const utanKod = await skapaOrder(1, null, 1, "100.00");
    const resMed = await hamtaPris(medKod, 1);
    const resUtan = await hamtaPris(utanKod, 1);
    expect(resMed.status).toBe(200);
    expect(resUtan.status).toBe(200);
    expect(resMed.body).toEqual(resUtan.body);
    expect(resMed.body).toEqual({ net: "100", vat: "25", total: "125" });
  });

  it("prissätter den avbrutna ordern 1046 och ger 200 med total 1123.75", async () => {
    const res = await hamtaPris(1046, 6);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe("1123.75");
  });

  it("ger total 736.0 med en decimal för order 1041 (net 588.8, vat 147.2)", async () => {
    // Konstigt: str(Decimal) ger "736.0" och inte "736.00".
    const res = await hamtaPris(1041, 2);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "588.8", vat: "147.2", total: "736.0" });
  });

  it("ger total med lika många decimaler som den längsta av net och vat (1040)", async () => {
    const res = await hamtaPris(1040, 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "899", vat: "224.75", total: "1123.75" });
  });

  it("ger total med två decimaler när vat har noll decimaler (4.02)", async () => {
    // net 4.02, vat trunkeras från 1.005 till "1" (noll decimaler), total "5.02" (längsta).
    const id = await skapaOrder(1, null, 1, "4.02");
    const res = await hamtaPris(id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "4.02", vat: "1", total: "5.02" });
  });

  it("ger inget avdrag för rabatt på 0 procent", async () => {
    await db.query(
      "INSERT INTO discounts (code, percent, valid_from, valid_to) VALUES ($1, $2, $3, $4)",
      ["NOLL0", 0, "2020-01-01", "2099-12-31"],
    );
    const id = await skapaOrder(1, "NOLL0", 1, "100.00");
    const res = await hamtaPris(id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "100", vat: "25", total: "125" });
  });

  it("ger 0, 0 och 0 för rabatt på 100 procent", async () => {
    await db.query(
      "INSERT INTO discounts (code, percent, valid_from, valid_to) VALUES ($1, $2, $3, $4)",
      ["HELT100", 100, "2020-01-01", "2099-12-31"],
    );
    const id = await skapaOrder(1, "HELT100", 1, "100.00");
    const res = await hamtaPris(id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ net: "0", vat: "0", total: "0" });
  });
});

describe("GET /orders/:id/price, felfall", () => {
  // Alla felsvar ska ha formen { error: { code, message } } och inga andra fält på toppnivå.
  function forvantaFelform(body: unknown, kod: string) {
    expect(Object.keys(body as object)).toEqual(["error"]);
    const fel = (body as { error: { code: unknown; message: unknown } }).error;
    expect(fel.code).toBe(kod);
    expect(typeof fel.message).toBe("string");
    expect((fel.message as string).length).toBeGreaterThan(0);
  }

  it("returnerar 401 utan X-Customer-Id", async () => {
    const res = await request(app).get("/orders/1042/price");
    expect(res.status).toBe(401);
    forvantaFelform(res.body, "unauthorized");
  });

  it.each(["abc", "0", "-1"])("returnerar 400 för ogiltigt id %s", async (id) => {
    const res = await request(app).get(`/orders/${id}/price`).set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    forvantaFelform(res.body, "invalid_input");
  });

  it("returnerar 403 när kund 1 hämtar priset för kund 2:s order 1041", async () => {
    const res = await request(app).get("/orders/1041/price").set("X-Customer-Id", "1");
    expect(res.status).toBe(403);
    forvantaFelform(res.body, "forbidden");
  });

  it("returnerar 404 för en order som inte finns (9999)", async () => {
    const res = await request(app).get("/orders/9999/price").set("X-Customer-Id", "1");
    expect(res.status).toBe(404);
    forvantaFelform(res.body, "not_found");
  });
});

describe("GET /orders/:id/price, fel i beräkningen och logg", () => {
  const loggsokvag = path.join(__dirname, "..", "src", "legacy", "price_calc.log");

  function lasLogg(): string {
    try {
      return fs.readFileSync(loggsokvag, "utf8");
    } catch {
      return "";
    }
  }

  function tillagt(fore: string, efter: string): string {
    expect(efter.startsWith(fore)).toBe(true);
    return efter.slice(fore.length);
  }

  async function hamtaPris(orderId: number, kundId: number) {
    return request(app).get(`/orders/${orderId}/price`).set("X-Customer-Id", String(kundId));
  }

  it("returnerar 404 med not_found när beräkningen misslyckas (tabellen discounts saknas)", async () => {
    // Beräkningen felar när rabatten SOMMAR20 slås upp, medan getOrder inte läser discounts.
    await db.query("DROP TABLE discounts");
    const res = await hamtaPris(1041, 2);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("lägger till exakt en loggrad med tid, order-id och total efter ett lyckat anrop för 1042", async () => {
    const fore = lasLogg();
    const res = await hamtaPris(1042, 1);
    expect(res.status).toBe(200);
    const nytt = tillagt(fore, lasLogg());
    expect(nytt.endsWith("\n")).toBe(true);
    const rader = nytt.split("\n").slice(0, -1);
    expect(rader).toHaveLength(1);
    expect(rader[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)? 1042 1187\.5$/);
  });

  it("lägger inte till någon loggrad när ordern inte finns (404 för 9999)", async () => {
    const fore = lasLogg();
    const res = await hamtaPris(9999, 1);
    expect(res.status).toBe(404);
    expect(tillagt(fore, lasLogg())).toBe("");
  });

  it("lägger inte till någon loggrad när beräkningen misslyckas (404 för 1041 utan discounts)", async () => {
    await db.query("DROP TABLE discounts");
    const fore = lasLogg();
    const res = await hamtaPris(1041, 2);
    expect(res.status).toBe(404);
    expect(tillagt(fore, lasLogg())).toBe("");
  });

  it("ger ändå 200 med rätt pris när loggen inte går att skriva (en katalog ligger på loggsökvägen)", async () => {
    const undanstoppad = path.join(os.tmpdir(), `price_calc.log.undan.${process.pid}`);
    const fannsFran = fs.existsSync(loggsokvag);
    try {
      if (fannsFran) {
        try {
          fs.renameSync(loggsokvag, undanstoppad);
        } catch {
          fs.copyFileSync(loggsokvag, undanstoppad);
          fs.unlinkSync(loggsokvag);
        }
      }
      fs.mkdirSync(loggsokvag);
      const res = await hamtaPris(1042, 1);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ net: "950", vat: "237.5", total: "1187.5" });
    } finally {
      fs.rmSync(loggsokvag, { recursive: true, force: true });
      if (fannsFran) {
        try {
          fs.renameSync(undanstoppad, loggsokvag);
        } catch {
          fs.copyFileSync(undanstoppad, loggsokvag);
          fs.unlinkSync(undanstoppad);
        }
      }
    }
  });
});

describe("GET /orders/:id/price, utan Python", () => {
  it("räknar priset utan att starta python3", async () => {
    const ursprungligPath = process.env.PATH;
    const tomKatalog = fs.mkdtempSync(path.join(os.tmpdir(), "utan-python-"));
    try {
      process.env.PATH = tomKatalog;
      const res = await request(app).get("/orders/1042/price").set("X-Customer-Id", "1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ net: "950", vat: "237.5", total: "1187.5" });
    } finally {
      process.env.PATH = ursprungligPath;
      fs.rmSync(tomKatalog, { recursive: true, force: true });
    }
  });
});
