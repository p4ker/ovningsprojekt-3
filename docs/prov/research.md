# Research: POST /customers nekar ogiltiga e-postadresser

Story: POST /customers ska returnera 400 när email inte är en giltig e-postadress (i dag godtas vilken text som helst). Det här är generalprovet av riggen och inte en av kursens user stories.
Gren: funktion/prov

## Berörs

- `src/services/customerService.ts:15-17`: `createCustomer` kontrollerar bara att `email` är en sträng som inte är tom. Här saknas formatkontrollen.
- `src/services/customerService.ts:18-22`: INSERT i `customers`, med trimmade värden. Körs i dag även för `email: "abc"`.
- `src/routes/customers.ts:9-12`: routen skickar `req.body` till `createCustomer` och svarar med `sendResult(res, result, 201)`. Behöver inte ändras.
- `src/http.ts:4-9` och `src/result.ts:2`: felkoden `invalid_input` finns redan och blir 400. Ingen ny felkod behövs.
- `db/schema.sql:13`: kolumnen `email TEXT NOT NULL`, utan CHECK och utan UNIQUE.
- `docs/api.md:8`: raden för `POST /customers` säger inget om e-postformat och behöver uppdateras.

E-post används inte av `src/legacy/price_calc.py` eller `jobs/nightly_report.py`.

## Befintliga tester

`tests/customers.test.ts:10-30`, med supertest, `beforeEach(resetDb)` och `afterAll(closeDb)`:

- Lyckat fall (rad 11-18): 201 och rätt fält.
- 400 när `name` saknas (rad 20-24): kontrollerar statuskod och `error.code`.
- 400 när `email` saknas (rad 26-29): kontrollerar bara statuskoden.

Saknas: ogiltigt format på `email`, `email` som inte är en sträng, och att ingen kund sparas när anropet nekas.

## Regler som gäller

- Tjänstelagret returnerar `Result` och kastar inte för förväntade fel (`docs/standard.md:15`).
- Felsvar har formen `{ "error": { "code", "message" } }`, och ogiltig indata ger 400 (`docs/standard.md:16-17`).
- Varje endpoint har tester för lyckat fall och för felfallen (`docs/standard.md:33`).
- Inga personuppgifter i loggar (`docs/standard.md:30`). Den nekade adressen får därför inte loggas. Felmeddelandet ska inte heller upprepa adressen.
- SQL är parametriserad (`docs/standard.md:10`). Den befintliga frågan är det.

## Kräver schemaändring?

Nej. Kontrollen görs i tjänstelagret. Alla åtta adresser i `db/seed.sql:4-11` har formen `namn@example.com` och klarar en enkel formatkontroll.

## Oklart

1. Vilken regel gäller för en giltig adress? Förslaget nedan är en enkel regel: exakt ett `@`, något före, och en domän med minst en punkt, utan blanksteg. En striktare regel enligt RFC är mer kod och fler specialfall.
2. Ska dubbletter nekas? I dag finns ingen UNIQUE på `email`. Förslaget är att det ligger utanför den här ändringen.
3. Trasig JSON i body ger i dag Express standardsvar i HTML och inte `{ error }`, eftersom `src/app.ts` saknar felhanterare. Förslaget är att det ligger utanför den här ändringen, men det bryter mot regeln om felformat och är värt en egen ändring.

## Acceptanskriterier

Status: godkänd

1. Givet en body med `name` och en giltig `email` (till exempel `ida.strom@example.com`). När klienten anropar `POST /customers`. Så blir svaret 201 med kunden, precis som i dag.
2. Givet en `email` utan `@` (till exempel `inte-en-adress`). När klienten anropar `POST /customers`. Så blir svaret 400 med `error.code` lika med `invalid_input`.
3. Givet en `email` utan domän med punkt (till exempel `ida@example`) eller utan något före `@` (till exempel `@example.com`). När klienten anropar `POST /customers`. Så blir svaret 400 med `error.code` lika med `invalid_input`.
4. Givet en `email` med blanksteg inuti (till exempel `ida strom@example.com`). När klienten anropar `POST /customers`. Så blir svaret 400 med `error.code` lika med `invalid_input`.
5. Givet en giltig `email` med blanksteg före eller efter. När klienten anropar `POST /customers`. Så blir svaret 201, och adressen sparas utan blankstegen, precis som i dag.
6. Givet ett anrop som nekas på grund av `email`. När svaret har skickats. Så har ingen ny kund sparats, och felmeddelandet innehåller inte den adress som skickades in.

Felfallen 401, 403 och 404 är inte möjliga: endpointen kräver ingen inloggning och hämtar ingen resurs.

## API-kontrakt

`POST /customers`

- Indata: `{ "name": string, "email": string }`. `email` ska ha formen `något@domän.tld`, utan blanksteg.
- 201: `{ "id", "uuid", "name", "email" }`.
- 400: `{ "error": { "code": "invalid_input", "message": "email är inte en giltig e-postadress." } }` när formatet är fel. De befintliga 400-svaren för saknad `name` och `email` är oförändrade.
