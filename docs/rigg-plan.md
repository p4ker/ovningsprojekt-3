# Plan: bygget av riggen

Mål: den minsta rigg som uppfyller kraven för godkänt i kursprojektet och som går att använda på de tre arbetena (ny funktion, granskning av PR, modernisering).

| Del | Krav | I riggen |
|---|---|---|
| Skills | minst 3, varav `/tdd` | `/research`, `/tdd`, `/granska`, `/verifiera`, `/sessionslogg` |
| Subagenter | minst 4, med beskrivning, verktyg och modell | `utforskare`, `planerare`, `testskrivare`, `granskare` |
| Hooks | minst 5, varav minneskedjan | `las-logg`, `skriv-logg`, `kontrollera-kodstandard`, `skydda-tester`, `skydda-hemligheter` |
| Behörigheter | allow, ask och deny | `.claude/settings.json` |
| Kodstandard | lint, format och typer med felmeddelanden som säger hur felet rättas | ESLint-regler och hooken `kontrollera-kodstandard` |
| Sessionsloggar | en per arbetspass i `sessions/` | `/sessionslogg` + `skriv-logg` |
| Mätningar | vad kontrollerna fångade, tokens, tid och kostnad | `sessions/fangster.log` och rubriken Mätning i sessionsloggen |

## Arbetssätt för bygget

- Ett steg i taget. Varje steg avslutas med en egen commit, så att varje del av riggen kan förklaras med sin commit.
- Varje steg har ett "klart när" som visar att delen fungerar. Bevisen skrivs in i sessionsloggen, eftersom mallen frågar "hur man ser att den fungerar".
- När en hook eller regel fångar något på riktigt hamnar det i `sessions/fangster.log` (se steg 4 till 6). Det är svaret på mallens fråga "vad gick fel utan den".
- Ordningen: skydd först (behörigheter), sedan minnet (så att bygget självt loggas), sedan kontroller, sedan agenter och skills.

## Gemensamt för alla hooks

- Kommandot i `settings.json` börjar med projektroten: `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/<namn>.mjs`. Då fungerar hooken även när agenten har bytt katalog.
- Hooks körs också för verktygsanrop som subagenterna gör.
- En hook som stoppar något (kod 2) lägger först till en rad i `sessions/fangster.log`: datum, hookens namn, filen och en kort orsak. Själva innehållet skrivs aldrig dit, så att en stoppad hemlighet inte hamnar i loggen.

## Förberedelse

- `npm install`, `python3 -m venv .venv`, `.venv/bin/pip install -r requirements.txt`, `cp .env.example .env`, `npm run db:up`, `npm run db:reset`.
- Databasen använder port 5434, eftersom 5432 och 5433 är upptagna av de tidigare övningsprojekten.
- Aktivera den virtuella miljön med `source .venv/bin/activate` innan du kör `npm test` eller startar `claude`. API:t anropar `python3` från PATH, och utan miljön saknas `psycopg` så att pristestet blir rött.
- **Klart när:** `npm test` ger 16 gröna. Kontrollerat 2026-11-17.

## Steg 1: Behörigheter

**Filer:** `.claude/settings.json` (ny, delad i repot; `settings.local.json` är redan i `.gitignore`).

- **allow:** `Bash(npm test:*)`, `Bash(npm run lint:*)`, `Bash(npm run typecheck)`, `Bash(npm run format:*)`, `Bash(npm run test:legacy)`, `Bash(npx jest:*)`, `Bash(npm run check)`, `Bash(npm start)`, `Bash(curl http://localhost:3000/*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`.
  - Curl mot den lokala servern behövs i verifieringen. Mönstret anger port och snedstreck, eftersom `http://localhost:*` är ett prefix som också släpper igenom `localhost.annan-sajt.com`. Andra curl-anrop hamnar utanför allow och kräver ditt godkännande.
- **ask:** `Bash(git commit:*)`, `Bash(git add:*)`, `Bash(git switch:*)`, `Bash(npm run db:reset)`, `Bash(npm install:*)`, `Bash(pip install:*)`.
- **deny:** `Read(./.env)`, `Edit(./.env)`, `Bash(git push:*)`, `Bash(rm -rf:*)`, `Bash(git reset --hard:*)`. Curl står inte här, eftersom deny går före allow och då skulle stoppa verifieringen.

