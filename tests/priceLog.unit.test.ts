import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PRICE_LOG_PATH,
  formatLogLine,
  formatLogTimestamp,
  writePriceLog,
} from "../src/pricing/priceLog";

// Enhetstester utan databas för loggraden som TypeScript-varianten skriver
// (kriterium 14). Datum skapas med den lokala konstruktorn så att testerna
// inte beror på tidszon.

const NU = new Date(2026, 10, 18, 8, 42, 41, 630);

describe("formatLogTimestamp", () => {
  it("ger lokal tid utan tidszon med millisekunder följda av 000", () => {
    expect(formatLogTimestamp(NU)).toBe("2026-11-18T08:42:41.630000");
  });

  it("fyller ut millisekunder till tre siffror", () => {
    expect(formatLogTimestamp(new Date(2026, 10, 18, 8, 42, 41, 5))).toBe(
      "2026-11-18T08:42:41.005000",
    );
  });

  it("fyller ut ensiffrigt datum och klockslag med nollor", () => {
    expect(formatLogTimestamp(new Date(2026, 0, 2, 3, 4, 5, 60))).toBe(
      "2026-01-02T03:04:05.060000",
    );
  });

  it("utelämnar bråkdelen när millisekunderna är 0", () => {
    expect(formatLogTimestamp(new Date(2026, 10, 18, 8, 42, 41, 0))).toBe("2026-11-18T08:42:41");
  });
});

describe("formatLogLine", () => {
  it("ger tid, order-id och total utan radbrytning", () => {
    expect(formatLogLine(NU, 1042, "1187.5")).toBe("2026-11-18T08:42:41.630000 1042 1187.5");
  });
});

describe("writePriceLog", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prislogg-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("lägger till en rad med radbrytning efter varje anrop", () => {
    const fil = path.join(dir, "price_calc.log");
    writePriceLog(1042, "1187.5", { path: fil, now: NU });
    writePriceLog(1042, "1187.5", { path: fil, now: NU });
    const rad = "2026-11-18T08:42:41.630000 1042 1187.5\n";
    expect(fs.readFileSync(fil, "utf8")).toBe(rad + rad);
  });

  it("lägger till i en befintlig fil i stället för att skriva över den", () => {
    const fil = path.join(dir, "price_calc.log");
    fs.writeFileSync(fil, "gammal\n");
    writePriceLog(1042, "1187.5", { path: fil, now: NU });
    expect(fs.readFileSync(fil, "utf8")).toBe("gammal\n2026-11-18T08:42:41.630000 1042 1187.5\n");
  });

  it("kastar inte när sökvägen är en katalog", () => {
    expect(() => writePriceLog(1042, "1187.5", { path: dir, now: NU })).not.toThrow();
  });
});

describe("PRICE_LOG_PATH", () => {
  it("slutar med src/legacy/price_calc.log", () => {
    expect(PRICE_LOG_PATH.endsWith(path.join("src", "legacy", "price_calc.log"))).toBe(true);
  });
});
