import { db } from "../db";
import { Result, ok, err } from "../result";

export type Customer = { id: number; uuid: string; name: string; email: string };

export type OrderSummary = { id: number; status: string; createdAt: string };

// Enkel formatkontroll: inga blanksteg, exakt ett @, något före det och en domän med minst en punkt.
function isValidEmail(email: string): boolean {
  if (/\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && /^[^.]+(\.[^.]+)+$/.test(domain);
}

export async function createCustomer(input: {
  name?: unknown;
  email?: unknown;
}): Promise<Result<Customer>> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    return err("invalid_input", "name saknas.");
  }
  if (typeof input.email !== "string" || input.email.trim() === "") {
    return err("invalid_input", "email saknas.");
  }
  const email = input.email.trim();
  if (!isValidEmail(email)) {
    // Meddelandet upprepar inte adressen: inga personuppgifter i fel eller loggar.
    return err("invalid_input", "email är inte en giltig e-postadress.");
  }
  const res = await db.query(
    "INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING id, uuid, name, email",
    [input.name.trim(), email],
  );
  return ok(res.rows[0]);
}

export async function getCustomer(id: number): Promise<Result<Customer>> {
  const res = await db.query("SELECT id, uuid, name, email FROM customers WHERE id = $1", [id]);
  if (res.rowCount === 0) {
    return err("not_found", `Kund ${id} finns inte.`);
  }
  return ok(res.rows[0]);
}

export async function listOrdersForCustomer(customerId: number): Promise<OrderSummary[]> {
  const res = await db.query(
    `SELECT id, status, created_at AS "createdAt"
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId],
  );
  return res.rows;
}
