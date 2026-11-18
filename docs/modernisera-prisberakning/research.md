# Research: Flytta prisberäkningen från Python till TypeScript utan att ändra beteendet

Story: Flytta prisberäkningen i `src/legacy/price_calc.py` till TypeScript (`src/pricing/`). Ren refaktorering: beteendet får inte ändras, varken för `GET /orders/:id/price` eller för `jobs/nightly_report.py` (som importerar `calc_price` och `conn`). Kvarstående egenheter (`_kapa` trunkerar, `valid_from`/`valid_to` ignoreras, decimalformatet i svaret) bevaras exakt. Arbetet ska använda en codemap över den äldre delen och karaktäriseringstester som låser dagens beteende innan något flyttas.
Gren: `funktion/modernisera-prisberakning`

## Codemap: den äldre delen

```
GET /orders/:id/price  (src/routes/orders.ts:41-53)
  ├─ requireCustomer            src/auth.ts:10-11          401
  ├─ parseId                    src/routes/orders.ts:9-12  400
  ├─ getOrder                   src/services/orderService.ts:70-76   404 / 403
  └─ calcPrice(id)              src/pricing/legacyPrice.ts:10-20
        └─ execFile("python3", price_calc.py <id>)   ärver process.env (DATABASE_URL)
              └─ price_calc.py __main__ :61-66
                    └─ calc_price(order_id) :28-58
                          ├─ orders.discount_code           :30
                          ├─ order_lines.quantity, unit_price :36-39
                          ├─ discounts.percent              :42-45
                          ├─ _kapa (trunkering)             :23-25, :47-48
                          └─ append till price_calc.log     :51-56

cron på driftservern → jobs/nightly_report.py
  ├─ from price_calc import calc_price, conn   :3-4   (ansluter vid import, :10)
  ├─ conn: betalda ordrar för en dag           :7-8
  └─ calc_price(oid).total per order           :11-13  → en rad på stdout :15
```

| Modul | Ansvar | Beroenden | Användare |
|---|---|---|---|
| `src/legacy/price_calc.py` | Räknar net, moms och total för en order. CLI som skriver JSON. Loggar varje beräkning. | `psycopg`, `DATABASE_URL`, tabellerna `orders`, `order_lines`, `discounts` | `legacyPrice.ts` (som process), `nightly_report.py` (som modul) |
| `src/pricing/legacyPrice.ts` | Brygga: startar skriptet, tolkar stdout, alla fel blir `not_found`. | `python3` i PATH, `.venv` med `psycopg` | `src/routes/orders.ts:5, :52` |
| `jobs/nightly_report.py` | Summerar `total` för en dags betalda ordrar. | `calc_price`, `conn` och klassen `Pris` (`.total` måste gå att addera) | cron, utanför repot |

Beräkningen steg för steg (`price_calc.py`):

1. Ingen rad i `orders` ger `None`. CLI skriver `{"error": "finns inte"}` och avslutar med exit 1 (:31-33, :63-65).
2. Summan är `Σ quantity × unit_price` som `Decimal`, med start i `Decimal(0)`. Inga rader ger 0 (:36-39).
3. Om ordern har en rabattkod som finns i `discounts`: `summa − summa × percent / 100` på hela ordern. `valid_from`/`valid_to` läses inte, och en okänd kod ger ingen rabatt (:41-45).
4. `net = _kapa(summa)`, `vat = _kapa(net × 25 / 100)` och `total = net + vat`, utan `_kapa` på totalen (:47-49). `_kapa(x) = Decimal(int(x × 100)) / 100` trunkerar mot noll.
5. Utdata är `str(Decimal)`. Det ger strängar utan avslutande nollor för `net` och `vat` (`"950"`, `"588.8"`, `"0"`), medan `total` får lika många decimaler som den längsta av dem (`"736.0"`, `"1187.5"`) (:66).
6. Loggraden är `<datetime.now().isoformat()> <order_id> <total>\n`, alltså lokal tid utan tidszon och med mikrosekunder: `2026-11-18T08:42:41.630440 1042 1187.5`. Fel vid skrivningen sväljs (:51-56).

## Berörs

