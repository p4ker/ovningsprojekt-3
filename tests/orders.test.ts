import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { closeDb, resetDb } from "./helpers/db";

const app = createApp();

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /orders", () => {
  it("lägger en beställning med rader", async () => {
    const res = await request(app)
      .post("/orders")
      .set("X-Customer-Id", "3")
      .send({ lines: [{ product: "Musmatta", quantity: 2, unitPrice: 200 }] });
    expect(res.status).toBe(201);
    expect(res.body.customerId).toBe(3);
    expect(res.body.status).toBe("new");
    expect(res.body.lines).toEqual([{ product: "Musmatta", quantity: 2, unitPrice: "200.00" }]);
  });

  it("returnerar 400 utan rader", async () => {
    const res = await request(app).post("/orders").set("X-Customer-Id", "3").send({ lines: [] });
    expect(res.status).toBe(400);
  });

  it("returnerar 400 när antalet inte är positivt", async () => {
    const res = await request(app)
      .post("/orders")
      .set("X-Customer-Id", "3")
      .send({ lines: [{ product: "Musmatta", quantity: 0, unitPrice: 200 }] });
    expect(res.status).toBe(400);
  });

  it("returnerar 401 utan inloggning", async () => {
    const res = await request(app).post("/orders").send({ lines: [] });
    expect(res.status).toBe(401);
  });
});

describe("GET /orders/:id", () => {
  it("returnerar en egen beställning med rader", async () => {
    const res = await request(app).get("/orders/1042").set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(2);
  });

  it("returnerar 403 för en annan kunds beställning", async () => {
    const res = await request(app).get("/orders/1042").set("X-Customer-Id", "2");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returnerar 404 för en beställning som inte finns", async () => {
    const res = await request(app).get("/orders/9999").set("X-Customer-Id", "1");
    expect(res.status).toBe(404);
  });

  it("returnerar 400 för ett ogiltigt id", async () => {
    const res = await request(app).get("/orders/abc").set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
  });
});

