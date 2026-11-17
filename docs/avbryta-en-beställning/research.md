# Research: En kund kan avbryta sin egen beställning inom 30 minuter efter att den lades

Story: Avbryta en beställning. Som kund vill jag kunna avbryta en beställning inom 30 minuter efter att jag lagt den. (`docs/user-stories.md:6`)
Gren: funktion/avbryta-en-beställning

## Berörs

- `src/routes/orders.ts:21-28`: `GET /orders/:id` visar hur en route för en enskild beställning parsar id, kör `requireCustomer` och anropar tjänstelagret. Den nya endpointen läggs här och följer samma mönster.
- `src/services/orderService.ts:64-83`: `getOrder` har ägarkontrollen (`:74-76`, `forbidden`) efter 404-kontrollen (`:70-72`). Avbrytandet behöver samma kontroller i samma ordning. Svaret kan återanvända `getOrder`, så att det har samma form som `GET /orders/:id`.
- `src/services/orderService.ts:32-62`: `createOrder` sätter varken `status` eller `created_at` (`:44`). Båda får sina värden från databasens default. Där börjar 30-minutersfönstret.
- `src/services/orderService.ts:6-12`: typen `Order` saknar `createdAt`. Den berörs bara om kunden ska få se tidsstämpeln (se Oklart).
- `db/schema.sql:27`: `status TEXT NOT NULL DEFAULT 'new'`. Kolumnen har ingen CHECK, så `cancelled` kan skrivas utan schemaändring.
- `db/schema.sql:29`: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Det är den enda tidsstämpeln, och 30 minuter räknas från den.
- `db/seed.sql:20-28`: seed har statusvärdena `new`, `paid`, `shipped` och `cancelled` (1046). Statusen `cancelled` används alltså redan. Alla beställningar i seed lades i augusti–oktober 2026, så ingen av dem ligger inom 30 minuter.
- `src/result.ts:2` och `src/http.ts:4-9`: felkoden `conflict` → 409 finns redan men används inte. Ingen ny felkod behövs om fönstret som gått ut och fel status blir 409.
- `src/auth.ts:7-16`: `requireCustomer` svarar 401 med koden `unauthorized` direkt (`:11`). Koden finns inte i `ErrorCode` eller `STATUS`, men den följer felformen.
- `jobs/nightly_report.py:8`: rapporten tar bara med `status = 'paid'` och filtrerar på `created_at::date`. En beställning som avbryts från `new` påverkar inte rapporten. Får en `paid`-beställning avbrytas försvinner den ur rapporten om rapporten körs om för samma dag.
- `src/legacy/price_calc.py:28-58`: `calc_price` läser aldrig status. `GET /orders/:id/price` (`src/routes/orders.ts:31-43`) svarar alltså 200 även för en avbruten beställning. Ändringen rör inte modulen.
- `docs/api.md:12`: tabellen över endpoints. Den nya endpointen ska läggas till där.

## Befintliga tester

- `tests/orders.test.ts:1-8`: supertest mot `createApp()`, `beforeEach(resetDb)`, `afterAll(closeDb)`. Headern sätts med `.set("X-Customer-Id", "3")`.
- `tests/orders.test.ts:41-63`: `GET /orders/:id` har tester för 200, 403, 404 och 400. 401 saknas.
- `tests/orders.test.ts:11-38`: `POST /orders` har tester för 201, 400 och 401. Ett test kan skapa en ny beställning på det här sättet och få `created_at = now()`.
- `tests/customers.test.ts:34`: ett test läser databasen direkt med `db.query`. Samma sätt fungerar för att flytta `created_at` bakåt (`now() - interval '31 minutes'`) och för att kontrollera att statusen har ändrats.
- Det finns inget sätt att styra klockan. Ingen kod använder `Date` i `src/`, Jest har inga fake timers och tiden sätts av databasens `now()`. 30-minutersgränsen måste därför testas med data som skrivs direkt i testdatabasen.
- Saknas: alla tester för avbrytande, för status och för `created_at`.

## Regler som gäller

- `docs/standard.md:10`: all SQL är parametriserad.
- `docs/standard.md:12`: skrivningar som hör ihop görs i en transaktion. Kontrollen av status och tid ska ske i samma operation som uppdateringen, så att två samtidiga anrop inte båda lyckas.
- `docs/standard.md:15-16`: tjänstelagret returnerar `Result` och kastar inte. Routen svarar med `sendResult`/`sendError`. Felsvaren har formen `{ "error": { "code", "message" } }`.
- `docs/standard.md:17`: 400 för ogiltig indata, 401 för inte inloggad, 403 för någon annans beställning, 404 om den inte finns och 409 för konflikt.
- `docs/standard.md:21-22`: kund-id tas bara från `req.customerId`. Ägarkontrollen görs i tjänstelagret.
- `docs/standard.md:30`: inga personuppgifter i loggar.
- `docs/standard.md:33-35`: varje endpoint testas för lyckat fall och för 400/401/403/404. Tester tas aldrig bort eller hoppas över.
- `CLAUDE.md`: JSON-fält i camelCase (`created_at AS "createdAt"` om tidsstämpeln ska med i svaret).

