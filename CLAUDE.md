# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Om projektet

Övningsprojekt för delkursen *AI-assisterad systemutveckling*: ett REST-API för en butik (kunder och beställningar) plus en äldre prisberäkning i Python som ska moderniseras. Kod, kommentarer, felmeddelanden och dokumentation skrivs på svenska.

Repot innehåller också kursprojektets rigg, alltså det som styr hur agenten arbetar: behörigheter och hooks i `.claude/settings.json`, subagenter i `.claude/agents/`, skills i `.claude/skills/`, beslutsloggar i `docs/adr/` och sessionsloggar i `sessions/`. Riggen ändras bara med commits. Planen för hur den byggdes står i `docs/rigg-plan.md`.

## Arbetsflöde

Varje arbete görs på en egen gren (`funktion/<mapp>`) och går genom faserna nedan. Varje fas lämnar en fil i `docs/<mapp>/`, och nästa fas läser den filen. Kör `/clear` mellan faserna.

| Fas | Körs med | Lämnar | Människan |
|---|---|---|---|
| Research | `/research <mapp> <story>` | `research.md` med förslag på acceptanskriterier | rättar kriterierna och sätter `Status: godkänd` |
| Plan | subagenten `planerare` | `plan.md`, och ADR-utkast i `docs/adr/` | godkänner planen och sätter `Status: beslutad` i ADR:en |
| Bygg | `/tdd <mapp> <steg>`, en gång per steg | test, kod och `Status: klart` i planen | godkänner varje commit |
| Granska | `/granska <mapp> [gren]` | `granskning.md` | väljer vilka fynd som åtgärdas |
| Verifiera | `/verifiera <mapp>` | `verifiering.md` | kontrollerar bevisen |
| Avsluta | `/sessionslogg`, sedan `/exit` | `sessions/ÅÅÅÅ-MM-DD-n.md` | committar loggen |

Regler för flödet:

- Planera inte förrän kriterierna är godkända, och bygg inte förrän ADR:en är beslutad. Beslut med ett verkligt alternativ skrivs som ADR enligt `docs/adr/mall.md`. En beslutad ADR ändras inte, utan ersätts av en ny.
- Varje commit hänvisar till steget i planen och, där det finns, till en ADR: `Avbryt egen ny beställning (plan steg 1, ADR 0001)`.
- Granskning och verifiering rättar ingenting. Det som ska åtgärdas blir ett nytt steg med `/tdd`.
- Varje arbetspass avslutas med `/sessionslogg`. Loggen committas efter att sessionen har avslutats, eftersom hooken lägger till faktadelen först då.

Hooks som körs automatiskt (`.claude/hooks/`):

- `las-logg` läser in förra passets logg när en session startar. `skriv-logg` lägger till fakta i loggen när sessionen avslutas eller komprimeras.
- `kontrollera-kodstandard` kör Prettier, ESLint och `tsc` efter varje ändring i en `.ts`-fil.
- `skydda-tester` stoppar ändringar som tar bort eller stänger av tester. Skriv aldrig i testfiler från terminalen (`sed -i`, `>`). Använd Edit eller Write.
- `skydda-hemligheter` stoppar hemligheter i koden och skrivningar till `.env`.

När en hook stoppar något rättar du orsaken. Gå inte runt hooken. Varje stopp loggas i `sessions/fangster.log`.

## Kommandon

Krav: Node.js 22+, Python 3.11+, Docker. Kopiera `.env.example` till `.env` först.

Python-paketen ligger i `.venv`. Aktivera den med `source .venv/bin/activate` innan du kör tester eller startar API:t, annars hittar `python3` inte `psycopg` och prisberäkningen misslyckas. Databasen lyssnar på port 5434 (inte 5432, som används av ett annat projekt på samma dator).

```bash
npm run db:up        # PostgreSQL 16 i Docker (skapar även butik_test)
npm run db:reset     # schema + testdata i BÅDA databaserna (butik och butik_test)
npm test             # Jest, --runInBand (alla tester ska vara gröna)
npx jest tests/orders.test.ts -t "returnerar 401"   # en fil / ett test
npm run test:legacy  # pytest, letar efter tests/test_*.py (inga finns än)
npm run lint         # ESLint på src och tests
npm run typecheck    # tsc --noEmit
npm run format:check # Prettier (format skriver om)
npm run check        # lint, typkontroll och formateringskontroll i följd
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

Reglerna står i `docs/standard.md`. Några av dem kontrolleras automatiskt: ESLint stoppar SQL som byggs med strängmallar eller sammanslagning i `query(...)` och tester med `skip` eller `only` (`eslint.config.js`), och hooks stoppar borttagna tester och hemligheter. Resten kontrolleras i granskningen. De viktigaste:
- JSON-fält i camelCase. Byt namn på snake_case-kolumner i SQL med `AS "fältnamn"`.
- All SQL parametriserad, inga N+1-loopar (använd JOIN eller `= ANY($1)`), skrivningar som hör ihop körs i en transaktion.
- Felsvar har alltid formen `{ "error": { "code", "message" } }`. En tom sökning ger 200 med tom lista.
- Kund-id tas bara från `req.customerId`, aldrig från body eller query.
- Pengar: aldrig flyttal. `NUMERIC` i databasen, strängar med två decimaler i svaren. All prisberäkning går genom `calcPrice` i `src/pricing/` och dupliceras inte.
- Inga personuppgifter i loggar.
- Varje endpoint testas för lyckat fall och för 400/401/403/404 där det går. Tester tas aldrig bort eller hoppas över för att bli gröna.
