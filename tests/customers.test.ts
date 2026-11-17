import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { closeDb, resetDb } from "./helpers/db";

const app = createApp();

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /customers", () => {
  it("skapar en kund och returnerar 201", async () => {
    const res = await request(app)
      .post("/customers")
      .send({ name: "Ida Ström", email: "ida.strom@example.com" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Ida Ström", email: "ida.strom@example.com" });
    expect(res.body.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returnerar 400 när name saknas", async () => {
    const res = await request(app).post("/customers").send({ email: "x@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("returnerar 400 när email saknas", async () => {
    const res = await request(app).post("/customers").send({ name: "Ida Ström" });
    expect(res.status).toBe(400);
  });

  async function antalKunder(): Promise<number> {
    const r = await db.query("SELECT COUNT(*)::int AS antal FROM customers");
    return r.rows[0].antal;
  }

  it.each([
    ["utan @", "inte-en-adress"],
    ["utan domän med punkt", "ida@example"],
    ["utan lokal del", "@example.com"],
  ])("returnerar 400 när email är %s (%s)", async (_beskrivning, email) => {
    const före = await antalKunder();
    const res = await request(app).post("/customers").send({ name: "Ida Ström", email });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
    expect(res.body.error.message).not.toContain(email);
    expect(await antalKunder()).toBe(före);
  });
});

describe("GET /customers/me", () => {
  it("returnerar den inloggade kunden", async () => {
    const res = await request(app).get("/customers/me").set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alva Lind");
  });

  it("returnerar 401 utan inloggning", async () => {
    const res = await request(app).get("/customers/me");
    expect(res.status).toBe(401);
  });

  it("returnerar 404 för en kund som inte finns", async () => {
    const res = await request(app).get("/customers/me").set("X-Customer-Id", "999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("GET /customers/me/orders", () => {
  it("listar bara den inloggade kundens beställningar, nyast först", async () => {
    const res = await request(app).get("/customers/me/orders").set("X-Customer-Id", "2");
    expect(res.status).toBe(200);
    expect(res.body.map((o: { id: number }) => o.id)).toEqual([1047, 1041]);
  });
});