**Klart när:** agenten kör `npm test` och `git status --short` utan fråga, frågar innan `git commit` och vägrar läsa `.env`.
**Commit:** `Rigg: behörigheter med allow, ask och deny`

## Steg 2: Minneskedjan och `/sessionslogg`

**Filer:**
- `.claude/hooks/las-logg.mjs` (**SessionStart**). Läser `source` från stdin:
  - `startup` och `resume`: sparar passets starttid i `.claude/.pass-start` (läggs i `.gitignore`). Skriver sedan rubriken "Förra passets logg" och den senaste filen i `sessions/` till stdout, med kod 0. Om filen har markeringen "Ingen sammanfattning skrevs" lägger den till: "Förra passet saknar sammanfattning. Skriv den först utifrån faktadelen och git log." Om `sessions/` har ändringar som inte är committade påminner den om att committa loggen.
  - `compact`: skriver loggen igen, utan uppmaningen och utan att ändra starttiden.
  - `clear`: gör ingenting. `/clear` körs mellan faserna och är inte ett nytt pass.
- `.claude/hooks/skriv-logg.mjs` (**SessionEnd** och **PreCompact**, med `"timeout": 60` i `settings.json`):
  - Gör ingenting när `reason` är `clear`.
  - Letar upp passets logg i `sessions/`. Den känns igen på raden `Pass: <starttiden>`, där starttiden kommer från `.claude/.pass-start`. Loggar från tidigare pass har en annan starttid och räknas inte, även om de är från samma dag. En logg som skrevs under passet men saknar raden får den tillagd.
  - Skriver avsnittet `## Fakta (skriven av hook)` med branch, commits sedan passets start, filer som inte är committade, resultatet av `npm test` och `npm run test:legacy` och antalet nya rader i `sessions/fangster.log`. Finns avsnittet redan ersätts det, så att det inte blir flera.
  - Finns ingen logg från passet skapar den en med bara fakta och markeringen "Ingen sammanfattning skrevs".
  - Skriver "kunde inte köras" i stället för att fastna om databasen inte är igång.
  - Tidsgränsen behövs eftersom SessionEnd annars bara får 1,5 sekunder, och det räcker inte för testerna.
- `.claude/skills/sessionslogg/SKILL.md`: skriver `sessions/ÅÅÅÅ-MM-DD-n.md` med rubrikerna Läge, Vad som fungerade (med bevis), Vad som misslyckades, Vad som återstår, Beslut, Vad kontrollerna fångade och Mätning. Under Mätning ber den dig klistra in utdata från `/cost` (tokens, tid och kostnad) och anger vilket av de tre arbetena passet gällde. Inga personuppgifter. Loggen får raden `Pass: <starttiden>`. Den committas efter att sessionen har avslutats, eftersom faktadelen läggs till först då.
- Hooksen registreras under `hooks` i `.claude/settings.json`.

**Klart när:**
- Kör `/sessionslogg` och sedan `/exit`. Faktadelen ska ha lagts till i filen, med testresultat.
- Starta `claude` igen och fråga "vad gjorde vi förra gången?". Agenten ska svara utan att läsa någon fil.
- Kör `/clear`. Ingen ny logg ska skapas och ingen uppmaning ska komma.
- Avsluta ett pass utan `/sessionslogg`. En logg med markeringen ska skapas, och nästa pass ska börja med uppmaningen.

**Commit:** `Rigg: minneskedja (SessionStart/SessionEnd) och /sessionslogg`

Från och med nu avslutas varje arbetspass med `/sessionslogg`, även passen där riggen byggs.

## Steg 3: Kodstandarden i verktyg

**Filer:** `eslint.config.js`, `package.json`.

- ESLint-regler med egna meddelanden som säger hur felet rättas:
  - `no-restricted-syntax`: en strängmall med `${}` eller en sammanslagning med `+` som första argument till `query(...)`. Meddelandet blir "SQL får inte byggas med strängmallar eller sammanslagning. Använd db.query(sql, [värden]) med $1, $2 (docs/standard.md: Databas)."
  - `no-restricted-properties`: `it.skip`, `it.only`, `describe.skip`, `describe.only`, `test.skip`, `test.only`. Meddelandet blir "Tester får inte hoppas över. Rätta koden eller testet (docs/standard.md: Tester)."
