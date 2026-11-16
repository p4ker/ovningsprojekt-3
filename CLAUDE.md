# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Om projektet

Övningsprojekt för delkursen *AI-assisterad systemutveckling*: ett REST-API för en butik (kunder och beställningar) plus en äldre prisberäkning i Python som ska moderniseras. Kod, kommentarer, felmeddelanden och dokumentation skrivs på svenska.

De tomma katalogerna `.claude/agents/`, `.claude/skills/`, `docs/adr/` och `sessions/` är avsedda för kursprojektets "rigg" (agenter, skills, beslutsloggar, sessionsanteckningar).

## Kommandon

Krav: Node.js 22+, Python 3.11+, Docker. Kopiera `.env.example` till `.env` först.

```bash
npm run db:up        # PostgreSQL 16 i Docker (skapar även butik_test)
npm run db:reset     # schema + testdata i BÅDA databaserna (butik och butik_test)
npm test             # Jest, --runInBand (16 tester ska vara gröna)
npx jest tests/orders.test.ts -t "returnerar 401"   # en fil / ett test
npm run test:legacy  # pytest, letar efter tests/test_*.py (inga finns än)
npm run lint         # ESLint på src och tests
npm run typecheck    # tsc --noEmit
npm run format:check # Prettier (format skriver om)
npm run dev          # tsx watch, API på http://localhost:3000
```

Pröva API:t manuellt: `curl http://localhost:3000/orders/1042/price -H "X-Customer-Id: 1"`.

## Arkitektur

**Lager i API:t (TypeScript, Express, `pg`):**
- `src/routes/*` – endpoints. Parsar id:n, anropar tjänstelagret och översätter `Result` till HTTP med `sendResult`/`sendError` (`src/http.ts`).
- `src/services/*` – affärslogik och SQL. Kastar inte för förväntade fel utan returnerar `ok(...)`/`err(kod, meddelande)` från `src/result.ts`. Felkoderna mappas till status i `STATUS` i `src/http.ts` (invalid_input→400, forbidden→403, not_found→404, conflict→409). En ny felkod måste läggas till på båda ställena.
- `src/auth.ts` – `requireCustomer` läser `X-Customer-Id` (förenklad inloggning) och sätter `req.customerId`; saknas/ogiltig ger 401. Ägarkontrollen (403) görs i tjänstelagret, t.ex. `getOrder`.
- `src/db.ts` – en delad `Pool` från `DATABASE_URL`.
- `src/app.ts` exporterar `createApp()` (används av testerna via supertest); `src/server.ts` startar servern.

**Prisberäkningen korsar språkgränsen:** `GET /orders/:id/price` → `calcPrice` i `src/pricing/legacyPrice.ts` → `execFile("python3", src/legacy/price_calc.py <orderId>)`, som läser databasen själv och skriver JSON `{net, vat, total}` (strängar) till stdout. Alla fel från skriptet blir `not_found`. Python-miljön behöver `psycopg` (`requirements.txt`).

**`src/legacy/price_calc.py` har fler beroenden än API:t:** `jobs/nightly_report.py` importerar `calc_price` och `conn` direkt (via `sys.path`) och körs av cron i drift. Ändringar i modulens publika gränssnitt måste hålla båda användarna fungerande. Kända egenheter i modulen:
- Ansluter till databasen redan vid import.
- `_kapa` trunkerar till två decimaler i stället för att avrunda. Kommentaren säger att ekonomi har stämt av mot den, så beteendet får inte ändras oavsiktligt. Karaktärisera det med tester innan refaktorering.
- Bygger SQL med `%`-formattering (inte parametriserat), ignorerar `valid_from`/`valid_to` på rabattkoder och skriver en loggfil `price_calc.log` bredvid sig själv.

**Databasen:** `db/schema.sql` droppar och skapar om alla tabeller (customers, discounts, orders, order_lines) och saknar främmande nycklar; `db/seed.sql` har testdata. Det finns inget migreringsverktyg än. Enligt `docs/user-stories.md` ska schemaändringar göras som migreringar i steg som går att backa.

## Tester

- `tests/helpers/env.ts` (Jests `setupFiles`) skriver över `DATABASE_URL` med `TEST_DATABASE_URL`, så testerna rör aldrig utvecklingsdatabasen. Python-skriptet ärver samma miljö via `execFile`.
- Varje testfil kör `beforeEach(resetDb)`, som kör om hela schema + seed. Därför `--runInBand`: filerna delar en databas.
- Databasen måste vara igång (`npm run db:up`) för att testerna ska gå.

## Kodstandard

Reglerna står i `docs/standard.md` och kontrolleras inte automatiskt än (att göra dem kontrollerbara via verktyg och hooks ingår i kursprojektet). De viktigaste:
- JSON-fält i camelCase. Byt namn på snake_case-kolumner i SQL med `AS "fältnamn"`.
- All SQL parametriserad, inga N+1-loopar (använd JOIN eller `= ANY($1)`), skrivningar som hör ihop körs i en transaktion.
- Felsvar har alltid formen `{ "error": { "code", "message" } }`. En tom sökning ger 200 med tom lista.
- Kund-id tas bara från `req.customerId`, aldrig från body eller query.
- Pengar: aldrig flyttal. `NUMERIC` i databasen, strängar med två decimaler i svaren. All prisberäkning går genom `calcPrice` i `src/pricing/` och dupliceras inte.
- Inga personuppgifter i loggar.
- Varje endpoint testas för lyckat fall och för 400/401/403/404 där det går. Tester tas aldrig bort eller hoppas över för att bli gröna.