## Kräver schemaändring?

Nej, inte för kriterierna nedan. `status` är `TEXT` utan CHECK och `created_at` finns redan.

En kolumn `orders.cancelled_at` övervägdes men valdes bort (Oklart, fråga 6).

## Oklart

Besvarat av människan 2026-11-17:

1. **Vilka statusar får avbrytas?** Svar: bara `new`. `paid` och `shipped` ger 409. (Kriterium 6.)
2. **Är gränsen 30 minuter inklusive?** Svar: högst 30 minuter från `created_at`. Kriterierna testar 29 och 31 minuter, eftersom exakt 30 minuter inte går att testa pålitligt. (Kriterierna 3 och 4.)
3. **Vad händer vid ett andra avbrytande av en redan avbruten beställning?** Svar: 409. (Kriterium 5.)

4. **Endpointens form:** `POST /orders/:id/cancel` (en åtgärd med egna regler) eller `PATCH /orders/:id` med `{ "status": "cancelled" }`. Svar: beslutas som en ADR i planfasen. Kriterierna och kontraktet nedan använder `POST /orders/:id/cancel` tills ADR:en är beslutad.
5. **Ska svaret och `GET /orders/:id` visa `createdAt`?** Svar: nej.
6. **Ska tidpunkten för avbrytandet sparas (`cancelled_at`)?** Svar: nej, ingen ny kolumn och ingen migrering.
7. **Ska `GET /orders/:id/price` neka avbrutna beställningar?** Svar: nej. Det är okej att de fortfarande får pris.
8. **Olika felkoder för fönster som gått ut och fel status?** Svar: samma felkod `conflict`, med olika meddelanden.

Inga öppna frågor återstår.

## Acceptanskriterier

Status: godkänd

1. Givet att kund 3 har lagt en beställning med status `new` för mindre än 30 minuter sedan, när kunden anropar `POST /orders/:id/cancel`, så blir svaret 200 med beställningen i samma form som `GET /orders/:id` och `status: "cancelled"`.
2. Givet att en beställning har avbrutits enligt kriterium 1, när kunden hämtar `GET /orders/:id`, så är `status` `cancelled` (ändringen är sparad i databasen).
3. Givet att kund 3 har en beställning med status `new` som lades för 29 minuter sedan, när kunden avbryter den, så blir svaret 200.
4. Givet att kund 3 har en beställning med status `new` som lades för 31 minuter sedan, när kunden avbryter den, så blir svaret 409 med felkoden `conflict`, och statusen i databasen är fortfarande `new`.
5. Givet att kund 3 har en beställning som redan har status `cancelled`, när kunden avbryter den igen, så blir svaret 409 med felkoden `conflict`.
6. Givet att kund 3 har en beställning med status `paid` (eller `shipped`) som lades för mindre än 30 minuter sedan, när kunden avbryter den, så blir svaret 409 med felkoden `conflict`, och statusen är oförändrad.
7. Givet ett anrop utan headern `X-Customer-Id`, när `POST /orders/1043/cancel` anropas, så blir svaret 401 och beställningen är oförändrad.
8. Givet att kund 1 är inloggad, när kunden avbryter beställning 1043 som tillhör kund 3, så blir svaret 403 med felkoden `forbidden`, och statusen är oförändrad.
9. Givet att beställning 999999 inte finns, när en inloggad kund avbryter den, så blir svaret 404 med felkoden `not_found`.
10. Givet ett id som inte är ett positivt heltal (till exempel `abc`), när en inloggad kund anropar `POST /orders/abc/cancel`, så blir svaret 400 med felkoden `invalid_input`.
11. Givet att en annan kunds beställning har gått ut eller redan är avbruten, när kund 1 försöker avbryta den, så blir svaret 403 och inte 409 (ägarkontrollen görs före kontrollerna av status och tid).
12. Alla felsvar i kriterierna 4–11 har formen `{ "error": { "code", "message" } }`.

## API-kontrakt

`POST /orders/:id/cancel`

- Header: `X-Customer-Id` (krävs).
- Body: ingen. Ett kund-id i body eller query ignoreras.
- Kontrollerna körs i den här ordningen: 401 → 400 → 404 → 403 → 409.

| Status | Felkod | När |
|---|---|---|
| 200 | – | Beställningen tillhör kunden, har status `new` och lades för högst 30 minuter sedan. Svaret är `{ id, customerId, status: "cancelled", discountCode, lines: [{ product, quantity, unitPrice }] }`, samma form som `GET /orders/:id`. |
| 400 | `invalid_input` | `:id` är inte ett positivt heltal. |
| 401 | `unauthorized` | `X-Customer-Id` saknas eller är ogiltig. |
| 403 | `forbidden` | Beställningen tillhör en annan kund. |
| 404 | `not_found` | Beställningen finns inte. |
| 409 | `conflict` | Det har gått mer än 30 minuter sedan beställningen lades, eller statusen är inte `new` (redan avbruten, betald eller skickad). Meddelandet skiljer på de två fallen. |

Raden läggs till i `docs/api.md` efter `GET /orders/:id`.