- Ett nytt skript i `package.json`: `"check": "npm run lint && npm run typecheck && npm run format:check"`.

**Klart när:** en tillfällig fil med `db.query(\`... ${id}\`)` och en med `it.skip` ger var sitt fel med rätt meddelande. Ta bort filerna efteråt. Kontrollera sedan att `npm run check` går igenom på den nuvarande koden. Om Prettier klagar på befintliga filer formateras de i en egen commit före den här.
**Commit:** `Rigg: ESLint-regler ur kodstandarden med rättningsmeddelanden`

## Steg 4: Hooken `kontrollera-kodstandard`

**Fil:** `.claude/hooks/kontrollera-kodstandard.mjs` (**PostToolUse**, matcher `Edit|Write`).

- Läser `tool_input.file_path` från stdin. Gör inget om filen inte är en `.ts`-fil under `src/`, `tests/` eller `scripts/`.
- Kör `prettier --write` och `eslint` på filen.
- Kör `tsc --noEmit` bara när filen ligger under `src/` eller `scripts/`. Ett rött test får anropa något som inte finns än. Om typkontrollen kördes på testfiler skulle hooken trycka på testskrivaren att skriva produktionskod.
- Vid fel avslutar den med kod 2 och skriver felen på stderr. Ändringen är redan gjord när hooken körs, så hooken ångrar ingenting. Den skickar felet till agenten, som rättar själv.

**Klart när:**
- Be agenten införa ett typfel i `src/` eller en SQL-strängmall. Agenten ska få felet och rätta det utan att du säger något.
- Ett test som anropar en funktion som inte finns än ska gå igenom hooken.
- Raden finns i `sessions/fangster.log`.

**Commit:** `Rigg: PostToolUse-hook för format, lint och typer`

## Steg 5: Hooken `skydda-tester`

**Fil:** `.claude/hooks/skydda-tester.mjs` (**PreToolUse**, matcher `Edit|Write|Bash`).

Stoppar med kod 2 och skriver orsaken på stderr när agenten försöker:
- Ta bort testfiler (`rm`, `git rm` eller `mv` på `tests/**`, `*.test.ts` eller `test_*.py`).
- Lägga till `.skip`, `.only`, `xit`, `xdescribe` eller `@pytest.mark.skip` i en testfil.
- Minska antalet `it(`, `test(` eller `def test_` i en ändring, alltså ta bort ett test. Vid Edit jämförs den gamla och den nya texten. Vid Write jämförs den nya texten med filen på disken.
- Ändra `testMatch` i `jest.config.js` eller `testpaths` i `pytest.ini`.

Meddelandet blir "Tester får ändras men inte tas bort eller stängas av. Rätta koden, eller föreslå ändringen av testet för användaren."

**Klart när:** skicka in stdin-JSON för vart och ett av de fyra fallen, till exempel `echo '{"tool_name":"Bash","tool_input":{"command":"rm tests/orders.test.ts"}}' | node .claude/hooks/skydda-tester.mjs; echo $?`. Varje fall ska ge kod 2. En vanlig ändring i ett test ska ge kod 0. Visa också fallet en gång i en riktig session.
**Commit:** `Rigg: PreToolUse-hook som stoppar borttagna och avstängda tester`

## Steg 6: Hooken `skydda-hemligheter`

**Fil:** `.claude/hooks/skydda-hemligheter.mjs` (**PreToolUse**, matcher `Edit|Write`).

- Stoppar skrivningar till `.env` och `.env.*` utom `.env.example`.
- Stoppar innehåll med:
  - Kända nyckelformat: `sk-`, `ghp_`, `AKIA` och `-----BEGIN ... PRIVATE KEY-----`.
  - En tilldelning där namnet innehåller `password`, `secret`, `token` eller `api_key` och värdet är en sträng skriven direkt i koden. Värden som läses från `process.env` eller `os.environ` går igenom.
  - URL:er med inloggningsuppgifter till andra värdar än `localhost`.
- Letar inte efter "långa slumpmässiga strängar". Det ger falsklarm på UUID:n och hashar.
- Stoppar bara nya förekomster. Det som redan står i filen får stå kvar, annars skulle varje ändring nära en gammal rad stoppas.
- Undantag:
  - Den lokala standardadressen `postgres:postgres@localhost`, som redan finns i `src/db.ts` och `tests/helpers/env.ts`.
  - Hookens egen fil, eftersom den innehåller mönstren.

