# Granskning: Prisberäkningen flyttad från Python till TypeScript

Gren: `funktion/modernisera-prisberakning` (`3653a7b..c9861ce`)
Granskat mot: `docs/modernisera-prisberakning/plan.md`, `docs/modernisera-prisberakning/research.md`, `docs/standard.md`, ADR 0002, ADR 0003
Datum: 2026-11-18

Diffen är 24 filer med 1489 tillagda och 37 borttagna rader (`git diff main...HEAD`). Granskaren läste `src/pricing/price.ts`, `orderPrice.ts`, `priceLog.ts` och `calcPrice.ts`, samt `jobs/nattrapport.ts`, `src/routes/orders.ts`, `tests/helpers/nattrapport.ts` och `package.json`. Den läste också Python-originalen. Inget fynd är "måste åtgärdas".

## Säkerhet

Inga fynd.

Granskaren kontrollerade särskilt:

- **SQL:** frågorna är parametriserade i `src/pricing/orderPrice.ts:17-25` (`= ANY($1)`) och `jobs/nattrapport.ts:16-19`. Python-varianten med `%`-formattering anropas inte längre från `src/`.
- **Ägarkontroll:** den ligger kvar i `src/routes/orders.ts:47-51`. `getOrder` körs före `calcPrice`, och kund-id tas bara från `req.customerId`.
- **Loggning:** loggraden i `src/pricing/priceLog.ts:20-22` innehåller tid, order-id och total, men inga personuppgifter. Det finns inga hemligheter i koden.
- **Datumargumentet i nattrapporten:** det går parametriserat till SQL. Ett ogiltigt datum ger exit 1 med stacktrace på stderr. Planen godtar det (Besvarade frågor 5).

## Struktur

### `percent` valideras inte, och över 100 procent blir netto och moms negativa
- Var: `src/pricing/price.ts:50-63` (`computePrice`)
- Varför: Python gör likadant, och `discounts.percent` kommer från databasen och inte från användaren, så det avviker inte från ADR 0003. Det är en egenhet som finns kvar, och inget test låser den. `formatDec` hanterar negativa tal, men inget test täcker ett negativt pris från `computePrice`.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen. `tests/jamforelse.test.ts` prövar rabatter från 0 till 100 procent men inte över 100.

### `calcOrderPrices` skriver en loggrad synkront per order mitt i beräkningen
- Var: `src/pricing/orderPrice.ts:42`
- Varför: det är medvetet och följer plan steg 9, eftersom Python loggar likadant. Med många ordrar i nattrapporten blir det många synkrona anrop till `appendFileSync`. Python gör detsamma, så det är ingen försämring.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen.

### Oväntade fel i `calcPrice` sväljs utan logg och blir `not_found`
- Var: `src/pricing/calcPrice.ts:16-18`
- Varför: beteendet är beslutat (research, Besvarat 3b), och implementationen följer beslutet. Följden är att driftfel som att databasen är nere inte syns, eftersom varken felet eller en stacktrace loggas.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen. `tests/price.test.ts` (steg 5 a) låser att felet blir 404, men inte om något loggas.

### `rapport:natt` kräver `tsx`, som ligger i `devDependencies`
- Var: `package.json:10`, `jobs/nattrapport.ts`
- Varför: om driftservern installerar med `--omit=dev` finns inte `tsx`, och den nya cron-raden misslyckas. ADR 0002 nämner att driftservern behöver Node 22 och `tsx`. `npm start` har samma mönster. Inget i repot kontrollerar detta.
- Allvar: notering, ska med i överlämningen
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen.

## Kodstandard

### Beloppen har formatet från `str(Decimal)` och inte två decimaler
- Var: `src/pricing/price.ts:5-7` och `src/pricing/calcPrice.ts` (svaret från `GET /orders/:id/price`)
- Varför: det här är den beslutade avvikelsen från `docs/standard.md:25` (ADR 0003, plan "Utanför planen"). Granskaren bekräftar att implementationen följer beslutet:
  - `franOren` och `addDec` ger lika många decimaler som den längsta termen.
  - Beloppen passerar aldrig `number`, eftersom `quantity` görs om med `BigInt(...)` och trunkeringen sker i `bigint`.
  - En sökning efter `Number(`, `parseFloat` och `toFixed` i `src/pricing` och `jobs` ger inga träffar.
