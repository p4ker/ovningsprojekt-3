# Plan: Modernisera prisberäkningen

Bygger på: docs/modernisera-prisberakning/research.md (kriterier godkända)
Beslut: ADR 0002 (docs/adr/0002-nattrapporten-skrivs-om-i-typescript.md) och ADR 0003 (docs/adr/0003-belopp-som-bigint-i-oren-med-trunkering.md), båda `Status: beslutad`. ADR 0003 styr steg 7–10, ADR 0002 styr steg 11.

## Gemensamt för stegen

- Det är en ren refaktorering. Ingen schemaändring och ingen migrering (research, Besvarat 7). `src/legacy/price_calc.py` och `jobs/nightly_report.py` ändras inte i något steg, förutom de tillfälliga mutationerna nedan. Python tas bort i en separat uppgift (Besvarat 8).
- Efter varje steg är `npm test`, `npm run test:legacy` och `npm run check` gröna (kriterium 22).
- Karaktäriseringsteg (1–6): testerna skrivs mot dagens Python och är gröna direkt, så de kan inte vara röda av saknad kod. Rödheten visas i stället med en tillfällig mutation: ändra Python-koden eller en förväntan, kör testet, se det rött, och ställ tillbaka med `git restore <fil>` innan commit. Mutationen committas aldrig. Utfallet antecknas under `Status` i steget (som i steg 4 i `docs/avbryta-en-beställning/plan.md`). Förväntningarna ändras aldrig efter det.
- Testerna skrivs så att förväntningarna inte beror på implementationen (kriterium 19):
  - Jest-tester mot API:t med supertest och `createApp()`, i `tests/price.test.ts` (nytt). Strängar jämförs med `toEqual`/`toBe`, aldrig med `Number`.
  - Nattrapporten körs som underprocess via `tests/helpers/nattrapport.ts` (nytt). Där väljs kommandot med miljövariabeln `NATTRAPPORT` (`python` eller `ts`). Förväntningarna i testfilen ändras aldrig, bara standardvärdet i hjälparen byts i steg 11. Underprocessen ärver `DATABASE_URL` från `tests/helpers/env.ts`, så den går mot `butik_test`.
  - Python-specifika tester hålls till två avgränsade filer som ska tas bort i den senare uppgiften: `tests/test_legacy_cli.py` och `tests/conftest.py` (pytest) samt `tests/jamforelse.test.ts` (Jest). Alla andra tester är implementationsoberoende och blir kvar. Hooken `skydda-tester` stoppar borttagning, så den senare uppgiften kräver människans uttryckliga godkännande.
- Ordrar som behövs utöver seed skapas i testet med `db.query("INSERT ...")` (parametriserat, `RETURNING id`). `resetDb` återställer före varje test.
- Loggfilen `src/legacy/price_calc.log` är gitignorerad. Loggtester läser filen före och efter anropet och jämför bara de tillagda raderna, eftersom Python-sidan och TypeScript-sidan skriver i samma fil.
- Pytest och Jest delar `butik_test` och körs aldrig samtidigt (de körs efter varandra i `npm run check`-flödet och av `/tdd`).
- Under parallellfasen finns beräkningen avsiktligt på två ställen (`docs/standard.md:26`). Bara TypeScript-varianten används av API:t och rapporten efter steg 10 och 11.

## Steg