**Klart när:** en ändring med `const apiKey = "sk-..."` stoppas. En vanlig ändring i `src/db.ts` och en rad med `process.env.API_KEY` går igenom. Raden i `sessions/fangster.log` innehåller inte nyckeln.
**Commit:** `Rigg: PreToolUse-hook som stoppar hemligheter och .env`

## Steg 7: Subagenter

**Filer:** `.claude/agents/*.md`. Varje fil har `name`, `description`, `tools` och `model` i frontmatter och en kort instruktion.

| Fil | Verktyg | Modell | Instruktion i korthet |
|---|---|---|---|
| `utforskare.md` | Read, Grep, Glob | haiku | Hitta och sammanfatta med fil och rad. Ändrar inget. Svarar kort. |
| `planerare.md` | Read, Grep, Glob, Write | sonnet | Läser `research.md` och skriver `plan.md` utifrån de godkända acceptanskriterierna (vägrar om de bara är förslag) med numrerade steg: filer, vilket test först, vad som inte görs. När ett beslut har ett verkligt alternativ markerar den beslutet i planen och skriver ett utkast `docs/adr/NNNN-kort-beskrivning.md` enligt `docs/adr/mall.md`, med `Status: föreslagen`. Ändrar aldrig en ADR som redan är beslutad. Om beslutet ändras skriver den en ny ADR som ersätter den gamla. |
| `testskrivare.md` | Read, Grep, Glob, Edit, Write, Bash | sonnet | Skriver ett test per kriterium i stil med de befintliga testerna och visar att det är rött. Jest för API:t och pytest för den äldre modulen. Skriver ingen produktionskod. Tar aldrig bort tester. |
| `granskare.md` | Read, Grep, Glob | sonnet | Får en diff-fil och läser de ändrade filerna. Granskar mot `plan.md`, `docs/standard.md` och de beslutade ADR:er som planen hänvisar till. Rapporterar fynd under säkerhet, struktur och kodstandard med fil och rad. Skriver inga filer och ändrar inget. |

**Även:** `docs/adr/mall.md` med rubrikerna Status (föreslagen, beslutad eller ersatt av NNNN, plus datum och funktionens mapp), Kontext, Beslut, Alternativ som valdes bort (och varför) och Konsekvenser (+ och −). Arbetsgången för en ADR:
1. `planerare` skriver utkastet med `Status: föreslagen`.
2. Du tar ställning och ändrar till `Status: beslutad`. Beslutet är ditt.
3. ADR:en committas tillsammans med planen, före koden. Till exempel: `ADR 0001: <beslutet>`.
4. Commits som bygger på beslutet hänvisar till det, till exempel `(plan steg 2, ADR 0001)`.

**Klart när:** `/agents` visar alla fyra. Be utforskaren hitta var ägarkontrollen för beställningar görs. Den ska svara med fil och rad.
**Commit:** `Rigg: fyra subagenter med verktyg och modell, och ADR-mall`

## Steg 8: Skills för arbetsflödet

**Filer:** `.claude/skills/<namn>/SKILL.md`. Alla tar mappen som första argument och arbetar i `docs/<mapp>/`.

Varje arbete görs på en egen gren, till exempel `funktion/avbryta-bestallning`. Då går det att jämföra arbetet med `main`, och grenen slås ihop med `main` först när verifieringen är klar.

- **`/research <mapp> <story>`**: skapar grenen om den inte finns. Använder `utforskare` och skriver sedan själv `research.md` med rubrikerna Berörs, Befintliga tester, Regler som gäller, Kräver schemaändring?, Oklart och Acceptanskriterier (Givet/När/Så) med raden `Status: förslag`. Kriterierna utgår från storyn och standarden, inte från koden. Människan rättar kriterierna i filen och ändrar raden till `Status: godkänd`. Det är beslutet som planen och verifieringen sedan bygger på.
- **`/tdd <mapp> <steg>`**: läser steget i `plan.md`.
  1. `testskrivare` skriver ett rött test.
  2. Huvudagenten gör minsta möjliga ändring.
  3. Den kör `npm test` för TypeScript eller `npm run test:legacy` för Python tills det är grönt.
  4. Den markerar steget i `plan.md` med `Status: klart` och stannar med ett förslag på commit-meddelande som hänvisar till steget i planen.

  Stoppvillkor: efter tre försök utan grönt stannar agenten och rapporterar vad som är fel i stället för att fortsätta.