- Allvar: notering. Fyndet bekräftar bara att beslutet följs, och det finns inget att åtgärda.
- Kontroll som hade stoppat en avvikelse: `tests/price.test.ts` (steg 2–3) och `tests/jamforelse.test.ts` jämför exakta strängar mot Python.

### Hooken `kontrollera-kodstandard` kontrollerar inte `jobs/`
- Var: `.claude/hooks/kontrollera-kodstandard.mjs:34`
- Varför: `jobs/nattrapport.ts` kontrolleras inte automatiskt efter varje ändring, bara av `npm run check`, som sedan steg 11 omfattar `jobs/`. Planen konstaterar luckan men åtgärdar den inte, eftersom riggen bara ändras med en egen commit.
- Allvar: notering
- Kontroll som hade stoppat den: `npm run check` (`package.json`, `lint` och `format:check` med `jobs`, och `tsconfig.json` med `jobs/**/*.ts`) fångar felen, men först när kommandot körs.

### Hjälpfilen för nattrapporten kastar bort underprocessens `stderr`
- Var: `tests/helpers/nattrapport.ts:23-26`
- Varför: ett rött test för nattrapporten blir svårare att felsöka, eftersom bara exit-koden syns. Det påverkar inte korrektheten.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen.

## Jämförelse mot Python

Granskaren läste `computePrice` mot `price_calc.py:23-49` rad för rad och hittade ingen skillnad:

- Trunkeringen sker med `bigint`-division, som motsvarar `int()`.
- Rabatten används bara när koden finns och hittas i `discounts`, som `if kod:` och `if r:`.
- `valid_from` och `valid_to` ignoreras.
- `franOren` motsvarar `Decimal(ören) / 100`.
- `addDec` ger summan den längsta termens antal decimaler.
- Startvärdet 0 i `jobs/nattrapport.ts:23` motsvarar `summa = 0`.
- Loggformatet (`priceLog.ts:12-18`) ger millisekunder följda av `000` och utelämnar bråkdelen när den är 0.

Granskaren hittade ingen avvikelse från ADR 0002 eller ADR 0003.

## Vad automatiken hittade

Kört på grenen 2026-11-18 med `.venv` aktiverad:

- `npm run check`: rent. Inga lint-fel, inga typfel, och Prettier godkänner alla filer i `src`, `tests` och `jobs`.
- `npm test`: 7 av 7 sviter och 125 av 125 tester gröna (11,2 s).
- `npm run test:legacy`: 4 av 4 gröna.

Under bygget stoppade hooks tre mellanlägen. Alla står i `sessions/fangster.log`:

- `kontrollera-kodstandard`, två gånger: en oanvänd import (`tests/price.test.ts`) och ett anrop som lades till före importen (TS2304, `src/pricing/orderPrice.ts`).
- `skydda-tester`, en gång: ett försök att skriva i en testfil med en heredoc. Det gjordes om med Edit.

## Inte bedömt

- Granskaren körde inte tester, lint eller `tsc`. Resultaten ovan kommer från körningen under "Vad automatiken hittade".
- Granskaren läste inte testfilerna i sin helhet och kan därför inte intyga att inga tester har tagits bort eller försvagats. Planen anger för varje steg att testfilerna bara fått tillägg, men granskaren har inte kontrollerat det rad för rad.
- Granskaren kontrollerade inte:
  - att `git diff main -- src/legacy/price_calc.py jobs/nightly_report.py` är tom (plan steg 12 anger att den är det)
  - `eslint.config.js` och `tsconfig.json`
  - dokumentationsändringarna i `docs/api.md`, `README.md` och `CLAUDE.md`
- Jämförelsen mot Python är en läsning av koden och inte en körning. Att implementationerna ger samma resultat över hela intervallet av belopp visas av `tests/jamforelse.test.ts`.
- Cron-raden på driftservern ligger utanför repot och går inte att bedöma.

## Åtgärder

Människan beslutade 2026-11-18 att inget fynd åtgärdas i det här arbetet. Noteringen om `tsx` i `devDependencies` tas med i överlämningen till driften.
