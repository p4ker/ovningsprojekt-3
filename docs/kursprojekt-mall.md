# Kursprojekt: En rigg för en kodbas

Dokumentation enligt mallen i kursprojektet (AI-assisterad systemutveckling). Lämnas in som PDF.

För godkänt: fyll i svaret och visa var i repot det finns (fil, commit eller sessionslogg). För väl godkänt: skriv också vilket alternativ du valde bort och varför, och stöd valet med en siffra (tokens, tid, kronor eller antal fel som en kontroll fångade).

Läget 2026-11-17: avsnitten om riggen är ifyllda utifrån bygget och generalprovet. Avsnitt märkta "Inte ifyllt än" väntar på de tre arbetena eller på egna bedömningar.

| Namn | Kodbas | Repo och tagg |
|---|---|---|
| _Inte ifyllt än_ | Delkursens övningsprojekt: butikens API | `ovningsprojekt-3`. Taggen `inlamning` sätts när allt är klart. |

## Kodbas, krav och beslut

### Vilken kodbas, och varför

_Inte ifyllt än: egen motivering._

Fakta att utgå från: övningsprojektet har ett REST-API i TypeScript med tester och en äldre, odokumenterad prisberäkning i Python (`src/legacy/price_calc.py`) som också används av `jobs/nightly_report.py`.

_Var i repot:_ `README.md`, `CLAUDE.md` (avsnittet Arkitektur).

### User story och acceptanskriterier (Givet / När / Så)

_Inte ifyllt än: user storyn är inte vald. Kriterierna hamnar i `docs/<mapp>/research.md`._

### API-kontraktet för funktionen: endpoint, statuskoder, fel

_Inte ifyllt än: skrivs av `/research` under rubriken API-kontrakt i `docs/<mapp>/research.md`._

### ADR: beslutet

_Inte ifyllt än: ingen ADR är skriven. Generalprovet hade inget beslut med ett verkligt alternativ._

_Var i repot:_ mallen finns i `docs/adr/mall.md`.

### Alternativ du valde bort, och varför

_Inte ifyllt än: hör till ADR:en._

### Antaganden: vad du utgår från om kodbasen och dess användare

_Inte ifyllt än: egen bedömning._

## Riggens delar

En rad per skill, subagent och hook: vad den gör, varför den finns, vad som gick fel utan den, och hur man ser att den fungerar.

Där det står "inget observerat" har delen inte hunnit fånga något riktigt fel än. Raden uppdateras efter de tre arbetena.

### Skills och kommandon

| Skill | Vad den gör | Varför den finns | Vad som gick fel utan den | Hur man ser att den fungerar |
|---|---|---|---|---|
| `/research <mapp> <story>` | Skapar grenen `funktion/<mapp>`, låter `utforskare` kartlägga vad ändringen berör och skriver `research.md` med förslag på acceptanskriterier och API-kontrakt. | Kartläggningen ska se likadan ut varje gång och inte ligga som en prompt i chatten. Kriterierna blir facit för plan och verifiering. | Inget observerat. Skälet är kursens regel att allt som styr agenten ligger i repot. | `docs/prov/research.md` har alla rubriker, fynd med fil och rad och raden `Status: godkänd` (commit `e640112`). |
| `/tdd <mapp> <steg>` | Gör ett steg ur `plan.md`: `testskrivare` skriver ett rött test, huvudagenten gör minsta möjliga ändring, kör alla tester och stannar före commit. Stannar efter tre försök utan grönt. | Test först ska vara ett kommando och inte ett löfte. Stoppet före commit ger människan en granskningspunkt per steg. | I generalprovet committades steg 3 utan att stanna, trots regeln. Instruktionen skärptes i `fa5297d`. | Steg 1 gav tre röda tester (201 i stället för 400) och sedan 19 av 19 gröna (`4973388`). Steg 2 gav ett rött test och sedan 22 av 22 (`cd6f2a4`). |
| `/granska <mapp> [gren]` | Sparar diffen mot `main`, låter `granskare` gå igenom den och skriver `granskning.md` med fynd under säkerhet, struktur och kodstandard. Anger för varje fynd vilken kontroll som hade stoppat det. | Koden ska läsas av någon som inte var med när den skrevs. Samma skill används på det utdelade pull requestet. | Inget observerat. Granskaren hittade två noteringar som ingen automatisk kontroll hade fångat. | `docs/prov/granskning.md` (commit `12cac31`). |
| `/verifiera <mapp>` | Kör alla kontroller, gör ett `curl`-anrop per kriterium mot den körande servern och skriver `verifiering.md` med test och anrop som bevis. Rättar ingenting. | Kod kan följa standarden och ändå inte uppfylla kravet. Verifieringen kopplar koden tillbaka till kriterierna. | Inget observerat. | `docs/prov/verifiering.md`: sex kriterier, alla med test och anrop (commit `12cac31`). |
| `/sessionslogg` | Skriver passets logg i `sessions/` med läge, bevis, misslyckanden, återstående arbete, beslut, fångster och mätning. | Nästa pass börjar med tom kontext. Loggen är minnet, och den är underlaget när arbetet bedöms. | Vid projektets start visste agenten ingenting om tidigare arbete: minnet var tomt och det fanns ingen `CLAUDE.md`. | `sessions/2026-11-17-1.md` (commit `25cd9c3`). Nästa session läste in den vid start. |

