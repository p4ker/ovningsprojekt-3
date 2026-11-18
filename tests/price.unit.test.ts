import { addDec, computePrice, formatDec, parseMoney, type PriceLine } from "../src/pricing/price";

// Enhetstester utan databas för beräkningen och talformatet (ADR 0003).
// Pengar jämförs som strängar, aldrig som flyttal.

describe("parseMoney", () => {
  it.each([
    ["19.95", 1995n, 2],
    ["0.99", 99n, 2],
    ["1000", 1000n, 0],
    ["0.10", 10n, 2],
    ["736.0", 7360n, 1],
  ])("tolkar %s exakt och behåller antalet decimaler", (s, units, scale) => {
    expect(parseMoney(s)).toEqual({ units, scale });
  });

  it.each(["abc", "", "1.2.3"])("kastar för ogiltigt värde %j", (s) => {
    expect(() => parseMoney(s)).toThrow();
  });
});

describe("computePrice för seed-ordrarna", () => {
  const rad = (quantity: number, unitPrice: string): PriceLine => ({ quantity, unitPrice });

  it.each([
    [1040, [rad(1, "899.00")], null, { net: "899", vat: "224.75", total: "1123.75" }],
    [
      1041,
      [rad(3, "129.00"), rad(1, "349.00")],
      20,
      { net: "588.8", vat: "147.2", total: "736.0" },
    ],
    [
      1042,
      [rad(2, "375.00"), rad(1, "200.00")],
      null,
      { net: "950", vat: "237.5", total: "1187.5" },
    ],
    [1043, [], null, { net: "0", vat: "0", total: "0" }],
    [1044, [rad(1, "199.90")], 10, { net: "179.91", vat: "44.97", total: "224.88" }],
    [1045, [rad(1, "649.00")], 15, { net: "551.65", vat: "137.91", total: "689.56" }],
    [
      1047,
      [rad(1, "129.00"), rad(2, "200.00")],
      null,
      { net: "529", vat: "132.25", total: "661.25" },
    ],
  ])("ger rätt pris för order %i", (_id, rader, procent, förväntat) => {
    expect(computePrice(rader, procent)).toEqual(förväntat);
  });
});

describe("computePrice trunkerar mot noll", () => {
  it("trunkerar 0.855 till 0.85 för 0.95 med 10 procent", () => {
    expect(computePrice([{ quantity: 1, unitPrice: "0.95" }], 10)).toEqual({
      net: "0.85",
      vat: "0.21",
      total: "1.06",
    });
  });

  it("trunkerar momsen 44.9775 till 44.97 för 199.90 med 10 procent", () => {
    expect(computePrice([{ quantity: 1, unitPrice: "199.90" }], 10).vat).toBe("44.97");
  });

  it("ger 0.89, 0.22 och 1.11 för 0.99 med 10 procent", () => {
    expect(computePrice([{ quantity: 1, unitPrice: "0.99" }], 10)).toEqual({
      net: "0.89",
      vat: "0.22",
      total: "1.11",
    });
  });

  it("ger 4.02, 1 och 5.02 för 4.02 utan rabatt", () => {
    expect(computePrice([{ quantity: 1, unitPrice: "4.02" }], null)).toEqual({
      net: "4.02",
      vat: "1",
      total: "5.02",
    });
  });
});

describe("formatDec", () => {
  it.each([
    [{ units: 950n, scale: 0 }, "950"],
    [{ units: 5888n, scale: 1 }, "588.8"],
    [{ units: 0n, scale: 0 }, "0"],
    [{ units: 7360n, scale: 1 }, "736.0"],
    [{ units: 1995n, scale: 2 }, "19.95"],
    [{ units: 5n, scale: 2 }, "0.05"],
    [{ units: -5n, scale: 1 }, "-0.5"],
  ])("formaterar %p som %s", (d, förväntat) => {
    expect(formatDec(d)).toBe(förväntat);
  });
});

describe("addDec", () => {
  it.each([
    ["1187.5", "736.0", "1923.5"],
    ["736.0", "224.88", "960.88"],
  ])("adderar %s och %s till %s med längsta antalet decimaler", (a, b, förväntat) => {
    expect(formatDec(addDec(parseMoney(a), parseMoney(b)))).toBe(förväntat);
  });

  it("ger 224.88 för heltalet 0 plus 224.88", () => {
    expect(formatDec(addDec({ units: 0n, scale: 0 }, parseMoney("224.88")))).toBe("224.88");
  });

  it("ger 0 för heltalet 0 plus heltalet 0", () => {
    expect(formatDec(addDec({ units: 0n, scale: 0 }, { units: 0n, scale: 0 }))).toBe("0");
  });
});

describe("computePrice med gränsvärden", () => {
  it("ger 100, 25 och 125 för 100.00 med 0 procent", () => {
    expect(computePrice([{ quantity: 1, unitPrice: "100.00" }], 0)).toEqual({
      net: "100",
      vat: "25",
      total: "125",
    });
  });

  it("ger 0, 0 och 0 för 100.00 med 100 procent", () => {
    expect(computePrice([{ quantity: 1, unitPrice: "100.00" }], 100)).toEqual({
      net: "0",
      vat: "0",
      total: "0",
    });
  });

  it("ger 0, 0 och 0 utan rader med 10 procent", () => {
    expect(computePrice([], 10)).toEqual({ net: "0", vat: "0", total: "0" });
  });
});
