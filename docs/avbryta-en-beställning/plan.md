# Plan: Avbryta en beställning

Bygger på: docs/avbryta-en-beställning/research.md (kriterier godkända)
Beslut: ADR 0001 (docs/adr/0001-avbryt-som-egen-endpoint.md, `Status: beslutad`).

## Gemensamt för stegen

- Testerna ligger i `tests/orders.test.ts` (supertest mot `createApp()`, `beforeEach(resetDb)`, header `X-Customer-Id`).
- Det finns inga fake timers och tiden sätts av databasens `now()`. Testerna skapar en beställning med `POST /orders` (kund 3) eller använder en seedad, och flyttar sedan `created_at` med `db.query("UPDATE orders SET created_at = now() - ($2 * interval '1 minute') WHERE id = $1", [id, minuter])`. Seedade beställningar ligger alla långt tillbaka, så ett test som behöver ett öppet fönster sätter `created_at = now()` på samma sätt, och sätter vid behov `status` med `db.query`.
- Ingen schemaändring och ingen migrering. Statusen `cancelled` och `created_at` finns redan (`db/schema.sql:27,29`).
- Felordningen är 401 → 400 → 404 → 403 → 409. 401 ges av `requireCustomer`, 400 av `parseId` i routen, resten av tjänstelagret.
- Atomiciteten ligger i en enda `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND customer_id = $2 AND status = 'new' AND created_at >= now() - interval '30 minutes' RETURNING id`. Ingen separat läsning före skrivningen avgör om den lyckas. Gränsen är "högst 30 minuter", därför `>=`. Ger UPDATE inga rader läser tjänstelagret raden (id, customer_id, status) bara för att välja felsvar: saknas den blir det `not_found`, tillhör den en annan kund `forbidden`, är statusen inte `new` `conflict` ("redan avbruten/betald/skickad") och annars `conflict` ("30 minuter har gått"). Vid lyckad UPDATE returneras `getOrder(orderId, customerId)`.
- Ingen ny felkod behövs. `conflict` → 409 finns i `src/result.ts` och `src/http.ts`.

## Steg

### Steg 1: Kunden kan avbryta en ny egen beställning inom fönstret
- Kriterium: 1, 2 och 3
- Test först: `tests/orders.test.ts`, ny `describe("POST /orders/:id/cancel")`. (a) Kund 3 lägger en beställning, anropar cancel och får 200 med `status: "cancelled"` och samma form som `GET /orders/:id` (kriterium 1). (b) Ett följande `GET /orders/:id` och en `db.query` visar `cancelled` (kriterium 2). (c) `created_at` flyttas till 29 minuter bakåt och cancel ger 200 (kriterium 3). Testerna är röda eftersom routen saknas (404 från Express).
- Filer som ändras: `tests/orders.test.ts`, `src/routes/orders.ts` (ny route med `requireCustomer` och `parseId`, samma mönster som `GET /orders/:id`), `src/services/orderService.ts` (`cancelOrder` med UPDATE-villkoret ovan; här räcker det att den lyckade vägen fungerar och att `UPDATE` utan träff ger `not_found`).
- Görs inte i det här steget: de olika felfallen och deras meddelanden, test av samtidighet, `docs/api.md`.
- Status: klart

### Steg 2: För sent och fel status ger 409 och ändrar ingenting
- Kriterium: 4, 5, 6 och 12 (för 409)
- Test först: `tests/orders.test.ts`. (a) `created_at` 31 minuter bakåt: 409, `error.code === "conflict"`, statusen i databasen är fortfarande `new` (kriterium 4). (b) Beställning med status `cancelled` avbryts igen: 409 (kriterium 5). (c) Status `paid` och status `shipped` med `created_at = now()`: 409 och oförändrad status (kriterium 6). (d) Meddelandet för fönster som gått ut skiljer sig från meddelandet för fel status. (e) Felsvaret har formen `{ error: { code, message } }` (kriterium 12).
- Filer som ändras: `tests/orders.test.ts`, `src/services/orderService.ts` (läsningen efter en misslyckad UPDATE väljer mellan de två `conflict`-meddelandena).
- Görs inte i det här steget: 400/401/403/404, samtidighetstestet.
- Status: klart

