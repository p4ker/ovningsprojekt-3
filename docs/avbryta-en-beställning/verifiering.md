# Verifiering: Avbryta en beställning (POST /orders/:id/cancel)

Gren: funktion/avbryta-en-beställning · Commit: 5d22dac
Datum: 2026-11-17

## Automatiska kontroller
- npm run check: grönt. ESLint, `tsc --noEmit` och Prettier har inga fel.
- npm test: 40 gröna, 0 röda (2 testfiler).
- npm run test:legacy: `no tests ran`. Det finns inga Python-tester än, och ändringen rör inte `src/legacy/`.

## Acceptanskriterier

Anropen gjordes mot `npm start` på `http://localhost:3000` efter `npm run db:reset`. Nya beställningar (2001–2006) lades med `POST /orders` som kund 3. För 29 och 31 minuter och för status `paid`/`shipped` ändrades raden med `psql` i databasbehållaren innan anropet. "db:" är statusen i databasen efter anropet.

| # | Kriterium | Test | Anrop | Status |
|---|---|---|---|---|
| 1 | Avbryt ny egen beställning ger 200 i samma form som GET | `tests/orders.test.ts:76` | `curl http://localhost:3000/orders/2001/cancel -X POST -H "X-Customer-Id: 3" -i` → 200, `{"id":2001,"customerId":3,"status":"cancelled","discountCode":null,"lines":[{"product":"Musmatta","quantity":2,"unitPrice":"200.00"}]}` | Uppfyllt |
| 2 | Statusen är sparad | `tests/orders.test.ts:94` | `curl http://localhost:3000/orders/2001 -H "X-Customer-Id: 3" -i` → 200, `"status":"cancelled"`; db: `cancelled` | Uppfyllt |
| 3 | 29 minuter ger 200 | `tests/orders.test.ts:107` | `created_at` = now() − 29 min, `curl http://localhost:3000/orders/2002/cancel -X POST -H "X-Customer-Id: 3" -i` → 200, `"status":"cancelled"` | Uppfyllt |
| 4 | 31 minuter ger 409 och ingen ändring | `tests/orders.test.ts:135` | `created_at` = now() − 31 min, `curl http://localhost:3000/orders/2003/cancel -X POST -H "X-Customer-Id: 3" -i` → 409, `{"error":{"code":"conflict","message":"Beställningen kan bara avbrytas inom 30 minuter från att den lades."}}`; db: `new` | Uppfyllt |
| 5 | Redan avbruten ger 409 | `tests/orders.test.ts:149` | `curl http://localhost:3000/orders/2001/cancel -X POST -H "X-Customer-Id: 3" -i` → 409, `{"error":{"code":"conflict","message":"Bara nya beställningar kan avbrytas."}}` | Uppfyllt |
| 6 | `paid`/`shipped` ger 409 och ingen ändring | `tests/orders.test.ts:161` (två fall) | `curl http://localhost:3000/orders/2004/cancel ...` (paid) och `/orders/2005/cancel` (shipped), kund 3 → båda 409 `conflict`, "Bara nya beställningar kan avbrytas."; db: `paid` respektive `shipped` | Uppfyllt |
| 7 | Utan inloggning ger 401 och ingen ändring | `tests/orders.test.ts:218` | `curl http://localhost:3000/orders/1043/cancel -X POST -i` → 401, `{"error":{"code":"unauthorized","message":"Logga in först."}}`; db: `new` | Uppfyllt |
| 8 | Annans beställning ger 403 och ingen ändring | `tests/orders.test.ts:228` | `created_at` för 1043 = now(), `curl http://localhost:3000/orders/1043/cancel -X POST -H "X-Customer-Id: 1" -i` → 403, `{"error":{"code":"forbidden","message":"Beställningen tillhör en annan kund."}}`; db: `new` | Uppfyllt |
| 9 | Finns inte ger 404 | `tests/orders.test.ts:238` | `curl http://localhost:3000/orders/999999/cancel -X POST -H "X-Customer-Id: 1" -i` → 404, `{"error":{"code":"not_found","message":"Beställning 999999 finns inte."}}` | Uppfyllt |
| 10 | Ogiltigt id ger 400 | `tests/orders.test.ts:245` (`abc`, `0`, `-1`) | `curl http://localhost:3000/orders/abc/cancel -X POST -H "X-Customer-Id: 1" -i`, samma för `0` och `-1` → alla 400, `{"error":{"code":"invalid_input","message":"Ogiltigt id."}}` | Uppfyllt |
| 11 | Annans utgångna eller avbrutna ger 403, inte 409 | `tests/orders.test.ts:252`, `:266` | Kund 1 mot 2003 (31 minuter, kund 3) och 2001 (avbruten, kund 3) → båda 403 `forbidden` | Uppfyllt |
| 12 | Felsvaren har formen `{ error: { code, message } }` | `tests/orders.test.ts:193`, och hjälpfunktionen `:209` som används i `:218`–`:266` | Alla felsvar ovan (kriterierna 4–11) har exakt `{"error":{"code","message"}}` | Uppfyllt |

Utöver kriterierna:
- Kontraktet säger att ett kund-id i body ignoreras. `curl http://localhost:3000/orders/2006/cancel -X POST -H "X-Customer-Id: 1" -H "Content-Type: application/json" -d '{"customerId":3}' -i` gav 403 `forbidden`, så body ignoreras. Inget test täcker det, men det är inte ett eget kriterium.
- Samtidighet: `tests/orders.test.ts:279`, två samtidiga anrop ger exakt `[200, 409]`. Testet provades inte med curl.
- Fälten är i camelCase (`customerId`, `discountCode`, `unitPrice`), och belopp är strängar med två decimaler (`"200.00"`).

## Övrigt
- docs/api.md: uppdaterad. Rad 13 beskriver `POST /orders/:id/cancel` enligt API-kontraktet: ingen body, status `new` och högst 30 minuter, samma svarsform som GET, de två orsakerna till 409, 403 före 409 och statuskoderna 200, 400, 401, 403, 404 och 409.
- Plan: steg 1–5 har alla `Status: klart`.
- Granskningens åtgärder: inga valda. Människan valde 2026-11-17 att inte åtgärda något av de fyra noteringarna.
- Migreringar: inga.

Utvecklingsdatabasen återställdes med `npm run db:reset` efter provet, och servern är stängd.

## Slutsats
Klart. Alla 12 acceptanskriterier är uppfyllda, med både test och anrop som bevis i den här körningen. Inget kriterium saknar test.
