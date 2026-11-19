# Granskning: PR 214, POST /orders/:id/returns

Gren: granskning/pr-214-returer (e7002be..e7002be)
Granskat mot: docs/standard.md, ADR 0003 (ingen plan.md eller research.md finns för ändringen)
Datum: 2026-11-19

Fynden kommer från subagenten `granskare`. Radnumren är omräknade från diff-filen till källfilerna. Fynd eller tillägg märkta *(egen)* kommer inte från granskaren utan från kontroller i huvudsessionen. De är tillagda på användarens begäran och redovisas därför separat.

## Säkerhet

### Kund-id läses från request body i stället för `req.customerId`
- Var: src/routes/returns.ts:12
- Varför: Klienten väljer själv vilken kund den är. Bryter mot regeln om behörighet i standarden.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Ägarkontroll saknas
- Var: src/services/returnService.ts:16-19
- Varför: `customer_id` hämtas men jämförs aldrig med den inloggade kunden. Kund 1 kan returnera order 1041, som tillhör kund 2, och få återbetalningen. Det borde ge 403.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Live-API-nyckel hårdkodad och skickad till klienten
- Var: src/services/returnService.ts:3 och :32
- Varför: `frakt_live_…` ligger i koden och i git-historiken, bäddas in i `label_url`, returneras till kunden och sparas i tabellen `returns`. Nyckeln bör roteras. Standarden kräver att hemligheter läses från miljövariabler.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: `.claude/hooks/skydda-hemligheter.mjs`. Dess mönster matchar raden (provat), men hooken körs bara på agentens egna ändringar. Committen kom utifrån, och ingen kontroll i CI eller vid commit fångar den.

### Kundens e-post loggas
- Var: src/services/returnService.ts:21-22
- Varför: Personuppgifter i loggar bryter mot standarden. Syns i testkörningen. Frågan behövs inte för returen.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Indata valideras inte
- Var: src/routes/returns.ts:11-13
- Varför: `Number("abc")` blir `NaN` och ger databasfel och 500 i stället för 400. `reason` kontrolleras inte. `parseId` från `src/routes/orders.ts` används inte.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Interna felmeddelanden skickas till klienten
- Var: src/routes/returns.ts:17
- Varför: `e.message` kan läcka databasfel och intern information.
- Allvar: bör åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Ingen kontroll av orderstatus eller tidigare retur
- Var: src/services/returnService.ts:16-37
- Varför: Upprepade anrop skapar flera returer och flera återbetalningar. Det borde ge 409.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

## Struktur

### Tjänsten kastar fel i stället för att returnera `Result`
- Var: src/services/returnService.ts:18 och src/routes/returns.ts:16-18
- Varför: Okänd order ger 500 i stället för 404. Felsvaret har formen `{ message }` i stället för `{ error: { code, message } }`. `sendResult` och `sendError` används inte.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Återbetalningen räknas med flyttal utanför `calcPrice`
- Var: src/services/returnService.ts:27-30
- Varför: `parseFloat * 1.25` med hårdkodad moms bryter mot ADR 0003 och mot standardens regel om pengar, och trunkeringen till ören följs inte. *(egen)* Rabattkoden ignoreras också, så en order med `SOMMAR20` (t.ex. 1041) får tillbaka mer än kunden betalade.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Skrivningen görs utan transaktion
- Var: src/services/returnService.ts:16-37
- Varför: Läsningar och INSERT är inte atomiska, så två samtidiga anrop kan båda gå igenom.
- Allvar: bör åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Schemaändringen är ingen migrering
- Var: db/schema.sql:41-48
- Varför: `docs/user-stories.md` kräver migreringar som går att backa. Ett migreringsverktyg saknas än.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Odokumenterad affärsregel om hela beställningen
- Var: src/routes/returns.ts:7
- Varför: Regeln att hela beställningen returneras (inga delreturer) finns bara i en kommentar och är inte beställd eller dokumenterad.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

## Kodstandard

### JSON-fält i snake_case
- Var: src/services/returnService.ts:5-9 och :39
- Varför: `return_id`, `refund_amount` och `label_url` ska vara camelCase.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Beloppet returneras som tal
- Var: src/services/returnService.ts:7
- Varför: Belopp ska vara strängar med två decimaler.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Variabel i snake_case
- Var: src/services/returnService.ts:32
- Varför: `label_url` ska vara camelCase.
- Allvar: bör åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### API-dokumentationen beskriver bristerna som avsedda
- Var: docs/api.md:15
- Varför: Anger `customerId` i body och snake_case-fält, och listar bara status 201 utan felfall.
- Allvar: bör åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Felfallen är otestade och ett test bevisar ingenting
- Var: tests/returns.test.ts:10-35
- Varför: Tester för 400, 401, 403 och 404 saknas. Alla tester använder kund 1 mot en egen order, så ägarbristen syns inte. "sparar returen" (rad 28-35) kontrollerar bara att `GET /orders/1040` ger 200 och går igenom även om ingen retur sparas.
- Allvar: måste åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

### Beloppet testas som flyttal
- Var: tests/returns.test.ts:17
- Varför: `toBeCloseTo(1123.75)` låser in flyttal som typ. Beloppet stämmer mot testdatan (899,00 × 1,25), men det borde jämföras med strängen `"1123.75"`.
- Allvar: bör åtgärdas
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen

## Vad automatiken hittade

- `npm run check`: ESLint, `tsc` och Prettier godkände allt. Ingen regel i `eslint.config.js` fångar något av fynden ovan.
- `npm test` (med `.venv` aktiverad): 128 av 128 tester gick igenom. Testkörningen skriver ut kundens e-post från `returnService.ts:22`.

## Inte bedömt

- Om funktionen var önskad, eftersom ändringen saknar plan, research och acceptanskriterier.
- Vilka orderstatusar som får returneras och om delreturer ska finnas.
- Vilken moms som gäller för returer. Den beräkningen hör i så fall hemma i `calcPrice`.
- Om frakt-API:t är verkligt och nyckeln giltig.

## Åtgärder
- [ ]