### Steg 1: `npm run test:legacy` är grönt och låser Python-CLI:t och Pris-gränssnittet
- Kriterium: 18 (CLI och `nightly_report.py`), förutsättning för 22 (pytest utan tester ger exit 5).
- Test först: `tests/test_legacy_cli.py` (nytt). (a) `python3 src/legacy/price_calc.py 1042` skriver `{"net": "950", "vat": "237.5", "total": "1187.5"}` och exit 0. (b) `... 9999` skriver `{"error": "finns inte"}` och exit 1. (c) `python3 jobs/nightly_report.py 2026-10-01` skriver `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr`. (d) Importen `from price_calc import calc_price` med `sys.path` som i `nightly_report.py` ger ett objekt med `net`, `vat` och `total` som kan adderas (det som rapporten och `Pris` kräver). Testerna körs med `subprocess` och en miljö där `DATABASE_URL` är satt av `conftest.py`.
- Filer som ändras: `tests/conftest.py` (nytt: sätter `os.environ["DATABASE_URL"]` till `TEST_DATABASE_URL` (med samma standardvärde som `tests/helpers/env.ts`) före varje import av `price_calc`, och kör om `db/schema.sql` och `db/seed.sql` via `psycopg` i en fixture före varje test), `tests/test_legacy_cli.py`, vid behov `pytest.ini` (testsökväg).
- Rött/grönt: testerna är gröna direkt mot dagens Python. Visa att de kan bli röda: ändra tillfälligt `sys.exit(1)` till `sys.exit(0)` i `price_calc.py` (röd (b)) och `"finns inte"` till `"saknas"` (röd (b)); ändra `print(json.dumps(...))` så att `total` skrivs med `float` (röd (a)). Kör, se rött, `git restore src/legacy/price_calc.py`.
- Görs inte i det här steget: Jest-tester, någon ändring i Python-koden eller i TypeScript.
- Status: klart. De fyra testerna i `tests/test_legacy_cli.py` var gröna direkt mot Python (4 passed). Mutationerna, var och en återställd med `git restore` och inte committad: `"saknas"` i stället för `"finns inte"` gav rött i (b) på utdata. `sys.exit(0)` ensam gav rött i (b) på exit-koden (`0 == 1`). `float(p.total)` gav rött i (a) (`1187.5` utan citattecken). Ingen produktionskod ändrades.

### Steg 2: Priset för seed-ordrarna och trunkeringen är låsta (kriterium 1, 2, 3, 6)
- Kriterium: 1, 2, 3 och 6.
- Test först: `tests/price.test.ts` (nytt, `beforeEach(resetDb)`, header `X-Customer-Id`). (a) En tabelldriven rad per order 1040–1047 (kund enligt tabellen i research) med exakta strängar för `net`, `vat` och `total`, jämförda med `toBe` på strängar (kriterium 1). (b) 1044 ger `vat` `"44.97"` (kriterium 2). (c) En order skapas i testet med en rad à 0.99 och VAR10, kund 1: `{"0.89","0.22","1.11"}` (kriterium 3). (d) 1043 ger exakt `{ net: "0", vat: "0", total: "0" }` med `toEqual` (kriterium 6). (e) Tillägg som kriterium 3 inte täcker, se Fråga 1: en rad à 0.95 med VAR10 (summa 0.855) ger `net` `"0.85"` och inte `"0.86"`. Det är fallet som skiljer trunkering från avrundning.
- Filer som ändras: `tests/price.test.ts`. `tests/orders.test.ts:294-300` ändras inte.
- Rött/grönt: gröna direkt mot Python. Mutation: i `price_calc.py:25` byt `int(x * 100)` mot `int((x * 100).to_integral_value(rounding=ROUND_HALF_UP))` (med `from decimal import ROUND_HALF_UP`). Förväntat rött: (b) (44.9775 → 44.98), (e) (0.855 → 0.86) och 1044:s `total`, men inte (c). Det senare bevisar Fråga 1. `git restore src/legacy/price_calc.py`.
- Görs inte i det här steget: rabattegenheter, format, felfall, logg.
- Status: 

### Steg 3: Rabattegenheterna och talformatet är låsta (kriterium 4, 5, 7, 8)
- Kriterium: 4, 5, 7 och 8.
- Test först: `tests/price.test.ts`. (a) 1045 (GAMMAL15, utgången 2024) ger `total` `"689.56"` (kriterium 4). (b) En order skapas med `discount_code = 'FINNSINTE'`: priset är detsamma som för samma rader utan kod (kriterium 5). (c) 1046 (`cancelled`), kund 6: 200 och `total` `"1123.75"` (kriterium 7). (d) 1041: `total` `"736.0"` med `net` `"588.8"` och `vat` `"147.2"` (kriterium 8). (e) En order där `net` och `vat` har samma antal decimaler (1040: `"899"` och `"224.75"` ger `"1123.75"`) och en där `net` ger två decimaler men `vat` noll (skapas i testet), för att låsa att `total` har den längsta av dem. (f) Rabatt 0 och 100 procent: skapas i testet (kod med `INSERT INTO discounts`), 100 procent ger `{"0","0","0"}`.
- Filer som ändras: `tests/price.test.ts`.
- Rött/grönt: gröna direkt. Mutationer: (1) i `price_calc.py:66` formatera `total` som `f"{p.total:.2f}"`: rött i (d) och (e). (2) i `price_calc.py:42` lägg till `and valid_to >= current_date` i frågan (efter koden): rött i (a). `git restore` efter varje.
- Görs inte i det här steget: 400/401/403/404, logg.
- Status: 

