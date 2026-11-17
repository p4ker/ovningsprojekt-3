# API

Alla anrop utom `POST /customers` och `/health` kräver headern `X-Customer-Id` med den inloggade kundens id. Det är en förenklad inloggning för övningen.

| Metod och sökväg | Beskrivning | Svar |
|---|---|---|
| `GET /health` | Kontroll att API:t kör. | 200 |
| `POST /customers` | Registrera en kund. Body: `{ name, email }`. `email` ska ha formen `namn@domän.tld`, utan blanksteg inuti. Blanksteg före och efter tas bort. Saknas `name` eller `email`, eller har `email` fel form, blir svaret 400 med felkoden `invalid_input`. | 201, 400 |
| `GET /customers/me` | Den inloggade kunden. | 200, 401, 404 |
| `GET /customers/me/orders` | Den inloggade kundens beställningar, nyast först. | 200, 401 |
| `POST /orders` | Lägg en beställning. Body: `{ lines: [{ product, quantity, unitPrice }], discountCode? }`. | 201, 400, 401 |
| `GET /orders/:id` | En egen beställning med rader. | 200, 400, 401, 403, 404 |
| `POST /orders/:id/cancel` | Avbryt en egen beställning. Ingen body. Det går bara om beställningen har status `new` och lades för högst 30 minuter sedan. Svaret är beställningen med `status: "cancelled"`, i samma form som `GET /orders/:id`. 409 med felkoden `conflict` om 30 minuter har gått eller om statusen inte är `new` (redan avbruten, betald eller skickad); meddelandet säger vilket. En annan kunds beställning ger alltid 403, även när den annars hade gett 409. Se ADR 0001. | 200, 400, 401, 403, 404, 409 |
| `GET /orders/:id/price` | Pris för en egen beställning: `{ net, vat, total }`. Räknas av den äldre modulen. | 200, 400, 401, 403, 404 |

## Den äldre modulen

`src/legacy/price_calc.py` räknar pris, rabatt och moms för en beställning. Den är skriven i Python, saknar tester och dokumentation och anropas från två ställen: API:t (via `src/pricing/legacyPrice.ts`) och den nattliga rapporten `jobs/nightly_report.py`.

Den går att köra direkt:

```bash
python3 src/legacy/price_calc.py 1042
```