- **`/granska <mapp> [gren]`**:
  1. Huvudagenten sparar `git diff main...HEAD` i `.claude/tmp/granskning.diff`, som inte committas. Med en gren som argument används `git diff main...<gren>`, och så granskas det utdelade pull requestet.
  2. `granskare` läser diff-filen och de ändrade filerna och rapporterar fynden. Avvikelser från en beslutad ADR blir ett fynd under struktur. Finns ingen `plan.md` i mappen granskas diffen bara mot `docs/standard.md`.
  3. Huvudagenten skriver `granskning.md` med fynden sorterade under säkerhet, struktur och kodstandard. För varje fynd anger den vilken kontroll i riggen som hade stoppat det, eller att det bara hittades i granskningen. Filen har också avsnitten "Vad automatiken hittade" och "Åtgärder", där människan väljer vilka fynd som ska åtgärdas.
- **`/verifiera <mapp>`**: läser de godkända kriterierna i `research.md` och avbryter om raden säger `Status: förslag`.
  1. Kör `npm run check`, hela `npm test` och `npm run test:legacy`.
  2. Kör `npm run db:reset`, startar servern med `npm start` i bakgrunden och stänger den efteråt.
  3. Kopplar varje kriterium till testet som täcker det (fil och rad) och till ett `curl`-anrop. Adressen skrivs först i kommandot, `curl http://localhost:3000/... -H ...`, så att anropet matchar allow-regeln.
  4. Kontrollerar att `docs/api.md` är uppdaterad, att stegen i `plan.md` är klara och att eventuella migreringar går att backa.
  5. Skriver `verifiering.md` med commit-hash och en tabell: kriterium, test, anrop och status.

  Rättar ingenting. Ett kriterium som inte är uppfyllt blir ett nytt `/tdd`-steg.

**Klart när:**
- `/research prov <en liten ändring>` ger en fil med alla rubriker.
- `/tdd prov 1` ger rött, sedan grönt och sedan ett stopp före commit.
- `/granska prov` ger en fil med fynd som är sorterade efter typ, trots att granskaren inte kan skriva filer.
- `/verifiera prov` ger en tabell där varje kriterium har bevis eller markeras som inte uppfyllt.

**Commit:** `Rigg: skills /research, /tdd, /granska och /verifiera`

## Steg 9: CLAUDE.md beskriver riggen

**Fil:** `CLAUDE.md`.

Lägg till ett kort avsnitt:
- Faserna och filen varje fas lämnar i `docs/<mapp>/`: `research.md` (med de godkända acceptanskriterierna), `plan.md`, `granskning.md`, `verifiering.md`.
- Att varje arbete görs på en egen gren.
- Att beslut med alternativ skrivs som ADR i `docs/adr/` och godkänns innan koden skrivs.
- Att `/clear` körs mellan faserna, att varje commit hänvisar till ett steg i planen och, där det finns, till en ADR, och att varje pass avslutas med `/sessionslogg`.

Rätta också det som inte längre stämmer:
- Raden om att kodstandarden inte kontrolleras automatiskt än.
- Raden om de tomma katalogerna under `.claude/`, `docs/adr/` och `sessions/`.
- Kommandolistan, som saknar `npm run check`.

**Commit:** `Rigg: CLAUDE.md beskriver arbetsflödet`

## Steg 10: Generalprov

Kör hela flödet på något litet innan de riktiga arbetena, till exempel ett 404-test som saknas. Gå igenom `/research`, godkännande av kriterierna, plan, `/tdd`, `/granska`, `/verifiera` och `/sessionslogg`. Rätta det som skaver, med en commit per rättning.

**Klart när:**
- Varje fas har lämnat sin fil.
- Minst en hook har stoppat något och det står i `sessions/fangster.log`.
- Ett nytt pass startar med förra passets läge.
- Sessionsloggen har tokens, tid och kostnad under Mätning.

## Efter bygget

De tre arbetena körs med riggen. Repot taggas `inlamning` först när allt är klart.
