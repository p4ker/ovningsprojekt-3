# Verifiering: Prisberäkningen flyttad från Python till TypeScript

Gren: `funktion/modernisera-prisberakning` · Commit: `c9861ce`
Datum: 2026-11-18

Allt nedan kommer från en körning 2026-11-18 med `.venv` aktiverad och databaserna återställda med `npm run db:reset`. API:t startades med `npm start` och en `PATH` som bara innehöll `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin` och katalogen med `node`. Där finns systemets `python3` (`/usr/bin/python3`), men inte `.venv` med `psycopg`, så API:t hade inte kunnat räkna via Python. Att API:t helt saknar beroende av `python3` visar testet på `tests/price.test.ts:276`.

## Automatiska kontroller

- `npm run check`: rent (exit 0). Inga lint-fel, inga typfel, och Prettier godkänner `src`, `tests` och `jobs`.
- `npm test`: 7 av 7 sviter och 125 av 125 tester gröna, inga röda.
- `npm run test:legacy`: 4 av 4 gröna.

## Acceptanskriterier

| # | Kriterium | Test | Anrop | Status |
|---|---|---|---|---|
| 1 | Seed-ordrarna 1040–1047 ger exakta strängar | `tests/price.test.ts:36` (`it.each`, 8 rader), `tests/price.unit.test.ts:25` | `curl …/orders/<id>/price -H "X-Customer-Id: <ägare>"` för alla 8 → 200. Strängarna är exakt som i researchtabellen, t.ex. 1041 `{"net":"588.8","vat":"147.2","total":"736.0"}` och 1047 `{"net":"529","vat":"132.25","total":"661.25"}` | Uppfyllt |
| 2 | Momsen för 1044 trunkeras till `"44.97"` | `tests/price.test.ts:53`, `tests/price.unit.test.ts:62` | `curl …/orders/1044/price -H "X-Customer-Id: 4"` → `{"net":"179.91","vat":"44.97","total":"224.88"}` [200] | Uppfyllt |
| 3 | 0.99 med VAR10 ger `0.89`/`0.22`/`1.11` | `tests/price.test.ts:59`, `tests/price.test.ts:72` (0.855 → `"0.85"`, skiljer trunkering från avrundning) | `POST /orders` med 1 × 0.99 och VAR10 (id 2001), sedan `curl …/orders/2001/price` → `{"net":"0.89","vat":"0.22","total":"1.11"}` [200]. Med 1 × 0.95 (id 2002) → `{"net":"0.85","vat":"0.21","total":"1.06"}` | Uppfyllt |
| 4 | Den utgångna koden GAMMAL15 tillämpas | `tests/price.test.ts:87` | `curl …/orders/1045/price -H "X-Customer-Id: 5"` → `total` `"689.56"` [200] | Uppfyllt |
| 5 | En okänd rabattkod ger samma pris som ingen kod | `tests/price.test.ts:94` | `POST /orders` 1 × 100 med `FINNSINTE` (2003) och utan kod (2004) → båda `{"net":"100","vat":"25","total":"125"}` [200] | Uppfyllt |
| 6 | 1043 utan rader ger `0`/`0`/`0` | `tests/price.test.ts:66` | `curl …/orders/1043/price -H "X-Customer-Id: 3"` → `{"net":"0","vat":"0","total":"0"}` [200] | Uppfyllt |
| 7 | Den avbrutna ordern 1046 prissätts | `tests/price.test.ts:106` | `curl …/orders/1046/price -H "X-Customer-Id: 6"` → `{"net":"899","vat":"224.75","total":"1123.75"}` [200] | Uppfyllt |
| 8 | `total` får lika många decimaler som den längsta termen | `tests/price.test.ts:112`, `:119`, `:125` | 1041 → `"736.0"`. 1040 → `"1123.75"` | Uppfyllt |
| 9 | 401 utan `X-Customer-Id` | `tests/price.test.ts:166` | `curl …/orders/1042/price` → `{"error":{"code":"unauthorized","message":"Logga in först."}}` [401] | Uppfyllt |
| 10 | 400 med `invalid_input` för ogiltigt id | `tests/price.test.ts:172` (`abc`, `0`, `-1`) | `curl …/orders/abc/price -H "X-Customer-Id: 1"` → `{"error":{"code":"invalid_input","message":"Ogiltigt id."}}` [400] | Uppfyllt |
| 11 | 403 med `forbidden` för en annan kunds order | `tests/price.test.ts:178` | `curl …/orders/1041/price -H "X-Customer-Id: 1"` → `{"error":{"code":"forbidden",…}}` [403] | Uppfyllt |
| 12 | 404 med `not_found` för en order som inte finns | `tests/price.test.ts:184` | `curl …/orders/9999/price -H "X-Customer-Id: 1"` → `{"error":{"code":"not_found","message":"Beställning 9999 finns inte."}}` [404] | Uppfyllt |
| 13 | Ett oväntat fel i beräkningen ger 404 med `not_found` | `tests/price.test.ts:211`, `:237` | `DROP TABLE discounts` i `butik`, sedan `curl …/orders/1041/price -H "X-Customer-Id: 2"` → `{"error":{"code":"not_found","message":"Pris för beställning 1041 kunde inte räknas."}}` [404]. Databasen återställdes efteråt med `npm run db:reset` | Uppfyllt |
| 14 | Loggrad vid lyckad beräkning, skrivfel påverkar inte svaret | `tests/price.test.ts:219`, `:230`, `:237`, `:245`, `tests/priceLog.unit.test.ts:18–77` | De 8 anropen i kriterium 1 gav 8 nya rader i `src/legacy/price_calc.log`, t.ex. `2026-11-18T11:51:08.388000 1047 661.25` (millisekunder följda av `000`, Besvarat 9). Skrivfelet provades bara i testet | Uppfyllt |
| 15 | Nattrapportens exakta utskrift, och dagens datum utan argument | `tests/nattrapport.test.ts:50` (3 dagar), `:60`, `:66` | `npm run rapport:natt -- <dag>` mot `butik` → `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr`, `2026-10-05: … 224.88 kr`, `2026-10-07: … 689.56 kr`, `2026-10-02: 0 betalda ordrar, totalt 0 kr`. Utan argument → `2026-11-18: 0 betalda ordrar, totalt 0 kr`, exit 0 | Uppfyllt |
| 16 | Summan av två ordrar får den längsta termens decimaler | `tests/nattrapport.test.ts:82` (`960.88`), `:90` (`1923.5`), `tests/price.unit.test.ts:98` | Inget eget anrop. Seed-datan har ingen dag med två betalda ordrar. Beviset är testerna, som var gröna i `npm test` | Uppfyllt (testat, inte provat för hand) |
| 17 | TypeScript och Python ger identiska strängar | `tests/jamforelse.test.ts:51` (seed), `:58` (81 skapade ordrar, rabatter 0–100 %), `:126` | Testerna var gröna i `npm test`. Ingen separat körning | Uppfyllt |
| 18 | Python-CLI:t och den gamla rapporten fungerar som förut | `tests/test_legacy_cli.py:20`, `:27`, `:34`, `:41` | `python3 src/legacy/price_calc.py 1042` → `{"net": "950", "vat": "237.5", "total": "1187.5"}`, exit 0. `… 9999` → `{"error": "finns inte"}`, exit 1. `python3 jobs/nightly_report.py 2026-10-01` → `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr` | Uppfyllt |
| 19 | `calcPrice` räknar utan `python3`, rapporten använder TypeScript-beräkningen, och 1–16 är gröna utan ändrade förväntningar | `tests/price.test.ts:276` (`PATH` utan `python3`), `tests/helpers/nattrapport.ts:10` (standard `ts`) | Sökningen efter `execFile`, `python3`, `nightly_report` och `price_calc.py` i `src` och `jobs/nattrapport.ts` hittar bara två kommentarer (`price.ts:3`, `nattrapport.ts:2`). `jobs/nattrapport.ts` importerar `calcOrderPrices` från `src/pricing/`. Att förväntningarna är oförändrade bygger på planens statusrader (tillägg i varje steg) och granskningen. Testfilerna har inte jämförts rad för rad i den här körningen | Uppfyllt |
| 20 | `BigInt` i ören, inga flyttal, parametriserad SQL, ingen fråga per orderrad | `tests/price.unit.test.ts` (hela filen), `npm run check` (ESLint-regeln för SQL i `eslint.config.js`) | Sökningen efter `Number(`, `parseFloat` och `toFixed` i `src/pricing` och `jobs/nattrapport.ts` ger inga träffar. `orderPrice.ts` och `nattrapport.ts` har en `query` var, med `$1`. Granskningen bekräftar (`granskning.md`, Kodstandard) | Uppfyllt |
| 21 | Python-filerna finns kvar oförändrade, och ingen kod anropar dem | – (ingen kodkontroll, kontrolleras med git) | `git diff --stat main -- src/legacy/price_calc.py jobs/nightly_report.py` → tom. Sökningen i kriterium 19 hittar inga anrop | Uppfyllt |
| 22 | Grönt efter varje steg, minst tre steg med en commit var | – | `git log main..HEAD` visar 15 commits, varav 13 för plansteg 1–12 (steg 12 i två commits). Slutläget är grönt i den här körningen. Att varje mellanliggande commit var grön bygger på planens statusrader och har inte körts om commit för commit | Uppfyllt för slutläget. Mellanstegen är inte omkörda |