### Steg 3: Felfallen 401, 400, 404, 403 och rätt ordning
- Kriterium: 7, 8, 9, 10, 11 och 12
- Test först: `tests/orders.test.ts`. (a) Utan `X-Customer-Id`: 401 och beställning 1043 oförändrad (kriterium 7). (b) Kund 1 avbryter 1043 (kund 3): 403 `forbidden`, status oförändrad (kriterium 8). (c) Id 999999: 404 `not_found` (kriterium 9). (d) `abc`, och även `0` och `-1`: 400 `invalid_input` (kriterium 10). (e) Kund 1 avbryter en annan kunds beställning som har gått ut (`created_at` 31 minuter bakåt) och en som redan är `cancelled`: 403, inte 409 (kriterium 11). (f) Alla felsvar har rätt form (kriterium 12). Flera av dem kan redan vara gröna efter steg 1–2. Det som ska vara rött är (e), om steg 2 läser in raden på ett sätt som ger konflikt före ägarkontrollen. Är alla gröna redan blir steget bara en låsning av beteendet med tester, och det antecknas i planen.
- Filer som ändras: `tests/orders.test.ts`, och vid behov `src/services/orderService.ts` så att ägarkontrollen alltid kommer före status och tid.
- Görs inte i det här steget: samtidighet, dokumentation.
- Status: klart. Testerna för 401, 404 och 400 var gröna direkt och låser beteendet. Testerna för 403, inklusive (e), var röda (409) tills ägarkontrollen lades in före status och tid.

### Steg 4: Två samtidiga anrop kan inte båda lyckas
- Kriterium: 1 och 4–6, i form av kravet i `docs/standard.md:12` att kontroll och uppdatering sker i samma operation.
- Test först: `tests/orders.test.ts`. Kund 3 lägger en beställning och två anrop skickas med `Promise.all`. Exakt ett svar är 200 och det andra 409, och statusen är `cancelled`. Testet kan vara grönt direkt om steg 1 redan använder en enda villkorad UPDATE. Det är avsikten: testet finns för att en senare ändring till "läs, kontrollera, skriv" ska bli rött. Skulle det vara rött avslöjar det att steg 1 inte följde planen, och då rättas implementationen här.
- Filer som ändras: `tests/orders.test.ts`, och vid behov `src/services/orderService.ts`.
- Görs inte i det här steget: andra ändringar i beteendet.
- Status: klart. Testet var grönt direkt. Mot en tillfällig variant som läser, kontrollerar och sedan skriver blev det rött i 5 av 5 körningar (båda anropen fick 200). Varianten committades inte.

### Steg 5: Dokumentera endpointen
- Kriterium: API-kontraktet i research.md (alla kriterier beskrivs i dokumentationen)
- Test först: inget kodtest. Steget ändrar bara dokumentation. Kontrollen är att `npm test` och `npm run check` fortfarande är gröna och att tabellen stämmer med testerna i steg 1–4.
- Filer som ändras: `docs/api.md`. En ny rad efter `GET /orders/:id`: `POST /orders/:id/cancel`, beskrivning med regeln (egen beställning, status `new`, högst 30 minuter från att den lades, ingen body), svar `200, 400, 401, 403, 404, 409`. Beskriv de två orsakerna till 409.
- Görs inte i det här steget: kodändringar.
- Status: klart

## Utanför planen

- `cancelled_at` och annan schemaändring: människan har valt bort det (research, fråga 6).
- Att visa `createdAt` i svaret eller i `GET /orders/:id`: valdes bort (fråga 5).
- Att `GET /orders/:id/price` nekar avbrutna beställningar: fortsatt 200 (fråga 7). Det rör `src/legacy/price_calc.py`, som inte ändras.
- `jobs/nightly_report.py`: bara `paid` räknas där och bara `new` kan avbrytas, så rapporten påverkas inte.
- Test med exakt 30 minuter: går inte att göra pålitligt. Gränsen testas med 29 och 31 minuter.
- Tidszon och klockskillnad mellan API och databas: all tid kommer från databasens `now()`, så ingen klocka i Node används.
