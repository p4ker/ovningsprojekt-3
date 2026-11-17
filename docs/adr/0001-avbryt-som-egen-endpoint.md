# 0001: Avbrytande av en beställning är en egen endpoint, POST /orders/:id/cancel

Status: beslutad
Datum: 2026-11-17
Funktion: docs/avbryta-en-beställning/

## Kontext

Kunden ska kunna avbryta sin egen beställning inom 30 minuter (`docs/user-stories.md:6`). Research lämnade formen på endpointen öppen (research.md, Oklart, fråga 4). Valet är dyrt att ändra senare, eftersom klienter kommer att bero på sökväg, metod och felkoder.

Det som begränsar valet:
- `orders.status` är `TEXT` utan CHECK (`db/schema.sql:27`). Databasen hindrar alltså inte att andra värden skrivs.
- Avbrytandet har egna regler: bara status `new`, bara inom 30 minuter från `created_at`, och 409 med olika meddelanden för de två fallen (acceptanskriterierna 3–6).
- Det finns ingen allmän uppdatering av beställningar i API:t i dag. Statusarna `paid` och `shipped` ska inte kunna sättas av kunden.
- Kontrollen och uppdateringen måste ske i samma operation (`docs/standard.md:12`).

## Beslut

Avbrytande görs med `POST /orders/:id/cancel`, utan body. Svaret är 200 med beställningen i samma form som `GET /orders/:id`. Felkoder och ordning: 401 → 400 → 404 → 403 → 409, enligt kontraktet i research.md.

Tjänstelagret får en funktion `cancelOrder(orderId, customerId)`. Den gör kontrollen av ägare, status och tid i en enda `UPDATE ... WHERE` (id, customer_id, `status = 'new'` och `created_at >= now() - interval '30 minutes'`). Bara en av två samtidiga anrop kan lyckas. Ingen `PATCH /orders/:id` skapas.

## Alternativ som valdes bort

- **`PATCH /orders/:id` med `{ "status": "cancelled" }`:** kräver att routen tar emot ett fritt statusfält och själv avgör vilka övergångar som är tillåtna. Det öppnar för att kunden försöker sätta `paid` eller `shipped`, och för en allmän uppdateringsendpoint som ingen har bett om. Reglerna för avbrytande (30 minuter, bara `new`) blir svårare att läsa av sökvägen och dokumentera i `docs/api.md`. Fördelen, att det följer REST-konventionen om resursuppdatering, väger lätt i ett API där åtgärden har egna regler.
- **`DELETE /orders/:id`:** avbrutna beställningar ska finnas kvar med status `cancelled` (seed har redan en, `db/seed.sql`). DELETE antyder att raden tas bort.

## Konsekvenser

- + Sökvägen säger vad som händer, och reglerna kan dokumenteras och testas för sig.
- + Ingen yta för att kunden sätter godtyckliga statusar.
- + Ingen schemaändring och ingen ny felkod behövs (`conflict` finns i `src/http.ts`).
- − Åtgärden är inte idempotent: ett andra anrop ger 409, inte 200 (kriterium 5).
- − Om fler statusövergångar kommer senare (till exempel retur) blir det fler åtgärdsendpoints, eller så måste beslutet omprövas med en ny ADR.