### Steg 4: Felfallen för `/price` är låsta (kriterium 9, 10, 11, 12)
- Kriterium: 9, 10, 11 och 12.
- Test först: `tests/price.test.ts`. (a) Utan `X-Customer-Id`: 401 (kriterium 9). (b) `abc`, och även `0` och `-1`: 400 med `error.code === "invalid_input"` (kriterium 10). (c) Kund 1 hämtar priset för 1041 (kund 2): 403 `forbidden` (kriterium 11). (d) 9999: 404 `not_found` (kriterium 12). (e) Alla felsvar har formen `{ error: { code, message } }`.
- Filer som ändras: `tests/price.test.ts`.
- Rött/grönt: gröna direkt. Mutationer i `src/routes/orders.ts` (tillfälligt): ta bort `if (!order.ok) { ... return; }`-blocket på :48-51 (rött i (c): 200 i stället för 403), och låt `parseId` returnera `Number(raw)` (rött i (b)). 401 visas röd genom att tillfälligt ta bort `requireCustomer` ur routen. 404 visas röd genom att tillfälligt ersätta `sendError(res, order.error)` med `sendError(res, { code: "conflict", message: "x" })`. `git restore src/routes/orders.ts`.
- Görs inte i det här steget: logg och fel i beräkningen.
- Status: 

### Steg 5: Fel i beräkningen ger 404 och loggraden skrivs (kriterium 13, 14)
- Kriterium: 13 och 14.
- Test först: `tests/price.test.ts`. (a) Kriterium 13: `DROP TABLE discounts` med `db.query` och GET `/orders/1041/price` (SOMMAR20) som ägaren, kund 2: 404 med `not_found`. Beräkningen misslyckas när rabatten slås upp, medan `getOrder` inte läser `discounts` (`orderService.ts:67, 79`), så det är beräkningen som felar. Testet fungerar likadant för Python och TypeScript. `resetDb` återskapar tabellen. (b) Kriterium 14: efter ett lyckat anrop för 1042 har loggfilen fått exakt en ny rad som matchar `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)? 1042 1187\.5$` (så att både Pythons mikrosekunder och TypeScripts `…000` godkänns). (c) Ett anrop med fel (404) lägger inte till någon rad. (d) Loggen går inte att skriva: filen flyttas undan om den finns, en katalog skapas på `src/legacy/price_calc.log`, anropet ger ändå 200 med rätt pris, och katalogen tas bort och filen flyttas tillbaka i `finally`.
- Filer som ändras: `tests/price.test.ts`.
- Rött/grönt: gröna direkt. Mutationer: (1) i `src/pricing/legacyPrice.ts:14` byt `"not_found"` mot `"conflict"`: rött i (a) (409). (2) i `price_calc.py:53` byt ordningen på `order_id` och `total`: rött i (b). (3) ta bort `try/except` runt loggen (`:51-56`): rött i (d). `git restore` efter varje.
- Görs inte i det här steget: TypeScript-implementationen, nattrapporten.
- Status: 