- `src/legacy/price_calc.py:23-58`: logiken som ska flyttas. `:10` ansluter vid import, `:30`, `:36` och `:42` bygger SQL med `%`, och `:51-56` skriver loggfilen.
- `src/pricing/legacyPrice.ts:10-20`: byts mot en implementation i TypeScript. `calcPrice(orderId): Promise<Result<Price>>` och typen `Price` (:5) är gränssnittet som routen använder.
- `src/routes/orders.ts:41-53`: anroparen. Den ska inte behöva ändras, men kommentaren på :40 nämner Python.
- `jobs/nightly_report.py:3-15`: skrivs om i TypeScript (beslut 1). Den nya rapporten använder `calcPrice` och ger exakt samma utskrift.
- `db/schema.sql:17-38`: `discounts.percent INTEGER`, `order_lines.quantity INTEGER`, `order_lines.unit_price NUMERIC(10,2)`. `pg` returnerar `NUMERIC` som sträng (`orderService.ts:78`), och strängen kan läsas direkt som ören.
- `db/seed.sql:14-41`: ordrar 1040–1047 täcker egenheterna (se tabellen under Befintliga tester).
- `package.json`: nytt skript för att köra den nya rapporten. Inget nytt beroende (beslut 2).
- `docs/api.md:14, :16-24`: säger att priset räknas av den äldre modulen och visar CLI-anropet. Uppdateras när Python-modulen tas bort.
- `pytest.ini:1-3`, `requirements.txt:1-2`: pytest finns, men inga `test_*.py` och ingen `conftest.py`.
- `docs/kursprojekt-mall.md:336-364`: avsnitten Codemap, Karaktäriseringstester och Stegen (minst tre) fylls i från det här arbetet. Migreringsplanen fylls i med att ingen schemaändring görs (beslut 7).

## Befintliga tester

- Bara `tests/orders.test.ts:294-300`. Det kontrollerar 200 och `Number(total) === 1187.5` för order 1042. Jämförelsen med `Number` skulle inte märka om formatet ändras från `"1187.5"` till `"1187.50"`.
- Det saknas tester för `net` och `vat`, rabatt, utgången rabatt, okänd rabattkod, order utan rader, trunkering, avbruten order, 400/401/403/404 för `/price`, loggen och nattrapporten. Det finns inga Python-tester alls.

Dagens utdata för seed-datan, handräknade och kontrollerade med `Decimal`. Ingen DB-körning ännu.

| Order | Kund | Egenhet | net | vat | total |
|---|---|---|---|---|---|
| 1040 | 1 | ingen rabatt | `899` | `224.75` | `1123.75` |
| 1041 | 2 | SOMMAR20, giltig | `588.8` | `147.2` | `736.0` |
| 1042 | 1 | ingen rabatt | `950` | `237.5` | `1187.5` |
| 1043 | 3 | inga rader | `0` | `0` | `0` |
| 1044 | 4 | VAR10, momsen trunkeras (44.9775 → 44.97) | `179.91` | `44.97` | `224.88` |
| 1045 | 5 | GAMMAL15, utgången 2024 men tillämpas | `551.65` | `137.91` | `689.56` |
| 1046 | 6 | `cancelled`, prissätts ändå | `899` | `224.75` | `1123.75` |
| 1047 | 2 | ingen rabatt | `529` | `132.25` | `661.25` |

Nattrapporten för seed-datan: `2026-10-01` ger `1187.5`, `2026-10-05` ger `224.88`, `2026-10-07` ger `689.56`, och en dag utan betalda ordrar ger `0` (`summa` är heltalet 0, `nightly_report.py:9`). Summan av flera ordrar följer `Decimal`-addition, så antalet decimaler blir det största bland ordrarnas `total`.

## Regler som gäller

- `docs/standard.md:25`: belopp räknas aldrig med flyttal. Den nya koden räknar i ören med `BigInt`, och `Number(...)` på belopp är inte tillåtet. Samma rad kräver två decimaler i svaren, vilket dagens svar inte har. Uppdraget säger att formatet bevaras, så avvikelsen kvarstår medvetet.
- `docs/standard.md:26`: all prisberäkning går genom `calcPrice` i `src/pricing/` och dupliceras inte. Under parallellfasen finns beräkningen avsiktligt på två ställen, men bara TypeScript-varianten används av API:t och rapporten. Dubbleringen upphör när Python-modulen tas bort i den separata uppgiften (Besvarat 8).
- `docs/standard.md:10`: parametriserad SQL. Det gäller också nattrapportens fråga när den skrivs om. ESLint stoppar strängmallar i `query(...)`.
- `docs/standard.md:11`: inga N+1-loopar. Raderna och rabatten hämtas i en fråga per order. Rapporten får anropa `calcPrice` per order, som i dag, eller räkna alla ordrar i ett anrop. Planen bestämmer vilket.
- `docs/standard.md:15`: förväntade fel returneras som `Result` och kastas inte.
- `docs/standard.md:30`: inga personuppgifter i loggar. Loggraden innehåller tid, order-id och total, inga personuppgifter.
- `docs/standard.md:33-35`: endpointen ska ha tester för 200, 400, 401, 403 och 404. Tester tas aldrig bort, och karaktäriseringstesterna får inte ändras för att bli gröna efter flytten.
- `CLAUDE.md`: `_kapa` får inte ändras oavsiktligt och ska karaktäriseras med tester före refaktoreringen. Hooken `skydda-tester` stoppar borttagna tester, vilket påverkar hur Python-testerna tas bort (se Oklart).