_Var i repot:_ `.claude/skills/*/SKILL.md`, commits `74fca4e` och `e9bdc88`.

### Subagenter: namn, uppgift, verktyg, modell

| Namn | Uppgift | Verktyg | Modell | Varför den finns | Vad som gick fel utan den | Hur man ser att den fungerar |
|---|---|---|---|---|---|---|
| `utforskare` | Hittar var saker finns och sammanfattar med fil och rad. Ändrar inget. | Read, Grep, Glob | haiku | Research läser många filer. Den ska inte fylla huvudagentens kontext och behöver inte den dyra modellen. | Inget observerat. | Hittade ägarkontrollen i `src/services/orderService.ts:64-76` med rätt radnummer: 13 s, 11 709 tokens. Researchen för provändringen: 32 s, 23 866 tokens. |
| `planerare` | Skriver `plan.md` i numrerade steg utifrån godkända kriterier, och ADR-utkast när ett beslut har ett verkligt alternativ. | Read, Grep, Glob, Write | sonnet | Planen ska bygga på filerna och inte på samtalet. Den vägrar planera om kriterierna bara är förslag. | Inget observerat. | `docs/prov/plan.md` med tre steg. Den kontrollerade statusraden först: 22 s, 14 565 tokens. |
| `testskrivare` | Skriver ett rött test per kriterium med Jest eller pytest. Skriver ingen produktionskod. | Read, Grep, Glob, Edit, Write, Bash | sonnet | Den som skriver testet ska inte vara den som skriver koden. Då formas testet av kravet och inte av lösningen. | I steg 2 läste den inte `research.md`, utan byggde på planen och uppdraget. Instruktionen skärptes i `fa5297d`. | Testerna i `tests/customers.test.ts:38-66` var röda av rätt anledning innan koden skrevs: 25 s och 15 s, 16 512 och 14 043 tokens. |
| `granskare` | Granskar en diff mot plan, kodstandard och beslutade ADR:er. Rapporterar under säkerhet, struktur och kodstandard. Skriver inga filer. | Read, Grep, Glob | sonnet | Granskningen görs i en ny kontext som inte har sett bygget. Bara läsverktyg, så att den inte kan rätta det den hittar. | Inget observerat. | Granskningen av `funktion/prov`: inga fynd som måste åtgärdas, två noteringar: 22 s, 24 560 tokens. |

_Var i repot:_ `.claude/agents/*.md`, commit `8007c49`. Siffrorna står i `sessions/2026-11-17-1.md` under Mätning.

### Hooks: händelse, vad som körs, vad som stoppas

| Hook | Händelse | Vad som körs | Vad som stoppas | Varför den finns | Vad som gick fel utan den | Hur man ser att den fungerar |
|---|---|---|---|---|---|---|
| `las-logg` | SessionStart | Skriver den senaste sessionsloggen till agentens kontext. Sparar passets starttid vid `startup`. Gör ingenting vid `/clear`. | Ingenting. Påminner om logg som saknar sammanfattning eller inte är committad. | Minneskedjans läsdel: agenten ska veta läget utan att någon berättar det. | När sessionen återupptogs bytte den passets starttid, så `skriv-logg` hittade inte loggen och skapade en ny utan sammanfattning. Rättat i `4dbe823`. | Vid nästa `resume` behöll den starttiden och läste in loggen (`.claude/.sessionstarter.log`). Sex provfall med stdin-JSON. |
| `skriv-logg` | SessionEnd och PreCompact | Lägger till avsnittet Fakta i passets logg: branch, commits, ändringar som inte är committade, testresultat och antal stopp från hooks. | Ingenting. Skapar en logg med markeringen "Ingen sammanfattning skrevs" om loggen glömdes. | Minneskedjans skrivdel. Fakta kommer från kommandon och går att jämföra med det agenten skrev. | Utan tidsgränsen på 60 sekunder får SessionEnd bara 1,5 sekunder, och testerna hinner inte köras. | Faktadelen i `sessions/2026-11-17-1.md` har 22 passed. Nio provfall, bland annat `/clear`, glömd logg och två pass samma dag. |
| `kontrollera-kodstandard` | PostToolUse (Edit, Write) | Prettier och ESLint på filen som ändrades, och `tsc` för filer under `src/` och `scripts/`. | Stoppar inte ändringen, som redan är gjord. Avslutar med kod 2 så att agenten får felen och rättar själv. | Format, lint och typer ska kontrolleras vid varje ändring och inte först i granskningen. | Inget observerat. Den enda fångsten är en avsiktlig provkörning (typfelet `TS2322`). | Sju provfall. Raden i `sessions/fangster.log` från 2026-11-17 00:25. |
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

