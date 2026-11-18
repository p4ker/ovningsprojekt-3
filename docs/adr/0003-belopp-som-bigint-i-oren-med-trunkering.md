# 0003: Belopp räknas som BigInt med skala och trunkeras mot noll

Status: beslutad
Datum: 2026-11-18
Funktion: docs/modernisera-prisberakning/

## Kontext

Python räknar med `Decimal`. Priset är `Σ quantity × unit_price`, minus rabatt `summa × percent / 100`, och sedan `_kapa(x) = Decimal(int(x × 100)) / 100`, som trunkerar mot noll (`src/legacy/price_calc.py:23-25, 36-49`). Ekonomi har stämt av mot trunkeringen. Svaret ska ha exakt samma strängar som `str(Decimal)` ger, till exempel `"950"`, `"588.8"` och `"736.0"` (research, Beräkningen steg 5; kriterium 1, 8 och 17).

Det som begränsar valet:
- `docs/standard.md:25` förbjuder flyttal för belopp.
- Mellanresultat har fler decimaler än två: rabatten ger upp till fyra (`summa × percent / 100`) och momsen likaså (`net × 25 / 100`).
- `pg` ger `NUMERIC` som sträng (`unit_price NUMERIC(10,2)`), `quantity` och `percent` är heltal (`db/schema.sql:17-38`).
- Resultatet måste vara bit för bit lika med Python, och ändringen av avrundningen är dyr att upptäcka i efterhand.

## Beslut

Belopp representeras i TypeScript som `{ units: bigint, scale: number }`, ett heltal och antalet decimaler. Inget belopp passerar `number`.

- `unit_price` läses som sträng och tolkas till ören utan flyttal. `quantity` och `percent` är heltal och görs om till `bigint`.
- Summan räknas i ören. Rabatten räknas i skala 4 (`ören × 100 − ören × percent`). Momsen likaså (`nettoören × 25`).
- Övergången till ören sker med heltalsdivision `bigint / 100n`, som trunkerar mot noll, vilket motsvarar `int(x × 100)`.
- En egen funktion formaterar värdet som `str(Decimal)`: inga avslutande nollor för `net` och `vat` utöver vad `Decimal` ger, och en summa får lika många decimaler som den längsta termen.
- Beräkningen och formateringen ligger i `src/pricing/price.ts` utan databas och utan I/O, och testas med enhetstester. Jämförelsetestet mot Python (kriterium 17) bevisar likheten.

Inget nytt beroende läggs till.

## Alternativ som valdes bort

- **Räkna i PostgreSQL med `NUMERIC`:** databasen har exakt decimalaritmetik. Men `trunc` och formatet av `str(Decimal)` (avslutande nollor) går inte att få identiska utan extra kod i SQL, beräkningen hamnar i frågor som blir svåra att testa utan databas, och logiken delas mellan två lager.
- **`decimal.js` eller liknande bibliotek:** ger decimalaritmetik färdig. Men det är ett nytt beroende för en liten uppgift. Biblioteket följer inte heller Pythons `str(Decimal)` utan egen formatering, så den delen skrivs ändå. BigInt-lösningen är ungefär lika lång och kräver ingen ny kod att förtroendegranska.
- **`number` och avrundning efter varje steg:** förbjudet enligt `docs/standard.md:25`, och ger fel resultat för stora summor och för trunkeringen (`0.1 + 0.2`).

## Konsekvenser

- + Exakt aritmetik utan nytt beroende, och beräkningen går att enhetstesta utan databas.
- + Trunkeringen mot noll är en medveten, testad egenskap och inte en bieffekt av ett bibliotek.
- − Vi underhåller en egen formateringsfunktion för `str(Decimal)`. Den måste hålla sig lika med Python, och jämförelsetestet är det som bevisar det.
- − Pythons `Decimal` har 28 siffrors precision som BigInt inte har. Skillnaden syns inte för `NUMERIC(10,2)` och heltalskvantiteter i rimlig storlek.
- − Egenskaperna hos `_kapa` (trunkering) blir kvar i TypeScript så länge ekonomi vill ha dem. Ändras de senare ska det vara ett eget beslut.