### Steg 6: Nattrapporten är låst (kriterium 15, 16)
- Kriterium: 15 och 16.
- Test först: `tests/nattrapport.test.ts` (nytt) och `tests/helpers/nattrapport.ts` (nytt: `kor(args: string[])` startar kommandot som `NATTRAPPORT` väljer, standard `python` = `python3 jobs/nightly_report.py`, och returnerar stdout och exit-kod). (a) `2026-10-01` ger exakt `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr\n`, `2026-10-05` ger `224.88` och `2026-10-07` ger `689.56` (kriterium 15). (b) En dag utan betalda ordrar ger `0 betalda ordrar, totalt 0 kr`. (c) Utan argument används dagens datum: en betald order skapas med `created_at` satt till lokal dag klockan 12:00 (datumet byggs av testets lokala datum), och utskriften börjar med samma datum (kriterium 15). (d) Två betalda ordrar samma dag skapas (ordrar med `total` `"736.0"` och `"224.88"`): totalen blir `960.88`, och med `"736.0"` och `"1187.5"` blir den `1923.5` (kriterium 16). (e) Rapporten lägger till en loggrad per beräknad order (samma format som steg 5), eftersom `calc_price` loggar.
- Filer som ändras: `tests/nattrapport.test.ts`, `tests/helpers/nattrapport.ts`.
- Rött/grönt: gröna direkt mot Python. Mutationer i `jobs/nightly_report.py`: byt `summa += p.total` mot `summa = p.total` (rött i (d)), och byt `kr` mot `SEK` (rött i (a)–(c)). `git restore jobs/nightly_report.py`.
- Görs inte i det här steget: någon TypeScript-rapport. Jest har bara en testfil för rapporten och ingen fil som är specifik för Python.
- Status: 

### Steg 7: Beräkningen och talformatet i TypeScript, vid sidan av (ADR 0003)
- Kriterium: 20 (BigInt i ören, utan `number`), förutsättning för 17.
- Test först: `tests/price.unit.test.ts` (nytt, utan databas). Modulen `src/pricing/price.ts` finns inte, så testet är rött. (a) `parseMoney("19.95")` ger rätt ören utan flyttal, även `"0.99"`, `"1000"`, `"0.10"`. (b) `computePrice(rader, procent)` ger för tabellen i research (1040–1047 som rader och procent) exakt strängarna `net`, `vat`, `total`. (c) Trunkering mot noll: 0.855 → `"0.85"`, 44.9775 → `"44.97"`, och 0.99 med 10 procent → `"0.89"`, `"0.22"`, `"1.11"`. (d) Formatet efterliknar `str(Decimal)`: `"950"`, `"588.8"`, `"0"`, `"736.0"`, `"1187.5"`, och `addDec` ger lika många decimaler som den längsta termen (`1187.5 + 736.0` → `"1923.5"`, `0 + 224.88` → `"224.88"`, heltalet 0 som start ger `"0"`). (e) Procent 0 och 100, och inga rader.
- Filer som ändras: `tests/price.unit.test.ts`, `src/pricing/price.ts` (nytt: typen `{ units: bigint; scale: number }`, `parseMoney`, `computePrice`, `formatDec`, `addDec`). Ingen databas och ingen I/O.
- Görs inte i det här steget: SQL, loggning, någon koppling till routen.
- Status: 

### Steg 8: Prisuträkning från databasen och jämförelse mot Python (kriterium 17)
- Kriterium: 17 och 20 (parametriserad SQL, ingen fråga per orderrad).
- Test först: `tests/jamforelse.test.ts` (nytt, avgränsad, tas bort i den senare uppgiften). Den anropar `calcOrderPrices([id])` (finns inte än, så testet är rött) och jämför för varje order med strängar för `net`, `vat` och `total` mot det Python-CLI:t skriver (`execFile("python3", ["src/legacy/price_calc.py", id])`). Uppsättningen är seed 1040–1047 och ordrar skapade i testet: antal 1–50, priser med ören (0.01, 0.99, 19.95, 99999999.99), flera rader, rabatter 0, 1, 7, 10, 15, 33, 50, 99 och 100 procent, och en order utan rader. Skapade ordrar kan använda en lista med fasta kombinationer som genereras av en deterministisk funktion (inget slumpfrö). Ett separat test att anropet med flera id (`[1040, 1041, 1042]`) ger samma som ett i taget och att ett okänt id utelämnas ur resultatet.
- Filer som ändras: `tests/jamforelse.test.ts`, `src/pricing/orderPrice.ts` (nytt: `calcOrderPrices(ids: number[]): Promise<Map<number, Price>>`, en enda fråga `SELECT o.id, d.percent, l.quantity, l.unit_price FROM orders o LEFT JOIN discounts d ON d.code = o.discount_code LEFT JOIN order_lines l ON l.order_id = o.id WHERE o.id = ANY($1)`. `discounts.code` är primärnyckel, så en rabatt dubblerar inga rader. Räknar med `price.ts`. Skriver ingen logg än.)
- Rött/grönt: rött av saknad modul. För att visa att jämförelsen kan avslöja fel: ändra tillfälligt trunkeringen i `price.ts` till avrundning och se testet rött. `git restore src/pricing/price.ts`.
- Görs inte i det här steget: loggning, `calcPrice` och routen ändras inte, API:t använder fortfarande Python.
- Status: 