## Kräver schemaändring?

Nej. Beräkningen läser samma tre tabeller som i dag, och inget lagras. Migreringsplanen i `kursprojekt-mall.md` fylls i med att arbetet inte gör någon schemaändring. En databasmigrering planeras som en separat uppgift vid ett senare tillfälle.

## Besvarat

1. **Nattrapporten skrivs om i TypeScript (alternativ a).** Cron-raden på driftservern ändras utanför repot. Det ska stå i ADR:en och i överlämningen.
2. **Decimaler räknas som heltal i ören med `BigInt`.** Det finns inget nytt beroende. Mellanresultaten har fler decimaler än två: rabatten ger upp till fyra (`summa × percent / 100`) och momsen likaså (`net × 25 / 100`). Därför räknas de i en högre skala och trunkeras mot noll till ören, som `_kapa`. Formatet från `str(Decimal)` återskapas av en egen funktion. Beslutet skrivs som ADR.
3. **Bevaras:**
   - (a) Loggen bevaras, med samma rad och fil (`src/legacy/price_calc.log`).
   - (b) Alla fel i beräkningen ger fortfarande `not_found` (404), även när databasen är nere.
   - (c) Att en rabattkod med apostrof inte längre ger 404 är en godtagbar skillnad, eftersom SQL:en blir parametriserad.
4. **CLI:t och Python-modulen behålls parallellt med den nya implementationen och tas bort senare.** Så länge Python-modulen finns fungerar `python3 src/legacy/price_calc.py <id>` som i dag. Efter borttagningen behöver CLI:t inte finnas.
5. **Nattrapportens utskrift behålls exakt.** Den omskrivna rapporten använder parametriserad SQL.
6. **Python-testerna isoleras med en `conftest.py`.** Den sätter `DATABASE_URL` till `TEST_DATABASE_URL` före importen och kör om schema och seed. Pytest och Jest delar `butik_test`.
7. **Ingen schemaändring.** En databasmigrering görs som en separat uppgift senare.
8. **Python-modulen tas bort i en separat uppgift.** Det här arbetet slutar i parallellfasen. API:t och rapporten använder TypeScript-varianten, medan `src/legacy/price_calc.py`, `jobs/nightly_report.py` och deras tester finns kvar. Den separata uppgiften tar bort Python-koden, Python-testerna och jämförelsetestet. Den uppdaterar också `docs/api.md`, `requirements.txt` och `CLAUDE.md`. Hooken `skydda-tester` stoppar borttagna tester, så borttagningen kräver människans uttryckliga godkännande i den uppgiften.

9. **Klockslaget i loggraden får ha millisekunder följda av `000`**, till exempel `2026-11-18T08:42:41.630000`. Det gäller rader som skrivs av TypeScript-varianten. Tiden är lokal och utan tidszon, som `datetime.now().isoformat()`. När millisekunderna är exakt noll utelämnas bråkdelen, precis som Python gör när mikrosekunderna är noll. Python skriver fortfarande mikrosekunder så länge den finns.

## Oklart

Inget kvar.

## Acceptanskriterier

Status: godkänd

Karaktärisering. Testerna skrivs och är gröna mot dagens Python-kod innan något flyttas. De körs sedan mot den nya implementationen utan att förväntningarna ändras.

