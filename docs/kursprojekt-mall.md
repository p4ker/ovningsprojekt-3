# Kursprojekt: En rigg för en kodbas

Dokumentation enligt mallen i kursprojektet (AI-assisterad systemutveckling). Lämnas in som PDF.

För godkänt: fyll i svaret och visa var i repot det finns (fil, commit eller sessionslogg). För väl godkänt: skriv också vilket alternativ du valde bort och varför, och stöd valet med en siffra (tokens, tid, kronor eller antal fel som en kontroll fångade).

Läget 2026-11-17: avsnitten om riggen är ifyllda utifrån bygget, generalprovet och den nya funktionen (user story 2, "Avbryta en beställning", sammanslagen i pull request #1). Avsnitt märkta "Inte ifyllt än" väntar på granskningen av det utdelade pull requestet, moderniseringen eller egna bedömningar.

Commit-hasharna för den nya funktionen är de som finns på `main`. Pull requestet slogs ihop med rebase, så grenen `funktion/avbryta-en-beställning` har samma ändringar med andra hashar. Sessionsloggen `sessions/2026-11-17-2.md` använder grenens hashar.

| Namn | Kodbas | Repo och tagg |
|---|---|---|
| _Inte ifyllt än_ | Delkursens övningsprojekt: butikens API | `ovningsprojekt-3`. Taggen `inlamning` sätts när allt är klart. |

## Kodbas, krav och beslut

### Vilken kodbas, och varför

_Inte ifyllt än: egen motivering._

Fakta att utgå från: övningsprojektet har ett REST-API i TypeScript med tester och en äldre, odokumenterad prisberäkning i Python (`src/legacy/price_calc.py`) som också används av `jobs/nightly_report.py`.

_Var i repot:_ `README.md`, `CLAUDE.md` (avsnittet Arkitektur).

### User story och acceptanskriterier (Givet / När / Så)

Story 2 i `docs/user-stories.md`: *Som kund vill jag kunna avbryta en beställning inom 30 minuter efter att jag lagt den.*

`/research` föreslog 12 kriterier och åtta frågor. Människan besvarade frågorna och godkände kriterierna. Svaren avgränsade storyn: bara status `new` får avbrytas, gränsen är högst 30 minuter från `created_at`, och ett andra avbrytande ger 409. Ett urval av kriterierna:

1. Givet att kund 3 har lagt en beställning med status `new` för mindre än 30 minuter sedan, när kunden anropar `POST /orders/:id/cancel`, så blir svaret 200 med beställningen i samma form som `GET /orders/:id` och `status: "cancelled"`.
3. Givet en beställning med status `new` som lades för 29 minuter sedan, när kunden avbryter den, så blir svaret 200.
4. Givet en beställning med status `new` som lades för 31 minuter sedan, när kunden avbryter den, så blir svaret 409 med felkoden `conflict`, och statusen är fortfarande `new`.
6. Givet en beställning med status `paid` eller `shipped`, när kunden avbryter den, så blir svaret 409 och statusen är oförändrad.
11. Givet att en annan kunds beställning har gått ut eller redan är avbruten, när kund 1 försöker avbryta den, så blir svaret 403 och inte 409.

Övriga kriterier täcker att ändringen sparas (2), redan avbruten (5), 401 (7), 403 (8), 404 (9), 400 (10) och felformen (12).

_Var i repot:_ `docs/avbryta-en-beställning/research.md` (avsnitten Oklart och Acceptanskriterier, `Status: godkänd`), commit `c30e060`.

### API-kontraktet för funktionen: endpoint, statuskoder, fel

`POST /orders/:id/cancel`, med headern `X-Customer-Id` och ingen body. Svaret är beställningen med `status: "cancelled"`, i samma form som `GET /orders/:id`. Kontrollerna görs i ordningen 401 → 400 → 404 → 403 → 409.

| Status | Felkod | När |
|---|---|---|
| 200 | – | Egen beställning, status `new`, högst 30 minuter gammal |
| 400 | `invalid_input` | `:id` är inte ett positivt heltal |
| 401 | `unauthorized` | `X-Customer-Id` saknas eller är ogiltig |
| 403 | `forbidden` | Beställningen tillhör en annan kund, även när den annars hade gett 409 |
| 404 | `not_found` | Beställningen finns inte |
| 409 | `conflict` | Mer än 30 minuter har gått, eller statusen är inte `new`. Meddelandet skiljer på fallen. |

_Var i repot:_ `docs/avbryta-en-beställning/research.md` (API-kontrakt), `docs/api.md:13` (commit `ddd3786`).

### ADR: beslutet

ADR 0001: avbrytandet är en egen endpoint, `POST /orders/:id/cancel`, utan body. Tjänstelagret kontrollerar ägare, status och tid i en enda villkorad `UPDATE`, så att två samtidiga anrop inte båda kan lyckas.

_Var i repot:_ `docs/adr/0001-avbryt-som-egen-endpoint.md` (`Status: beslutad`), commit `6332053`.

### Alternativ du valde bort, och varför

- **`PATCH /orders/:id` med `{ "status": "cancelled" }`:** routen hade behövt ta emot ett fritt statusfält och själv avgöra vilka övergångar som är tillåtna. Det öppnar för att kunden försöker sätta `paid` eller `shipped`, och för en allmän uppdateringsendpoint som ingen har bett om.
- **`DELETE /orders/:id`:** en avbruten beställning ska finnas kvar med status `cancelled`, och DELETE antyder att raden tas bort.
- **Läs först, kontrollera, skriv sedan:** valdes bort till förmån för en villkorad `UPDATE`. Testet `tests/orders.test.ts:279` skickar två samtidiga anrop. Mot en tillfällig variant som läser, kontrollerar och sedan skriver blev det rött i 5 av 5 körningar (båda anropen fick 200). Mot den villkorade `UPDATE`:n är det grönt.
- **En kolumn `cancelled_at`:** valdes bort i research (fråga 6). Den hade krävt en migrering, och storyn behöver den inte.

_Var i repot:_ ADR 0001 (Alternativ som valdes bort), `docs/avbryta-en-beställning/plan.md` (steg 4).

### Antaganden: vad du utgår från om kodbasen och dess användare

Antaganden som arbetet med den nya funktionen byggde på:

- 30 minuter räknas från `orders.created_at`, eftersom det är den enda tidsstämpeln. Tiden kommer från databasens `now()` och inte från Node, så det finns bara en klocka.
- Ingen kod i repot sätter `paid` eller `shipped`. Det antas att inget system utanför repot ändrar status medan en beställning avbryts.
- Nattrapporten (`jobs/nightly_report.py:8`) räknar bara `paid`. Eftersom bara `new` kan avbrytas påverkas den inte.
- Den äldre prisberäkningen läser inte status, så `GET /orders/:id/price` svarar fortfarande för avbrutna beställningar. Människan godkände det.

_Var i repot:_ `docs/avbryta-en-beställning/research.md` (Berörs, Oklart), `docs/avbryta-en-beställning/plan.md` (Utanför planen).

_Inte ifyllt än: egen bedömning av kodbasens användare._

## Riggens delar

En rad per skill, subagent och hook: vad den gör, varför den finns, vad som gick fel utan den, och hur man ser att den fungerar.

Där det står "inget observerat" har delen inte hunnit fånga något riktigt fel än. Bevisen kommer från generalprovet (`docs/prov/`) och den nya funktionen (`docs/avbryta-en-beställning/`).

### Skills och kommandon

| Skill | Vad den gör | Varför den finns | Vad som gick fel utan den | Hur man ser att den fungerar |
|---|---|---|---|---|
| `/research <mapp> <story>` | Skapar grenen `funktion/<mapp>`, låter `utforskare` kartlägga vad ändringen berör och skriver `research.md` med förslag på acceptanskriterier och API-kontrakt. | Kartläggningen ska se likadan ut varje gång och inte ligga som en prompt i chatten. Kriterierna blir facit för plan och verifiering. | Inget observerat. Skälet är kursens regel att allt som styr agenten ligger i repot. | `docs/prov/research.md` har alla rubriker, fynd med fil och rad och raden `Status: godkänd` (commit `e640112`). Den nya funktionen: `docs/avbryta-en-beställning/research.md` med 12 kriterier och åtta frågor som människan besvarade innan godkännandet (commit `c30e060`). |
| `/tdd <mapp> <steg>` | Gör ett steg ur `plan.md`: `testskrivare` skriver ett rött test, huvudagenten gör minsta möjliga ändring, kör alla tester och stannar före commit. Stannar efter tre försök utan grönt. | Test först ska vara ett kommando och inte ett löfte. Stoppet före commit ger människan en granskningspunkt per steg. | I generalprovet committades steg 3 utan att stanna, trots regeln. Instruktionen skärptes i `fa5297d`. | Steg 1 gav tre röda tester (201 i stället för 400) och sedan 19 av 19 gröna (`4973388`). Steg 2 gav ett rött test och sedan 22 av 22 (`cd6f2a4`). Den nya funktionen: fem steg, och `/tdd` stannade före varje commit och fick ett eget ja. Röda tester före koden: 3 (steg 1, `c8c268e`), 6 (steg 2, `72410a2`) och 3 (steg 3, `c6a9795`). Testsviten gick från 22 till 40 gröna. |
| `/granska <mapp> [gren]` | Sparar diffen mot `main`, låter `granskare` gå igenom den och skriver `granskning.md` med fynd under säkerhet, struktur och kodstandard. Anger för varje fynd vilken kontroll som hade stoppat det. | Koden ska läsas av någon som inte var med när den skrevs. Samma skill används på det utdelade pull requestet. | Inget observerat. Granskaren hittade två noteringar som ingen automatisk kontroll hade fångat. I den nya funktionen hittade den fyra noteringar, varav en ingen kontroll fångar: `parseId` godtar id större än `int4`. | `docs/prov/granskning.md` (commit `12cac31`), `docs/avbryta-en-beställning/granskning.md` (commit `92346d5`). |
| `/verifiera <mapp>` | Kör alla kontroller, gör ett `curl`-anrop per kriterium mot den körande servern och skriver `verifiering.md` med test och anrop som bevis. Rättar ingenting. | Kod kan följa standarden och ändå inte uppfylla kravet. Verifieringen kopplar koden tillbaka till kriterierna. | Inget observerat. | `docs/prov/verifiering.md`: sex kriterier, alla med test och anrop (commit `12cac31`). `docs/avbryta-en-beställning/verifiering.md`: 12 kriterier, alla med test och `curl` mot `npm start`. Ett extra anrop visade att ett kund-id i body ignoreras (commit `92346d5`). |
| `/sessionslogg` | Skriver passets logg i `sessions/` med läge, bevis, misslyckanden, återstående arbete, beslut, fångster och mätning. | Nästa pass börjar med tom kontext. Loggen är minnet, och den är underlaget när arbetet bedöms. | Vid projektets start visste agenten ingenting om tidigare arbete: minnet var tomt och det fanns ingen `CLAUDE.md`. | `sessions/2026-11-17-1.md` (commit `25cd9c3`). Nästa session läste in den vid start. `sessions/2026-11-17-2.md` (commit `9df8908`): hookens faktadel stämmer med sammanfattningen, med samma åtta commits och 40 passed. |

_Var i repot:_ `.claude/skills/*/SKILL.md`, commits `74fca4e` och `e9bdc88`.

### Subagenter: namn, uppgift, verktyg, modell

| Namn | Uppgift | Verktyg | Modell | Varför den finns | Vad som gick fel utan den | Hur man ser att den fungerar |
|---|---|---|---|---|---|---|
| `utforskare` | Hittar var saker finns och sammanfattar med fil och rad. Ändrar inget. | Read, Grep, Glob | haiku | Research läser många filer. Den ska inte fylla huvudagentens kontext och behöver inte den dyra modellen. | Inget observerat. | Hittade ägarkontrollen i `src/services/orderService.ts:64-76` med rätt radnummer: 13 s, 11 709 tokens. Researchen för provändringen: 32 s, 23 866 tokens. Researchen för den nya funktionen: 68 s, 44 027 tokens, 30 verktygsanrop. Den hittade bland annat att nattrapporten filtrerar på `paid`. |
| `planerare` | Skriver `plan.md` i numrerade steg utifrån godkända kriterier, och ADR-utkast när ett beslut har ett verkligt alternativ. | Read, Grep, Glob, Write | sonnet | Planen ska bygga på filerna och inte på samtalet. Den vägrar planera om kriterierna bara är förslag. | Inget observerat. | `docs/prov/plan.md` med tre steg. Den kontrollerade statusraden först: 22 s, 14 565 tokens. Den nya funktionen: `plan.md` med fem steg och sin första ADR, 0001: 52 s, 25 762 tokens. |
| `testskrivare` | Skriver ett rött test per kriterium med Jest eller pytest. Skriver ingen produktionskod. | Read, Grep, Glob, Edit, Write, Bash | sonnet | Den som skriver testet ska inte vara den som skriver koden. Då formas testet av kravet och inte av lösningen. | I steg 2 läste den inte `research.md`, utan byggde på planen och uppdraget. Instruktionen skärptes i `fa5297d`. | Testerna i `tests/customers.test.ts:38-66` var röda av rätt anledning innan koden skrevs: 25 s och 15 s, 16 512 och 14 043 tokens. I den nya funktionen läste den kriterierna i `research.md` i alla fyra stegen, så skärpningen i `fa5297d` höll. Fyra körningar på 20–28 s och 23 853–28 997 tokens. |
| `granskare` | Granskar en diff mot plan, kodstandard och beslutade ADR:er. Rapporterar under säkerhet, struktur och kodstandard. Skriver inga filer. | Read, Grep, Glob | sonnet | Granskningen görs i en ny kontext som inte har sett bygget. Bara läsverktyg, så att den inte kan rätta det den hittar. | Inget observerat. | Granskningen av `funktion/prov`: inga fynd som måste åtgärdas, två noteringar: 22 s, 24 560 tokens. Granskningen av den nya funktionen: fyra noteringar: 27 s, 42 820 tokens. Den angav radnummer i testfilen som rader i diffen, så de fick översättas för hand. |

_Var i repot:_ `.claude/agents/*.md`, commit `8007c49`. Siffrorna från generalprovet står i `sessions/2026-11-17-1.md` under Mätning. Siffrorna för den nya funktionen kommer från verktygets egen rapport efter varje körning och står inte i loggen.

### Hooks: händelse, vad som körs, vad som stoppas

| Hook | Händelse | Vad som körs | Vad som stoppas | Varför den finns | Vad som gick fel utan den | Hur man ser att den fungerar |
|---|---|---|---|---|---|---|
| `las-logg` | SessionStart | Skriver den senaste sessionsloggen till agentens kontext. Sparar passets starttid vid `startup`. Gör ingenting vid `/clear`. | Ingenting. Påminner om logg som saknar sammanfattning eller inte är committad. | Minneskedjans läsdel: agenten ska veta läget utan att någon berättar det. | När sessionen återupptogs bytte den passets starttid, så `skriv-logg` hittade inte loggen och skapade en ny utan sammanfattning. Rättat i `4dbe823`. | Vid nästa `resume` behöll den starttiden och läste in loggen (`.claude/.sessionstarter.log`). Sex provfall med stdin-JSON. Pass 2 började med loggen från pass 1 i kontexten, och det var sista kontrollen i generalprovet. |
| `skriv-logg` | SessionEnd och PreCompact | Lägger till avsnittet Fakta i passets logg: branch, commits, ändringar som inte är committade, testresultat och antal stopp från hooks. | Ingenting. Skapar en logg med markeringen "Ingen sammanfattning skrevs" om loggen glömdes. | Minneskedjans skrivdel. Fakta kommer från kommandon och går att jämföra med det agenten skrev. | Utan tidsgränsen på 60 sekunder får SessionEnd bara 1,5 sekunder, och testerna hinner inte köras. | Faktadelen i `sessions/2026-11-17-1.md` har 22 passed. Nio provfall, bland annat `/clear`, glömd logg och två pass samma dag. I `sessions/2026-11-17-2.md` hittade den rätt fil via raden `Pass:` och skrev 40 passed och 2 stopp. |
| `kontrollera-kodstandard` | PostToolUse (Edit, Write) | Prettier och ESLint på filen som ändrades, och `tsc` för filer under `src/` och `scripts/`. | Stoppar inte ändringen, som redan är gjord. Avslutar med kod 2 så att agenten får felen och rättar själv. | Format, lint och typer ska kontrolleras vid varje ändring och inte först i granskningen. | Inget observerat. Under bygget av den nya funktionen stoppade den två gånger `@typescript-eslint/no-unused-vars`, i `tests/orders.test.ts` och `src/routes/orders.ts`. Båda var falsklarm: en import lades till i en ändring och användes först i nästa. | Sju provfall. Raden i `sessions/fangster.log` från 2026-11-17 00:25, och de två raderna från 22:18. |
| `skydda-tester` | PreToolUse (Edit, Write, Bash) | Jämför antalet tester före och efter ändringen, och letar efter `skip`, `only`, `xit` och `pytest.mark.skip`. | Borttagna, flyttade eller avstängda tester, skrivning i testfiler från terminalen och ändrat testurval i `jest.config.js` och `pytest.ini`. | Kursens regel: agenten får föreslå ändringar i tester men aldrig ta bort eller stänga av dem. | Först räknades ett `it.each` som ett test, så en borttagen rad i tabellen märktes inte. Rättat i `a842291`. | 39 av 39 provfall. Ett riktigt `rm` på en testfil stoppades (`sessions/fangster.log`, 00:28). |
| `skydda-hemligheter` | PreToolUse (Edit, Write) | Letar efter nycklar i kända format, hemligheter som står direkt i koden och URL:er med inloggningsuppgifter till andra värdar. | Skrivning till `.env` och nya hemligheter i koden. | Hemligheter ska läsas från miljövariabler (`docs/standard.md`). | Den gav ett falsklarm på sessionsloggen, som citerade ett provexempel. Dokumentation undantas nu från regeln om tilldelningar (`94dd207`). | 27 av 27 provfall. En riktig skrivning med en nyckel i koden stoppades (00:32). Loggen innehåller aldrig själva hemligheten. |

_Var i repot:_ `.claude/hooks/*.mjs`, registrerade i `.claude/settings.json`. Commits `74fca4e`, `c45b3a2`, `1ddca4d` och `2632238`.

### Delar du övervägde men valde bort, och varför

- **En separat säkerhetsgranskare på opus.** Säkerhet är en egen rubrik i `granskare`, med en checklista ur kodstandarden. En agent till hade kostat mer utan att fånga något annat.
- **En Stop-hook som tvingar fram sessionsloggen.** Stop körs efter varje svar och inte när sessionen slutar. Den hade krävt en logg vid varje svar och riskerat en oändlig slinga. I stället påminner `las-logg` i början av nästa pass.
- **En egen `krav.md`.** Acceptanskriterierna ligger i `research.md` med en statusrad, så det blir en fil färre per arbete.
- **En separat byggare-agent.** Huvudagenten bygger med `/tdd`.
- **Lint för Python.** Kravet på lint, format och typer är uppfyllt för TypeScript. Python-delen skyddas av karakteriseringstester i moderniseringen.
- **`tsc` på testfiler i hooken.** Ett rött test får anropa något som inte finns än. Typfel i tester fångas av `npm test` och `npm run check`.

_Var i repot:_ `docs/rigg-plan.md` och `sessions/2026-11-17-1.md` (avsnittet Beslut).

## Behörigheter och sandlåda

| Regler | Motivering |
|---|---|
| **Allow:** `npm test`, `npm run test:legacy`, `npx jest`, `npm run lint`, `npm run typecheck`, `npm run format`, `npm run check`, `npm start`, `curl http://localhost:3000/*`, `git status`, `git diff`, `git log` | Det agenten gör många gånger per steg och som bara läser eller kontrollerar. Curl är begränsat till den lokala servern, eftersom verifieringen behöver det. |
| **Ask:** `git commit`, `git add`, `git switch`, `npm run db:reset`, `npm install`, `pip install` | Det som ändrar historiken, databasen eller beroendena. Människan godkänner varje commit, och det är granskningspunkten i `/tdd`. |
| **Deny:** läsa och ändra `.env`, `git push`, `rm -rf`, `git reset --hard` | Det som aldrig ska hända i en session: hemligheter i kontexten, publicering och förstörelse som inte går att ångra. |

_Var i repot:_ `.claude/settings.json`, commit `6a0f308`. Deny provades: läsning av `.env` nekades. I den nya funktionen nekades `git push` när agenten skulle skapa pull requestet. Människan pushade själv, och sedan skapade agenten pull request #1 med `gh pr create`.

### Var agenten körs (din dator, sandlåda, container) och varför

Agenten körs på den egna datorn, i Claude Codes skrivbordsapp och i terminalen, utan sandlåda. Databasen körs i Docker på port 5434.

_Inte ifyllt än: egen motivering till varför, och om `/sandbox` ska användas._

_Var i repot:_ `docker-compose.yml`, `.claude/settings.json`.

## Arbetsslingan och kontexten

### Stegen från krav till commit

1. `/research <mapp> <story>` skapar grenen och skriver `research.md` med förslag på acceptanskriterier.
2. Människan rättar kriterierna och ändrar raden till `Status: godkänd`.
3. `planerare` skriver `plan.md`, och ett ADR-utkast om det finns ett beslut med ett verkligt alternativ. Människan godkänner planen och sätter `Status: beslutad` i ADR:en.
4. `/tdd <mapp> <steg>`, en gång per steg: rött test, minsta möjliga ändring, alla tester gröna, stopp. Människan godkänner committen.
5. `/granska <mapp>` skriver `granskning.md`. Människan väljer vilka fynd som åtgärdas, och de blir nya steg med `/tdd`.
6. `/verifiera <mapp>` skriver `verifiering.md` med bevis per kriterium.
7. `/sessionslogg`, och sedan avslutas sessionen. Loggen committas.

_Var i repot:_ `CLAUDE.md` (avsnittet Arbetsflöde). Hela kedjan är körd två gånger: i generalprovet `docs/prov/` (commits `e640112` till `12cac31`) och för den nya funktionen i `docs/avbryta-en-beställning/` (commits `c30e060` till `9df8908`, sammanslagen i pull request #1).

### Hur kontexten hanteras: plan i fil, rensa, komprimera, sessionslogg

- **Plan i fil:** varje fas lämnar en fil i `docs/<mapp>/`, och nästa fas läser den. Ingen fas behöver minnas samtalet.
- **Rensa:** `/clear` körs mellan faserna. Hooksen reagerar inte på `/clear`, så passet delas inte.
- **Komprimera:** före en komprimering skriver `skriv-logg` läget till loggen (PreCompact), och efteråt läser `las-logg` in loggen igen.
- **Sessionslogg:** `/sessionslogg` skriver sammanfattningen och `skriv-logg` lägger till fakta. `las-logg` läser in loggen i nästa pass.
- **Subagenter:** research, tester och granskning görs i egna kontexter. Bara rapporten kommer tillbaka till huvudagenten.

_Var i repot:_ `.claude/hooks/las-logg.mjs`, `.claude/hooks/skriv-logg.mjs`, `sessions/2026-11-17-1.md`.

### En commit som exempel: hash, och vad som går att spåra från den

`c6a9795` Avbryt ger 403 för annans beställning före 409 (plan steg 3, ADR 0001)

Från commit-meddelandet går det att följa kedjan bakåt och framåt:

- **Planen:** steg 3 i `docs/avbryta-en-beställning/plan.md`, med raden `Status: klart` och en anteckning om vilka tester som var gröna direkt.
- **Beslutet:** ADR 0001, där kontrollen sker i en villkorad `UPDATE` och felordningen är 401 → 400 → 404 → 403 → 409.
- **Kravet:** kriterierna 7–12 i `docs/avbryta-en-beställning/research.md`, med `Status: godkänd`.
- **Testerna:** `tests/orders.test.ts:218-277`, som lades till i samma commit. Testerna för 403 på rad 228, 252 och 266 var röda (409) före koden. Testerna för 401, 400 och 404 var gröna direkt.
- **Koden:** `cancelFailure` i `src/services/orderService.ts`, som läser `customer_id` och svarar 403 innan status och tid kontrolleras.
- **Granskningen:** `docs/avbryta-en-beställning/granskning.md`. Inga fynd i ändringen, och 403-testet med öppet fönster nämns som en bekräftelse.
- **Verifieringen:** `docs/avbryta-en-beställning/verifiering.md`, kriterierna 8 och 11 med `curl`: 403 `forbidden`, och statusen är oförändrad.

## Orkestrering och modellval

### Faserna och filen varje fas lämnar

| Fas | Körs med | Fil som lämnas |
|---|---|---|
| Research | `/research`, som använder `utforskare` | `docs/<mapp>/research.md` |
| Plan | `planerare` | `docs/<mapp>/plan.md` och `docs/adr/NNNN-*.md` |
| Bygg | `/tdd`, som använder `testskrivare` | test, kod och `Status: klart` i planen, en commit per steg |
| Granska | `/granska`, som använder `granskare` | `docs/<mapp>/granskning.md` |
| Verifiera | `/verifiera` | `docs/<mapp>/verifiering.md` |
| Avsluta | `/sessionslogg` och hooken `skriv-logg` | `sessions/ÅÅÅÅ-MM-DD-n.md` |

_Var i repot:_ `CLAUDE.md` (avsnittet Arbetsflöde), `docs/prov/`.

### Modell per subagent, och varför

| Subagent | Modell | Varför |
|---|---|---|
| `utforskare` | haiku | Läser mycket och svarar kort. Uppgiften är att hitta och sammanfatta. |
| `planerare` | sonnet | Ska väga kriterier mot kod och dela upp arbetet i steg. |
| `testskrivare` | sonnet | Skriver kod efter ett givet kriterium, i samma stil som befintliga tester. |
| `granskare` | sonnet | Ska bedöma kod mot regler. |

Huvudagenten kör den modell som är vald i sessionen.

_Var i repot:_ fältet `model` i `.claude/agents/*.md`.

### Kostnad med ditt val och med en större modell

Mätt hittills, per körning i generalprovet: `utforskare` 11 709 och 23 866 tokens, `planerare` 14 565, `testskrivare` 16 512 och 14 043, `granskare` 24 560.

Per körning i den nya funktionen:

| Subagent | Modell | Uppgift | Tid | Tokens | Verktygsanrop |
|---|---|---|---|---|---|
| utforskare | haiku | research | 68 s | 44 027 | 30 |
| planerare | sonnet | plan och ADR 0001 | 52 s | 25 762 | 10 |
| testskrivare | sonnet | steg 1 | 25 s | 26 611 | 9 |
| testskrivare | sonnet | steg 2 | 23 s | 26 095 | 6 |
| testskrivare | sonnet | steg 3 | 28 s | 28 997 | 7 |
| testskrivare | sonnet | steg 4 | 20 s | 23 853 | 5 |
| granskare | sonnet | granskning | 27 s | 42 820 | 8 |

Totalt 218 165 tokens i subagenterna.

_Inte ifyllt än: kostnaden i kronor, och en jämförelse med en större modell. Ingen sådan körning är gjord._

_Var i repot:_ `sessions/2026-11-17-1.md` (avsnittet Mätning).

### Loop: vad görs om

- **I `/tdd`:** slingan test, kod, kör tester görs om tills steget är grönt.
- **Efter granskningen:** fynd som människan väljer att åtgärda blir nya steg med `/tdd`, och sedan körs `/granska` igen.
- **Efter verifieringen:** ett kriterium som inte är uppfyllt eller saknar test blir ett nytt steg med `/tdd`, och sedan körs `/verifiera` igen.

_Var i repot:_ `.claude/skills/tdd/SKILL.md`, `.claude/skills/granska/SKILL.md`, `.claude/skills/verifiera/SKILL.md`.

### Stoppvillkor (varv, kronor eller minuter)

- **Varv:** `/tdd` stannar efter tre försök utan grönt och rapporterar vad som provades.
- **Ett steg i taget:** `/tdd` gör ett steg och stannar före commit.
- **Statusrader:** `planerare` vägrar planera om kriterierna är förslag, och `/tdd` avbryter om en ADR bara är föreslagen.

I generalprovet blev båda stegen gröna på första försöket, och i den nya funktionen alla fem. Stoppvillkoret för varv har alltså inte lösts ut. Statusraderna kontrollerades före varje steg: `/tdd` läste `Status: godkänd` och `Status: beslutad` innan något ändrades.

_Inte ifyllt än: ett stoppvillkor i kronor eller minuter finns inte._

_Var i repot:_ `.claude/skills/tdd/SKILL.md` (avsnittet Stoppvillkor).

### Vad du körde parallellt i worktrees, och varför (eller varför inte)

Hittills ingenting. Riggen byggdes steg för steg i en session, och varje steg byggde på det förra. Den nya funktionens fem steg ändrade alla `tests/orders.test.ts`, och steg 1–3 ändrade dessutom `src/services/orderService.ts`. Varje steg byggde på det förra, så inget kunde köras parallellt.

_Inte ifyllt än: egen motivering, och om något av de tre arbetena körs parallellt._

## Styrd kodgenerering

### Kodstandarden i verktyg: regler som säger nej, och deras felmeddelanden

| Regel | Verktyg | Felmeddelande |
|---|---|---|
| SQL får inte byggas med strängmall eller sammanslagning i `query(...)` | ESLint, `no-restricted-syntax` | "SQL får inte byggas med strängmallar eller sammanslagning. Använd db.query(sql, [värden]) med $1, $2 (docs/standard.md: Databas)." |
| Tester får inte ha `skip` eller `only` | ESLint, `no-restricted-properties` | "Tester får inte hoppas över eller köras ensamma. Rätta koden eller testet (docs/standard.md: Tester)." |
| Formatering | Prettier, i hooken `kontrollera-kodstandard` | Filen formateras om automatiskt. |
| Typer | `tsc --noEmit`, i hooken och i `npm run check` | Kompilatorns fel, till exempel `TS2322`, tillsammans med raden "Filen är redan ändrad, så rätta felen nedan." |
| Tester får inte tas bort eller stängas av | Hooken `skydda-tester` | "Tester får ändras men inte tas bort eller stängas av. Rätta koden, eller föreslå ändringen av testet för användaren." |
| Inga hemligheter i koden | Hooken `skydda-hemligheter` | "Läs värdet från en miljövariabel (process.env.NAMN eller os.environ) och lägg det i .env, som inte committas." |

En känd begränsning: SQL-regeln ser bara det som står direkt i anropet. En fråga som först byggs i en variabel upptäcks inte, och den får granskaren fånga.

_Var i repot:_ `eslint.config.js` (commit `0732458`), `.claude/hooks/`, skriptet `check` i `package.json`.

### Granskningslagren: vad varje lager fångar

| Lager | Vad det fångar |
|---|---|
| 1. Hooks före ändringen (`skydda-tester`, `skydda-hemligheter`) | Det som aldrig får hända: borttagna tester och hemligheter. Ändringen görs aldrig. |
| 2. Hook efter ändringen (`kontrollera-kodstandard`) | Format, lint och typer, direkt efter varje ändring. |
| 3. Tester (`npm test`, `npm run test:legacy`) | Beteende som har gått sönder. |
| 4. Subagenten `granskare` | Det som kräver läsning: struktur, säkerhet i sammanhang, avvikelser från plan och ADR, svaga tester. |
| 5. `/verifiera` | Att funktionen gör det kriterierna säger, mot den körande servern. |
| 6. Människan | Kriterierna, planen, varje commit och valet av åtgärder efter granskningen. |

_Var i repot:_ `.claude/settings.json`, `.claude/agents/granskare.md`, `docs/prov/granskning.md`, `docs/prov/verifiering.md`.

### Var sitter människan i granskningen, och varför just där

Människan har fyra fasta punkter i flödet:

- **Kriterierna:** ändrar `Status: förslag` till `Status: godkänd` i `research.md`.
- **Planen och ADR:en:** godkänner planen och sätter `Status: beslutad`.
- **Varje commit:** `git commit` ligger under ask, och `/tdd` stannar före commit.
- **Åtgärderna:** väljer vilka fynd i `granskning.md` som ska åtgärdas.

Så användes punkterna i den nya funktionen:

- Människan besvarade research-frågorna och bestämde sig för att godkänna kriterierna.
- Människan godkände ADR 0001.
- Människan sa ja till var och en av de fem commitsen i bygget.
- Människan valde att inte åtgärda något av granskningens fyra noteringar.

Statusraderna i `research.md` och ADR:en ändrades av agenten, men bara på människans uttryckliga begäran i chatten.

_Inte ifyllt än: egen motivering till varför just där._

_Var i repot:_ `CLAUDE.md` (tabellen i Arbetsflöde, kolumnen Människan).

## Granskning av agentgenererad kod

Det utdelade pull requestet. För varje brist: rad, vad bristen är, varför den är en brist, och vilken kontroll eller hook som hade stoppat den.

_Inte ifyllt än: pull requestet är inte utdelat. Körs med `/granska <mapp> <gren>`, som skriver raden "Kontroll som hade stoppat den" för varje fynd._

| Typ | Rad | Vad bristen är | Varför den är en brist | Kontroll eller hook som hade stoppat den |
|---|---|---|---|---|
| Säkerhet |  |  |  |  |
| Struktur |  |  |  |  |
| Kodstandard |  |  |  |  |

### Vad automatiken hittade, och vad bara du hittade

_Inte ifyllt än._

## Modernisering

_Inte ifyllt än: arbetet är inte påbörjat._

Två iakttagelser från bygget av riggen som hör hit:

- `GET /orders/1042/price` svarar `{"net":"950","vat":"237.5","total":"1187.5"}`. Kodstandarden kräver strängar med två decimaler.
- `price_calc.py` får bara ett beställnings-id och har ingen egen ägarkontroll. `jobs/nightly_report.py` anropar den direkt, utan att gå genom API:t.

### Codemap: moduler, ansvar och beroenden i den äldre delen

_Inte ifyllt än._

### Karakteriseringstester: vilket beteende de fångar, även buggar

| Test | Beteende som fångas | Är det en bugg? |
|---|---|---|
|  |  |  |

### Stegen: minst tre, med commit och grönt efter varje

| Steg | Vad som ändrades | Commit | Tester efter steget |
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

### Migreringsplan för databasen i expand/contract-steg, och vilka steg som går att backa

| Steg | Typ (expand / migrera / contract) | Vad som görs | Går att backa? |
|---|---|---|---|
|  |  |  |  |

## Mätningar

| Arbete | Tokens | Tid | Kostnad |
|---|---|---|---|
| Ny funktion | Huvudagenten (Opus 5.5): 271 in, 12,6k ut, 14,9M cache read, 138,8k cache write. Subagenterna: 218 165. | API 16 min, väggtid 14 min | 7,12 dollar |
| Granskning av agentgenererad kod | _Inte ifyllt än_ |  |  |
| Modernisering | _Inte ifyllt än_ |  |  |

Bygget av riggen är inget av de tre arbetena, men det är mätt. Enligt `/usage` den 17 november: 23,55 dollar, 34 minuter API-tid och 37 minuter väggtid.

Siffrorna för den nya funktionen kommer från `/usage` kl. 22:44 UTC, efter verifieringen. Väggtiden på 14 minuter är kortare än passet: passet startade 21:43 UTC och den sista commiten före mätningen gjordes 22:41 UTC. Siffrorna täcker alltså troligen bara den del av passet som kördes efter ett sessionsbyte, och research-fasen ingår sannolikt inte. Subagenternas tokens är räknade för alla faser.

_Var i repot:_ `sessions/2026-11-17-1.md` och `sessions/2026-11-17-2.md` (avsnitten Mätning).

### Vad kontrollerna fångade: antal och exempel

Hittills sex stopp från hooks.

Under bygget av riggen fyra:

- **Tre avsiktliga provkörningar:** ett typfel (`kontrollera-kodstandard`), `rm` på en testfil (`skydda-tester`) och en nyckel direkt i koden (`skydda-hemligheter`).
- **Ett riktigt stopp, som var ett falsklarm:** `skydda-hemligheter` stoppade sessionsloggen, som citerade provexemplet.

Under bygget av den nya funktionen två:

- **Två riktiga stopp, båda falsklarm:** `kontrollera-kodstandard` stoppade `@typescript-eslint/no-unused-vars` i `tests/orders.test.ts` och i `src/routes/orders.ts`. En import lades till i en ändring och användes först i nästa. Utan kontrollen hade inget hänt.

Övriga kontroller:

| Kontroll | Generalprovet | Den nya funktionen |
|---|---|---|
| Hooks | Inga stopp | 2 stopp (falsklarm, se ovan) |
| Röda tester före koden | 4 | 12 |
| Granskaren | 2 noteringar | 4 noteringar. Den viktigaste ingen automatisk kontroll fångar: `parseId` godtar id större än `int4`, vilket troligen ger 500. |

Samtidighetstestet fångade en avsiktligt trasig variant i 5 av 5 körningar.

_Uppdateras efter granskningen av pull requestet och moderniseringen._

_Var i repot:_ `sessions/fangster.log`, `docs/prov/granskning.md`, `docs/avbryta-en-beställning/granskning.md`, `docs/avbryta-en-beställning/plan.md` (steg 4).

### Två besparingar, och vad de kostar i kvalitet

_Inte ifyllt än: egen bedömning. En möjlig kandidat är att `utforskare` kör haiku._

| Besparing | Vad den sparar | Vad den kostar i kvalitet |
|---|---|---|
| 1 |  |  |
| 2 |  |  |

## Riggen i ett team

_Inte ifyllt än: egna bedömningar._

### Första steget i ett team på fem

_Svar:_

### Vad du väntar med, och varför

_Svar:_

### Ägare, ändringar och översyn: vem ändrar riggen, hur och hur ofta

_Svar:_

### Vad som följer med om modellen eller verktyget byts ut

_Svar:_

## Risker

Fem risker med en kodagent i den här kodbasen: vad som kan hända, hur du upptäcker det, och vad riggen gör åt det.

_Inte ifyllt än: egen bedömning._

| # | Vad som kan hända | Hur du upptäcker det | Vad riggen gör åt det |
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |
| 4 |  |  |  |
| 5 |  |  |  |

## Lärdomar

### Vad du skulle ändra först om du fick en vecka till

_Inte ifyllt än: egen bedömning._
