# Granskning: Avbryta en beställning (POST /orders/:id/cancel)

Gren: funktion/avbryta-en-beställning (7cfec8c..5d22dac)
Granskat mot: docs/avbryta-en-beställning/plan.md, docs/avbryta-en-beställning/research.md, docs/standard.md, ADR 0001
Datum: 2026-11-17

Granskaren angav radnummer för testfilen som rader i diffen. Här är de översatta till rader i `tests/orders.test.ts` på grenen.

## Säkerhet

Granskaren bekräftade: SQL:en är parametriserad (`src/services/orderService.ts:88-94`, `:104-107`). Kund-id tas bara från `req.customerId` (`src/routes/orders.ts:37`). Ägaren finns i UPDATE-villkoret, och 403 kommer före 409, så en annan kunds status avslöjas inte. Det finns inga hemligheter eller personuppgifter.

### `parseId` godtar id större än Postgres `int4`, vilket troligen ger 500 i stället för 400 eller 404
- Var: `src/routes/orders.ts:9-12`, används av den nya routen på `src/routes/orders.ts:32`
- Varför: Ett anrop som `/orders/99999999999/cancel` når databasen med ett värde som inte ryms i `INTEGER`, och felet fångas inte. Bristen finns redan i `GET /orders/:id` och `GET /orders/:id/price`, men den nya routen ärver den. Granskaren har inte kört anropet.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

## Struktur

Granskaren bekräftade: routen innehåller ingen affärslogik och tjänsten kastar inte. Kontroll och skrivning sker i en enda villkorad UPDATE (`src/services/orderService.ts:88-94`), enligt planen, ADR 0001 och `docs/standard.md:12`. Det finns ingen N+1. Felordningen 401 → 400 → 404 → 403 → 409 följs. Inget har byggts utöver planen.

### Beställningen läses om med `getOrder` i en separat fråga efter den lyckade UPDATE:n
- Var: `src/services/orderService.ts:88-99`
- Varför: Skrivning och läsning sker inte i en transaktion. Planen föreskriver det (`plan.md:12`), och det ger inget felaktigt resultat, eftersom statusen redan är `cancelled` och ingen annan kod ändrar den.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

## Kodstandard

Granskaren bekräftade: fälten är i camelCase och felformen är `{ error: { code, message } }`. Statuskoderna stämmer och belopp returneras som strängar. Endpointen är testad för 200, 400, 401, 403, 404, 409 och samtidighet. Inga tester har tagits bort, hoppats över eller försvagats. `docs/api.md` stämmer med planen och ADR:en.

### Testet för felformen vid 409 upprepar scenariot från 31-minuterstestet
- Var: `tests/orders.test.ts:193-207` (felform för 409), som upprepar `:135-147` (31 minuter). Hjälpfunktionen `forsta409` på `:125-133` upprepar samma uppsättning.
- Varför: Duplicering som inte försvagar något. Planen anger kriterium 12 som ett eget test, så det avviker inte från planen.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### 403-testet sätter `created_at = now()` på den seedade beställningen 1043
- Var: `tests/orders.test.ts:228-236`
- Varför: Ingen brist, utan en bekräftelse. 403 testas med en beställning som annars hade kunnat avbrytas, så testet visar att ägarkontrollen går före status och tid.
- Allvar: notering
- Kontroll som hade stoppat den: ej tillämpligt (inte en brist)

## Vad automatiken hittade

Körda på grenen vid commit 5d22dac:

- `npm run check`: ESLint, `tsc --noEmit` och Prettier är rena. Inga fel eller varningar.
- `npm test`: 2 testfiler, 40 av 40 tester gröna.
- Hooks under bygget: `kontrollera-kodstandard` (`.claude/hooks/kontrollera-kodstandard.mjs`) stoppade två gånger en oanvänd import (`@typescript-eslint/no-unused-vars`) i ett mellanläge, båda i steg 1: `tests/orders.test.ts` och `src/routes/orders.ts` (`sessions/fangster.log`). Båda försvann när nästa ändring var gjord. Inga andra hooks stoppade något.

Automatiken hittade inget av granskarens fynd.

## Inte bedömt

- Granskaren körde inte `npm test`, `npm run check` eller databasen själv. Körningarna ovan gjordes utanför granskaren.
- Granskaren läste inte `db/schema.sql`. Jämförelsen `customerId !== customerId` i `cancelFailure` förutsätter att `customer_id` kommer som ett JS-tal, vilket gäller för `INTEGER` (`db/schema.sql:26`). Samma jämförelse finns i `getOrder`.
- Granskaren kontrollerade inte commit för commit att varje steg byggdes med test först. Den såg bara den slutliga diffen och planens statusrader.
- `src/legacy/` och `jobs/nightly_report.py` bedömdes inte. De ändras inte på grenen.

## Åtgärder
Inga. Människan valde 2026-11-17 att inte åtgärda något av fynden.