_Var i repot:_ `.claude/settings.json`, commit `6a0f308`. Deny provades: läsning av `.env` nekades.

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

_Var i repot:_ `CLAUDE.md` (avsnittet Arbetsflöde). Hela kedjan är körd en gång i `docs/prov/`, commits `e640112` till `12cac31`.

### Hur kontexten hanteras: plan i fil, rensa, komprimera, sessionslogg

- **Plan i fil:** varje fas lämnar en fil i `docs/<mapp>/`, och nästa fas läser den. Ingen fas behöver minnas samtalet.
- **Rensa:** `/clear` körs mellan faserna. Hooksen reagerar inte på `/clear`, så passet delas inte.
- **Komprimera:** före en komprimering skriver `skriv-logg` läget till loggen (PreCompact), och efteråt läser `las-logg` in loggen igen.
- **Sessionslogg:** `/sessionslogg` skriver sammanfattningen och `skriv-logg` lägger till fakta. `las-logg` läser in loggen i nästa pass.
- **Subagenter:** research, tester och granskning görs i egna kontexter. Bara rapporten kommer tillbaka till huvudagenten.

_Var i repot:_ `.claude/hooks/las-logg.mjs`, `.claude/hooks/skriv-logg.mjs`, `sessions/2026-11-17-1.md`.

### En commit som exempel: hash, och vad som går att spåra från den

`4973388` Neka e-postadresser utan @, lokal del eller domän med punkt (plan steg 1)

Från commit-meddelandet går det att följa kedjan bakåt och framåt:

- **Planen:** steg 1 i `docs/prov/plan.md`, som har raden `Status: klart`.
- **Kravet:** kriterium 2, 3 och 6 i `docs/prov/research.md`, med `Status: godkänd`.
- **Testerna:** `tests/customers.test.ts:38`, som lades till i samma commit och var röda före koden.
- **Koden:** `isValidEmail` i `src/services/customerService.ts`.
- **Granskningen:** `docs/prov/granskning.md`, inga fynd i ändringen.
- **Verifieringen:** `docs/prov/verifiering.md`, där kriterierna har test och anrop som bevis.

Exemplet kommer från generalprovet. _Byt till en commit ur den riktiga funktionen när den är byggd._

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

I generalprovet blev båda stegen gröna på första försöket, så stoppvillkoret för varv har inte lösts ut.

_Inte ifyllt än: ett stoppvillkor i kronor eller minuter finns inte._

_Var i repot:_ `.claude/skills/tdd/SKILL.md` (avsnittet Stoppvillkor).

### Vad du körde parallellt i worktrees, och varför (eller varför inte)

Hittills ingenting. Riggen byggdes steg för steg i en session, och varje steg byggde på det förra.

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
| Ny funktion | _Inte ifyllt än_ |  |  |
| Granskning av agentgenererad kod | _Inte ifyllt än_ |  |  |
| Modernisering | _Inte ifyllt än_ |  |  |

Bygget av riggen är inget av de tre arbetena, men det är mätt. Enligt `/usage` den 17 november: 23,55 dollar, 34 minuter API-tid och 37 minuter väggtid.

_Var i repot:_ `sessions/2026-11-17-1.md` (avsnittet Mätning).

### Vad kontrollerna fångade: antal och exempel

Hittills fyra stopp från hooks, alla under bygget av riggen:

- **Tre avsiktliga provkörningar:** ett typfel (`kontrollera-kodstandard`), `rm` på en testfil (`skydda-tester`) och en nyckel direkt i koden (`skydda-hemligheter`).
- **Ett riktigt stopp, som var ett falsklarm:** `skydda-hemligheter` stoppade sessionsloggen, som citerade provexemplet.

Under generalprovets bygge stoppade ingen hook något. Granskaren hittade två noteringar som ingen automatisk kontroll hade fångat.

_Uppdateras efter de tre arbetena._

_Var i repot:_ `sessions/fangster.log`, `docs/prov/granskning.md`.

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
