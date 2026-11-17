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
});

describe("GET /orders/:id/price", () => {
  it("räknar pris med moms via den äldre modulen", async () => {
    const res = await request(app).get("/orders/1042/price").set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(1187.5);
  });
});
