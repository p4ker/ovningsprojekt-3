// Prisberäkning med exakta belopp (ADR 0003). Ett belopp är ett heltal och ett antal
// decimaler, aldrig ett flyttal. Beräkningen och formatet efterliknar den äldre
// Python-koden (src/legacy/price_calc.py), som räknar med Decimal.

export type Dec = { units: bigint; scale: number }; // värdet är units / 10^scale
export type PriceLine = { quantity: number; unitPrice: string };
export type Price = { net: string; vat: string; total: string };

const MOMS_PROCENT = 25n;
const BELOPP = /^(-?)(\d+)(?:\.(\d+))?$/;

export function parseMoney(s: string): Dec {
  const delar = BELOPP.exec(s);
  if (!delar) {
    throw new Error(`Ogiltigt belopp: "${s}"`);
  }
  const [, tecken, heltal, decimaler = ""] = delar;
  const units = BigInt(heltal + decimaler);
  return { units: tecken === "-" ? -units : units, scale: decimaler.length };
}

// Samma text som Pythons str(Decimal) för belopp utan exponentform.
export function formatDec(d: Dec): string {
  const negativ = d.units < 0n;
  const siffror = (negativ ? -d.units : d.units).toString().padStart(d.scale + 1, "0");
  const heltal = siffror.slice(0, siffror.length - d.scale);
  const decimaler = siffror.slice(siffror.length - d.scale);
  return (negativ ? "-" : "") + (d.scale > 0 ? `${heltal}.${decimaler}` : heltal);
}

function tillSkala(d: Dec, scale: number): bigint {
  return d.units * 10n ** BigInt(scale - d.scale);
}

// Decimal-addition: summan får lika många decimaler som den längsta termen.
export function addDec(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return { units: tillSkala(a, scale) + tillSkala(b, scale), scale };
}

// Motsvarar Decimal(ören) / 100 i Python: så få decimaler som möjligt, högst två.
function franOren(oren: bigint): Dec {
  if (oren % 100n === 0n) return { units: oren / 100n, scale: 0 };
  if (oren % 10n === 0n) return { units: oren / 10n, scale: 1 };
  return { units: oren, scale: 2 };
}

// Rabatten gäller hela ordern. Nettot och momsen trunkeras mot noll till ören, som
// _kapa i Python. BigInt-division trunkerar mot noll, precis som int().
export function computePrice(lines: PriceLine[], percent: number | null): Price {
  const priser = lines.map((rad) => parseMoney(rad.unitPrice));
  const scale = Math.max(0, ...priser.map((p) => p.scale));
  const summa = lines.reduce(
    (acc, rad, i) => acc + BigInt(rad.quantity) * tillSkala(priser[i], scale),
    0n,
  );
  const kvar = 100n - BigInt(percent ?? 0);
  const nettoOren = (summa * kvar) / 10n ** BigInt(scale);
  const momsOren = (nettoOren * MOMS_PROCENT) / 100n;
  const net = franOren(nettoOren);
  const vat = franOren(momsOren);
  return { net: formatDec(net), vat: formatDec(vat), total: formatDec(addDec(net, vat)) };
}