describe("POST /orders/:id/cancel", () => {
  async function laggBestallning(): Promise<number> {
    const res = await request(app)
      .post("/orders")
      .set("X-Customer-Id", "3")
      .send({ lines: [{ product: "Musmatta", quantity: 2, unitPrice: 200 }] });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  it("avbryter en ny egen beställning och returnerar den i samma form som GET /orders/:id", async () => {
    const id = await laggBestallning();

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    const hamtad = await request(app).get(`/orders/${id}`).set("X-Customer-Id", "3");
    expect(Object.keys(res.body).sort()).toEqual(Object.keys(hamtad.body).sort());
    expect(res.body).toEqual({
      id,
      customerId: 3,
      status: "cancelled",
      discountCode: null,
      lines: [{ product: "Musmatta", quantity: 2, unitPrice: "200.00" }],
    });
  });

  it("sparar statusen cancelled i databasen och visar den i GET /orders/:id", async () => {
    const id = await laggBestallning();

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");
    expect(res.status).toBe(200);

    const hamtad = await request(app).get(`/orders/${id}`).set("X-Customer-Id", "3");
    expect(hamtad.status).toBe(200);
    expect(hamtad.body.status).toBe("cancelled");
    const rad = await db.query("SELECT status FROM orders WHERE id = $1", [id]);
    expect(rad.rows[0].status).toBe("cancelled");
  });

  it("returnerar 200 när beställningen lades för 29 minuter sedan", async () => {
    const id = await laggBestallning();
    await db.query(
      "UPDATE orders SET created_at = now() - ($2 * interval '1 minute') WHERE id = $1",
      [id, 29],
    );

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  async function statusIDb(id: number): Promise<string> {
    const rad = await db.query("SELECT status FROM orders WHERE id = $1", [id]);
    return rad.rows[0].status;
  }

  async function forsta409(): Promise<{ id: number; message: string }> {
    const id = await laggBestallning();
    await db.query(
      "UPDATE orders SET created_at = now() - ($2 * interval '1 minute') WHERE id = $1",
      [id, 31],
    );
    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");
    return { id, message: res.body?.error?.message };
  }

  it("returnerar 409 när beställningen lades för 31 minuter sedan och ändrar inte statusen", async () => {
    const id = await laggBestallning();
    await db.query(
      "UPDATE orders SET created_at = now() - ($2 * interval '1 minute') WHERE id = $1",
      [id, 31],
    );

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
    expect(await statusIDb(id)).toBe("new");
  });

  it("returnerar 409 när en redan avbruten beställning avbryts igen", async () => {
    const id = await laggBestallning();
    const forsta = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");
    expect(forsta.status).toBe(200);

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
    expect(await statusIDb(id)).toBe("cancelled");
  });

  it.each(["paid", "shipped"])(
    "returnerar 409 för status %s inom fönstret och ändrar inte statusen",
    async (status) => {
      const id = await laggBestallning();
      await db.query("UPDATE orders SET status = $2, created_at = now() WHERE id = $1", [
        id,
        status,
      ]);

      const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("conflict");
      expect(await statusIDb(id)).toBe(status);
    },
  );

  it("ger olika meddelanden för ett fönster som gått ut och för fel status", async () => {
    const utgangen = await forsta409();

    const id = await laggBestallning();
    await db.query("UPDATE orders SET status = $2, created_at = now() WHERE id = $1", [id, "paid"]);
    const felStatus = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

    expect(felStatus.status).toBe(409);
    expect(typeof utgangen.message).toBe("string");
    expect(utgangen.message.length).toBeGreaterThan(0);
    expect(typeof felStatus.body.error.message).toBe("string");
    expect(felStatus.body.error.message.length).toBeGreaterThan(0);
    expect(utgangen.message).not.toBe(felStatus.body.error.message);
  });

  it("returnerar felsvar med formen { error: { code, message } } för 409", async () => {
    const id = await laggBestallning();
    await db.query(
      "UPDATE orders SET created_at = now() - ($2 * interval '1 minute') WHERE id = $1",
      [id, 31],
    );

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3");

    expect(res.status).toBe(409);
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
    expect(typeof res.body.error.code).toBe("string");
    expect(typeof res.body.error.message).toBe("string");
  });

  function kontrolleraFelform(body: unknown, kod: string): void {
    const b = body as { error: { code: string; message: string } };
    expect(Object.keys(b)).toEqual(["error"]);
    expect(Object.keys(b.error).sort()).toEqual(["code", "message"]);
    expect(b.error.code).toBe(kod);
    expect(typeof b.error.message).toBe("string");
    expect(b.error.message.length).toBeGreaterThan(0);
  }

  it("returnerar 401 utan X-Customer-Id och ändrar inte beställningen", async () => {
    expect(await statusIDb(1043)).toBe("new");

    const res = await request(app).post("/orders/1043/cancel");

    expect(res.status).toBe(401);
    kontrolleraFelform(res.body, "unauthorized");
    expect(await statusIDb(1043)).toBe("new");
  });

  it("returnerar 403 när kund 1 avbryter kund 3:s beställning inom fönstret och ändrar inte statusen", async () => {
    await db.query("UPDATE orders SET created_at = now() WHERE id = $1", [1043]);

    const res = await request(app).post("/orders/1043/cancel").set("X-Customer-Id", "1");

    expect(res.status).toBe(403);
    kontrolleraFelform(res.body, "forbidden");
    expect(await statusIDb(1043)).toBe("new");
  });

  it("returnerar 404 för en beställning som inte finns", async () => {
    const res = await request(app).post("/orders/999999/cancel").set("X-Customer-Id", "1");

    expect(res.status).toBe(404);
    kontrolleraFelform(res.body, "not_found");
  });

  it.each(["abc", "0", "-1"])("returnerar 400 för ogiltigt id %s", async (ogiltigtId) => {
    const res = await request(app).post(`/orders/${ogiltigtId}/cancel`).set("X-Customer-Id", "1");

    expect(res.status).toBe(400);
    kontrolleraFelform(res.body, "invalid_input");
  });

  it("returnerar 403 och inte 409 när kund 1 avbryter en annan kunds beställning som har gått ut", async () => {
    const id = await laggBestallning();
    await db.query(
      "UPDATE orders SET created_at = now() - ($2 * interval '1 minute') WHERE id = $1",
      [id, 31],
    );

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "1");

    expect(res.status).toBe(403);
    kontrolleraFelform(res.body, "forbidden");
    expect(await statusIDb(id)).toBe("new");
  });

  it("returnerar 403 och inte 409 när kund 1 avbryter en annan kunds redan avbrutna beställning", async () => {
    const id = await laggBestallning();
    await db.query("UPDATE orders SET status = 'cancelled', created_at = now() WHERE id = $1", [
      id,
    ]);

    const res = await request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "1");

    expect(res.status).toBe(403);
    kontrolleraFelform(res.body, "forbidden");
    expect(await statusIDb(id)).toBe("cancelled");
  });

  it("låter exakt ett av två samtidiga anrop lyckas och returnerar 409 för det andra", async () => {
    const id = await laggBestallning();

    const svar = await Promise.all([
      request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3"),
      request(app).post(`/orders/${id}/cancel`).set("X-Customer-Id", "3"),
    ]);

    expect(svar.map((r) => r.status).sort()).toEqual([200, 409]);
    const konflikt = svar.find((r) => r.status === 409);
    expect(konflikt?.body.error.code).toBe("conflict");
    expect(await statusIDb(id)).toBe("cancelled");
  });
});

describe("GET /orders/:id/price", () => {
  it("räknar pris med moms via den äldre modulen", async () => {
    const res = await request(app).get("/orders/1042/price").set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(1187.5);
  });
});
