# Granskning: POST /customers nekar ogiltiga e-postadresser

Gren: funktion/prov (e640112..0b8516c)
Granskat mot: docs/prov/plan.md, kriterierna i docs/prov/research.md och docs/standard.md. Planen hänvisar inte till någon ADR.
Datum: 2026-11-17

## Säkerhet

Inga fynd.

Granskaren kontrollerade att SQL fortfarande är parametriserad (`src/services/customerService.ts:32-35`), att felmeddelandet inte upprepar adressen, att ingen loggning har lagts till och att indata valideras före INSERT.

## Struktur

Inga fynd.

Formatkontrollen ligger i tjänstelagret (`isValidEmail`, `src/services/customerService.ts:9-15`) och returnerar `err("invalid_input", ...)` utan att kasta. Routen och `src/http.ts` är orörda. Ändringen följer planens tre steg och lägger inte till något som planen inte bad om.

## Kodstandard

Inga fynd som bryter mot en regel eller ett kriterium. Två noteringar:

### Det äldre testet "email saknas" kontrollerar bara statuskoden
- Var: `tests/customers.test.ts:27-30`
- Varför: testet kontrollerar inte `error.code`. Det är ett gammalt svagt test som ändringen inte gjorde svagare, och planen bad inte om att stärka det.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen.

### CLAUDE.md säger att 16 tester ska vara gröna
- Var: `CLAUDE.md`, kommandolistan
- Varför: antalet tester är nu 22, så raden kan vilseleda. Filen ligger utanför diffen och planen.
- Allvar: notering
- Kontroll som hade stoppat den: ingen, hittades bara i granskningen.

## Vad automatiken hittade

Kört på grenen efter sista commit:

- `npm run check`: inga fel i lint, typkontroll eller formatering.
- `npm test`: 22 av 22 gröna.
- `npm run test:legacy`: inga Python-tester finns än.

Hooks stoppade ingenting under bygget av ändringen.

## Inte bedömt

- Granskaren körde inga tester och kan inte se i en diff att testerna var röda före koden. Det framgår i stället av att varje steg har en egen commit och av rapporterna från `/tdd`.
- Reglerna i `isValidEmail` bedömdes genom läsning, inte genom körning. Exempel som granskaren resonerade om: `a@b.c` godtas, `ida@.com` och `ida@example.` nekas.
- `tests/helpers/db.ts` och `src/db.ts` lästes inte.

## Åtgärder

- [ ]