### Steg 9: TypeScript-varianten skriver samma loggrad
- Kriterium: 14, och 20.
- Test först: `tests/priceLog.unit.test.ts` (nytt, utan databas). (a) `formatLogTimestamp(new Date(...))` ger lokal tid utan tidszon i formatet `2026-11-18T08:42:41.630000` (millisekunder följda av `000`, Besvarat 9). (b) När millisekunderna är 0 utelämnas bråkdelen: `2026-11-18T08:42:41`. (c) `formatLogLine(now, orderId, total)` ger `<tid> 1042 1187.5` (utan radbrytning), och `writePriceLog(...)` lägger till en rad med `\n` i en tillfällig fil som testet anger. (d) Skrivfel (katalog i stället för fil) kastar inte. Testet är rött eftersom modulen saknas.
- Filer som ändras: `tests/priceLog.unit.test.ts`, `src/pricing/priceLog.ts` (nytt: använder `node:fs` `appendFileSync` i `try/catch`; standardsökväg `src/legacy/price_calc.log`, som Python; sökvägen kan anges för testet. Inga personuppgifter loggas, `docs/standard.md:30`), `src/pricing/orderPrice.ts` (`calcOrderPrices` anropar `writePriceLog` för varje lyckad order).
- Görs inte i det här steget: att koppla `calcPrice`. Jämförelsetestet från steg 8 ska fortfarande vara grönt.
- Status: 

### Steg 10: `calcPrice` räknar i TypeScript utan att starta `python3` (kriterium 19)
- Kriterium: 19 (och 13: fel ger fortfarande `not_found`).
- Test först: `tests/price.test.ts`, nytt test. `process.env.PATH` sätts under testet till en katalog som saknar `python3` (återställs i `finally`), och GET `/orders/1042/price` ger 200 med `{ net: "950", vat: "237.5", total: "1187.5" }`. Testet är rött eftersom `execFile("python3")` misslyckas och ger 404. Alla tester från steg 2–5 körs oförändrade och ska vara gröna efteråt.
- Filer som ändras: `src/pricing/calcPrice.ts` (nytt namn, ersätter `src/pricing/legacyPrice.ts` via `git mv`: `calcPrice(orderId): Promise<Result<Price>>` anropar `calcOrderPrices([orderId])`, och allt som kastas blir `err("not_found", ...)`, så det finns ingen väg som ger något annat), `src/routes/orders.ts` (importen och kommentaren på :40), `tests/price.test.ts`. Typen `Price` och signaturen är oförändrade.
- Görs inte i det här steget: nattrapporten, dokumentation. `src/legacy/price_calc.py` lämnas oförändrad.
- Status: 

### Steg 11: Nattrapporten i TypeScript (ADR 0002)
- Kriterium: 15, 16 och 19 (rapporten använder `calcPrice`/`calcOrderPrices`), 20.
- Test först: `tests/nattrapport.test.ts` ändras inte i förväntningarna. Standardvärdet i `tests/helpers/nattrapport.ts` byts till `ts` (`tsx jobs/nattrapport.ts`). Testerna är röda eftersom filen saknas. Python-varianten körs fortfarande med `NATTRAPPORT=python` och ger samma resultat (kontrolleras en gång för hand och i `tests/test_legacy_cli.py`).
- Filer som ändras: `jobs/nattrapport.ts` (nytt: dagen från argument eller lokalt dagens datum, `SELECT id FROM orders WHERE status = 'paid' AND created_at::date = $1::date` parametriserad, ett anrop till `calcOrderPrices(ids)`, summering med `addDec` med heltalet 0 som start, utskriften `%s: %d betalda ordrar, totalt %s kr`, och `db.end()` efteråt), `package.json` (skriptet `rapport:natt`; `lint`, `format` och `format:check` utökas med `jobs`), `tsconfig.json` (`jobs/**/*.ts` i `include`), `tests/helpers/nattrapport.ts`.
- Görs inte i det här steget: att ändra eller ta bort `jobs/nightly_report.py`, cron-raden (ADR 0002).
- Status: 

