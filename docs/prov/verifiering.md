# Verifiering: POST /customers nekar ogiltiga e-postadresser

Gren: funktion/prov · Commit: 0b8516c
Datum: 2026-11-17

## Automatiska kontroller

- npm run check: inga fel i lint, typkontroll eller formatering.
- npm test: 22 gröna, 0 röda.
- npm run test:legacy: inga Python-tester finns än.

## Acceptanskriterier

Anropen gjordes mot `npm start` efter `npm run db:reset`, med `curl http://localhost:3000/customers -X POST -H "Content-Type: application/json" -d '<body>'`. Alla anrop hade `name` satt till ett påhittat provnamn.

| # | Kriterium | Test | Anrop (email → svar) | Status |
|---|---|---|---|---|
| 1 | Giltig adress ger 201 | `tests/customers.test.ts:12` | `prov.provsson@example.com` → 201 med kunden | Uppfyllt |
| 2 | Utan `@` ger 400 | `tests/customers.test.ts:38` | `inte-en-adress` → 400 `invalid_input` | Uppfyllt |
| 3 | Utan domän med punkt, eller utan något före `@`, ger 400 | `tests/customers.test.ts:39` och `:40` | `prov@example` → 400 `invalid_input`. `@example.com` → 400 `invalid_input` | Uppfyllt |
| 4 | Blanksteg inuti ger 400 | `tests/customers.test.ts:41` | `prov provsson@example.com` → 400 `invalid_input` | Uppfyllt |
| 5 | Blanksteg runt en giltig adress tas bort, 201 | `tests/customers.test.ts:51` | `"  prov2@example.com  "` → 201 med `email` lika med `prov2@example.com` | Uppfyllt |
| 6 | Ingen kund sparas vid nekat anrop, och meddelandet upprepar inte adressen | `tests/customers.test.ts:43-48` (kontrolleras i varje rad i `it.each`) | Efter de sex anropen fanns 10 kunder: 8 från testdatan och de 2 som fick 201. Meddelandet var `email är inte en giltig e-postadress.` i alla fyra 400-svaren | Uppfyllt |

Alla 400-svar hade formen `{ "error": { "code", "message" } }`. Fältnamnen i 201-svaren är `id`, `uuid`, `name` och `email`.

## Övrigt

- docs/api.md: uppdaterad. Rad 8 beskriver formatkravet, att blanksteg före och efter tas bort och 400 med `invalid_input`.
- Plan: steg 1, 2 och 3 har `Status: klart`.
- Granskningens åtgärder: listan är tom. Granskningen gav inga fynd som måste åtgärdas, bara två noteringar.
- Migreringar: inga.

## Slutsats

Klart. Alla sex kriterier är uppfyllda, med både test och anrop som bevis.

Två noteringar från granskningen står kvar för människan att ta ställning till: det äldre testet "email saknas" kontrollerar bara statuskoden, och `CLAUDE.md` säger fortfarande att 16 tester ska vara gröna.
