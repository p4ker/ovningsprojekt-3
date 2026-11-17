# Plan: POST /customers nekar ogiltiga e-postadresser

Bygger på: docs/prov/research.md (kriterier godkända)
Beslut: inga

## Steg

### Steg 1: Adresser utan @, utan domän med punkt eller utan lokal del nekas med 400
- Kriterium: 2, 3 och 6 (ingen kund sparas, meddelandet upprepar inte adressen).
- Test först: `tests/customers.test.ts`. Tre nya tester som är röda före koden: `inte-en-adress`, `ida@example` och `@example.com` ger 400 med `error.code` `invalid_input`. Samma tester kontrollerar att antalet rader i `customers` är oförändrat och att `error.message` inte innehåller den inskickade adressen.
- Filer som ändras: `src/services/customerService.ts` (formatkontroll i `createCustomer`, kontrollen görs på den trimmade adressen och returnerar `err("invalid_input", "email är inte en giltig e-postadress.")`). Ingen ändring i routen eller i `src/http.ts`.
- Görs inte i det här steget: regeln om blanksteg inuti adressen. Ingen loggning, inga schemaändringar.

### Steg 2: Blanksteg inuti adressen nekas, och giltiga adresser fungerar som förut
- Kriterium: 4, samt 1 och 5 (skyddas mot regression).
- Test först: `tests/customers.test.ts`. Rött test: `ida strom@example.com` ger 400 `invalid_input`. Dessutom två tester som redan bör vara gröna och som låser beteendet: `ida.strom@example.com` ger 201, och `  ida.strom@example.com  ` ger 201 med adressen sparad utan blanksteg. Ett test för att `email` som inte är en sträng (till exempel ett tal) ger 400 utan att kasta.
- Filer som ändras: `src/services/customerService.ts` (regeln utökas så att blanksteg inuti nekas).
- Görs inte i det här steget: dubbletter, trasig JSON.

### Steg 3: Dokumentera i API-dokumentationen
- Kriterium: API-kontraktet i research.md (ingen ny funktion, dokumentationen ska stämma).
- Test först: inget kodtest, eftersom steget bara ändrar dokumentation. Granskaren kontrollerar att texten stämmer med testerna från steg 1 och 2.
- Filer som ändras: `docs/api.md` (raden för `POST /customers` på rad 8: formatkravet och 400-svaret med `invalid_input`).
- Görs inte i det här steget: ändringar i kod eller tester.

## Utanför planen
- Dubbletter av e-post (UNIQUE eller 409): godkänt som utanför ändringen, och kräver en migrering och ett eget beslut.
- Trasig JSON i body ger HTML i stället för `{ error }`: godkänt som utanför ändringen, värt en egen ändring.
- Striktare regel enligt RFC: den enkla regeln är godkänd.
- Schemaändring (CHECK på `email`): behövs inte, kontrollen görs i tjänstelagret.
- 401, 403 och 404: inte möjliga för den här endpointen.