### Steg 12: Dokumentera och kontrollera
- Kriterium: API-kontraktet (research, `docs/api.md:14`), 20 och 21.
- Test först: inget kodtest. Kontrollen är att `npm test`, `npm run test:legacy` och `npm run check` är gröna, att `git diff main -- src/legacy/price_calc.py jobs/nightly_report.py` är tomt (kriterium 21), och att `rg "price_calc|python3|execFile" src jobs` bara hittar loggsökvägen i `src/pricing/priceLog.ts`. Granskningen kontrollerar kriterium 20 (BigInt, ingen `Number(` på belopp, ingen SQL med strängmallar).
- Filer som ändras: `docs/api.md` (rad 14: priset räknas i `src/pricing/`, avsnittet på :16-24 om den äldre modulen finns kvar; lägg till raden om nattrapportens kommando `npm run rapport:natt`), `CLAUDE.md` (Arkitektur: att `calcPrice` räknar i TypeScript, att `jobs/nattrapport.ts` ersätter `nightly_report.py` i drift, och att Python-modulen ligger kvar parallellt tills den separata borttagningen. Det görs i en egen commit eftersom det är en riggändring).
- Görs inte i det här steget: kodändringar, `requirements.txt`.
- Status: 

## Besvarade frågor (2026-11-18)

1. Det extra testet i steg 2 (e), där 0.855 ska ge `"0.85"`, behålls. Kriterium 3 ändras inte.
2. ADR 0002 och 0003 sätts till `Status: beslutad` av människan innan bygget börjar.
3. Cron-raden på driftservern ändras till `npm run rapport:natt` av människan eller driften efter sammanslagningen (ADR 0002).
4. `jobs/` läggs till i `tsconfig.json`, `lint`, `format` och `format:check` i steg 11.
5. Ogiltigt datumargument till nattrapporten testas inte.
6. Risken vid midnatt i testet för dagens datum i steg 6 godtas.
7. Loggsökvägen `src/legacy/price_calc.log` i `priceLog.ts` strider inte mot kriterium 21. Kriteriet gäller anrop, inte filnamn.
8. `CLAUDE.md` får en rad om parallellfasen i steg 12, i en egen commit.
9. Steg 5 (d) får flytta undan den gitignorerade loggfilen under testet och lägga tillbaka den i `finally`.

## Utanför planen

- Att ta bort `src/legacy/price_calc.py`, `jobs/nightly_report.py`, `tests/test_legacy_cli.py`, `tests/conftest.py` och `tests/jamforelse.test.ts`, och att uppdatera `docs/api.md:16-24`, `requirements.txt` och `CLAUDE.md`: separat uppgift (Besvarat 8). Hooken `skydda-tester` kräver människans godkännande då.
- Att ändra cron-raden på driftservern: utanför repot, beskrivs i ADR 0002 och i överlämningen.
- Att ändra egenheterna: trunkering, ignorerade `valid_from`/`valid_to` och talformatet bevaras medvetet. Svaret följer därför inte `docs/standard.md:25` (två decimaler). Det är en känd avvikelse.
- Att ändra att alla fel ger `not_found`, även när databasen är nere (Besvarat 3b).
- Rabattkod med apostrof ger inte längre 404 (Besvarat 3c). Det testas inte som karaktärisering eftersom skillnaden är avsedd.
- Schemaändringar och migreringar (Besvarat 7).
- Ogiltigt datumargument till nattrapporten: Python ger en traceback, och det karaktäriseras inte.
- Exakta mikrosekunder i loggraden från TypeScript (Besvarat 9): testerna godkänner båda formerna.
- Tidszon och midnatt: testet för "dagens datum" i steg 6 räknar datumet lokalt och kan i teorin fela exakt vid midnatt.