1. Givet seed-datan, när kunden som äger ordern hämtar `GET /orders/:id/price` för order 1040–1047, så blir svaret 200 med exakt de strängar för `net`, `vat` och `total` som står i tabellen under Befintliga tester. Testet jämför strängar och inte tal.
2. Givet order 1044 (VAR10), när priset hämtas, så är `vat` `"44.97"` och inte `"44.98"`. Det låser att momsen trunkeras.
3. Givet en order med en rad på 0.99 och rabatten VAR10 (summa 0.891), när priset hämtas, så blir `net` `"0.89"`, `vat` `"0.22"` och `total` `"1.11"`. Det låser att nettot trunkeras mot noll och inte avrundas. Ordern skapas i testet.
4. Givet order 1045 med den utgångna koden GAMMAL15, när priset hämtas, så tillämpas rabatten ändå (`total` `"689.56"`).
5. Givet en order med en rabattkod som inte finns i `discounts`, när priset hämtas, så blir priset detsamma som utan rabatt.
6. Givet order 1043 utan rader, när priset hämtas, så blir svaret 200 med `{"net":"0","vat":"0","total":"0"}`.
7. Givet den avbrutna ordern 1046, när kund 6 hämtar priset, så blir svaret 200 med ett pris.
8. Givet en order vars `net` och `vat` slutar på olika antal decimaler, när priset hämtas, så har `total` lika många decimaler som den längsta av dem (1041 ger `"736.0"`).
9. När `/price` anropas utan `X-Customer-Id`, så blir svaret 401.
10. När `/price` anropas med ett ogiltigt id (`abc`), så blir svaret 400 med `invalid_input`.
11. När kund 1 hämtar priset för kund 2:s order 1041, så blir svaret 403 med `forbidden`.
12. När priset hämtas för en order som inte finns (9999), så blir svaret 404 med `not_found`.
13. Givet att beräkningen misslyckas av ett oväntat skäl, till exempel att databasen inte går att nå från beräkningen, när priset hämtas, så blir svaret 404 med `not_found`.
14. Givet en lyckad prisberäkning, så läggs en rad `<lokal tid ISO> <order_id> <total>` till i `src/legacy/price_calc.log` (klockslaget enligt Besvarat 9). Ett misslyckat försök att skriva loggen påverkar inte svaret.
15. Givet seed-datan, när nattrapporten körs för `2026-10-01` mot testdatabasen, så blir utskriften exakt `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr`. Samma sak gäller `2026-10-05` (`224.88`), `2026-10-07` (`689.56`) och en dag utan betalda ordrar (`0 betalda ordrar, totalt 0 kr`). Utan argument används dagens datum.
16. Givet två betalda ordrar samma dag, när nattrapporten körs, så blir totalen deras summa med lika många decimaler som den längsta av ordrarnas `total`.

Parallellfasen:

17. Givet att båda implementationerna finns, när TypeScript-varianten och `calc_price` i Python räknar samma ordrar, så ger de identiska strängar för `net`, `vat` och `total`. Uppsättningen är seed-datan plus ordrar som skapas i testet med olika antal, priser med ören och rabatter från 0 till 100 procent.
18. Givet att båda implementationerna finns, när `python3 src/legacy/price_calc.py 1042` körs, så skrivs `{"net": "950", "vat": "237.5", "total": "1187.5"}` och kommandot avslutar med exit 0. `... 9999` skriver `{"error": "finns inte"}` och avslutar med exit 1. Det gäller även `python3 jobs/nightly_report.py` med samma utskrift som i kriterium 15.
19. När TypeScript-varianten är inkopplad, så räknar `calcPrice` i `src/pricing/` priset utan att starta `python3`, och den nya nattrapporten använder `calcPrice`. Kriterierna 1–16 är gröna utan ändrade förväntningar.
20. Den nya koden räknar belopp med `BigInt` i ören utan `number`/flyttal, använder bara parametriserad SQL och hämtar inte en fråga per orderrad. Det kontrolleras i granskningen och med `npm run check`.

Alltid:

21. När arbetet är klart finns `src/legacy/price_calc.py` och `jobs/nightly_report.py` kvar oförändrade, och ingen kod i `src/` eller i den nya rapporten anropar dem. Borttagningen görs i en separat uppgift (Besvarat 8).
22. Efter varje steg är `npm test`, `npm run test:legacy` och `npm run check` gröna. Arbetet görs i minst tre steg med en commit per steg.

## API-kontrakt

Oförändrat. I det här arbetet uppdateras bara texten "Räknas av den äldre modulen" i `docs/api.md:14` till att priset räknas i `src/pricing/`. Avsnittet om den äldre modulen på :16-24 finns kvar tills Python-modulen tas bort.

| Metod och sökväg | Indata | Svar | Statuskoder |
|---|---|---|---|
| `GET /orders/:id/price` | Header `X-Customer-Id`, `:id` heltal | `{ net, vat, total }` som strängar i formatet `str(Decimal)`, inte alltid två decimaler | 200; 400 `invalid_input`; 401; 403 `forbidden`; 404 `not_found` (även vid oväntade fel i beräkningen) |

Nattrapporten: `<dag>: <antal> betalda ordrar, totalt <summa> kr` på stdout. Dagen är ett valfritt argument i formatet `ÅÅÅÅ-MM-DD`, med dagens datum som standard.