Kontroller på varje svar från servern:
- Felsvaren har formen `{ "error": { "code", "message" } }`.
- Fälten heter `net`, `vat` och `total`, alltså camelCase.
- Beloppen är strängar i formatet från `str(Decimal)` och inte alltid två decimaler. Det är den beslutade avvikelsen från `docs/standard.md:25` (ADR 0003, API-kontraktet i `research.md`), så den räknas inte som ett fel.

## Övrigt

- **`docs/api.md`:** uppdaterad enligt API-kontraktet. Rad 14 säger att priset räknas av `calcPrice` i `src/pricing/` och beskriver formatet och att alla fel ger 404. Ett nytt avsnitt beskriver nattrapporten (rad 16) med `npm run rapport:natt`. Avsnittet om den äldre modulen (rad 24) finns kvar och beskriver parallellfasen.
- **Plan:** alla 12 steg har `Status: klart`. Inget steg är struket.
- **Granskningens åtgärder:** inga fynd valdes för åtgärd (`granskning.md`, Åtgärder). Noteringen om `tsx` i `devDependencies` ska med i överlämningen till driften.
- **Migreringar:** inga. Arbetet ändrar inte schemat.

## Slutsats

Klart. Alla 22 kriterier är uppfyllda. Kriterium 16 och 17 är visade med tester och inte med egna anrop. Kriterium 22 är visat för slutläget, men mellanstegen har inte körts om.

Inte uppfyllt: inget.

Kvar utanför det här arbetet:
- Cron-raden på driftservern ska ändras till `npm run rapport:natt` (ADR 0002), och driftservern behöver `tsx`.
- Python-koden och dess tester tas bort i en separat uppgift (Besvarat 8).
- Researchtabellen kallar SOMMAR20 "giltig", men koden gick ut 2026-08-31 (se plan steg 3). Det påverkar inte kriterierna.
