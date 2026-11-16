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

## Arbetssätt för bygget

- Ett steg i taget. Varje steg avslutas med en egen commit, så att varje del av riggen kan förklaras med sin commit.
- Varje steg har ett "klart när" som visar att delen fungerar. Bevisen skrivs in i sessionsloggen, eftersom mallen frågar "hur man ser att den fungerar".
- När en hook eller regel fångar något på riktigt antecknar du det i sessionsloggen. Det är svaret på mallens fråga "vad gick fel utan den".
- Ordningen: skydd först (behörigheter), sedan minnet (så att bygget självt loggas), sedan kontroller, sedan agenter och skills.

## Förberedelse

- `npm install`, `pip install -r requirements.txt`, `cp .env.example .env`, `npm run db:up`, `npm run db:reset`.
- **Klart när:** `npm test` ger 16 gröna.

## Steg 1: Behörigheter

**Filer:** `.claude/settings.json` (ny, delad i repot; `settings.local.json` är redan i `.gitignore`).

- **allow:** `Bash(npm test:*)`, `Bash(npm run lint:*)`, `Bash(npm run typecheck)`, `Bash(npm run format:*)`, `Bash(npm run test:legacy)`, `Bash(npx jest:*)`, `Bash(npm run check)`, `Bash(npm start)`, `Bash(curl http://localhost:*)`, `Bash(git status)`, `Bash(git diff:*)`, `Bash(git log:*)`. Curl mot localhost behövs i verifieringen. Andra curl-anrop hamnar utanför allow och kräver ditt godkännande.
- **ask:** `Bash(git commit:*)`, `Bash(git add:*)`, `Bash(npm run db:reset)`, `Bash(npm install:*)`, `Bash(pip install:*)`.
- **deny:** `Read(./.env)`, `Edit(./.env)`, `Bash(git push:*)`, `Bash(rm -rf:*)`, `Bash(git reset --hard:*)`. Curl står inte här, eftersom deny går före allow och då skulle stoppa verifieringen.

**Klart när:** agenten kör `npm test` utan fråga, frågar innan `git commit` och vägrar läsa `.env`.
**Commit:** `Rigg: behörigheter med allow, ask och deny`

## Steg 2: Minneskedjan och `/sessionslogg`

**Filer:**
- `.claude/hooks/las-logg.mjs` (**SessionStart**): skriver rubriken "Förra passets logg" och den senaste filen i `sessions/` till stdout, med kod 0. Om filen har markeringen "Ingen sammanfattning skrevs" lägger den till: "Förra passet saknar sammanfattning. Skriv den först utifrån faktadelen och git log."
- `.claude/hooks/skriv-logg.mjs` (**SessionEnd** och **PreCompact**): letar upp dagens senaste fil i `sessions/` och lägger till `## Fakta (skriven av hook)` med branch, commits sedan förra loggen, filer som inte är committade och resultatet av `npm test`. Finns ingen fil skapar den en med bara fakta och markeringen ovan. Den är snabb och skriver "kunde inte köras" i stället för att fastna.
- `.claude/skills/sessionslogg/SKILL.md`: skriver `sessions/ÅÅÅÅ-MM-DD-n.md` med rubrikerna Läge, Vad som fungerade (med bevis), Vad som misslyckades, Vad som återstår och Beslut. Inga personuppgifter.
- Hooksen registreras under `hooks` i `.claude/settings.json`.

**Klart när:** kör `/sessionslogg` och sedan `/exit`. Faktadelen ska ha lagts till i filen. Starta `claude` igen och fråga "vad gjorde vi förra gången?". Agenten ska svara utan att läsa någon fil.
**Commit:** `Rigg: minneskedja (SessionStart/SessionEnd) och /sessionslogg`

Från och med nu avslutas varje arbetspass med `/sessionslogg`, även passen där riggen byggs.

## Steg 3: Kodstandarden i verktyg

**Filer:** `eslint.config.js`, `package.json`.

- ESLint-regler med egna meddelanden som säger hur felet rättas:
  - `no-restricted-syntax`: en strängmall med `${}` som första argument till `query(...)`. Meddelandet blir "SQL får inte byggas med strängmallar. Använd db.query(sql, [värden]) med $1, $2 (docs/standard.md: Databas)."
  - `no-restricted-properties`: `it.skip`, `it.only`, `describe.skip`, `describe.only`, `test.skip`. Meddelandet blir "Tester får inte hoppas över. Rätta koden eller testet (docs/standard.md: Tester)."
- Ett nytt skript i `package.json`: `"check": "npm run lint && npm run typecheck && npm run format:check"`.

**Klart när:** en tillfällig fil med `db.query(\`... ${id}\`)` och en med `it.skip` ger var sitt fel med rätt meddelande. Ta bort filerna efteråt. Kontrollera sedan att `npm run check` går igenom på den nuvarande koden.
**Commit:** `Rigg: ESLint-regler ur kodstandarden med rättningsmeddelanden`

## Steg 4: Hooken `kontrollera-kodstandard`

**Fil:** `.claude/hooks/kontrollera-kodstandard.mjs` (**PostToolUse**, matcher `Edit|Write`).

- Läser `tool_input.file_path` från stdin. Gör inget om filen inte är en `.ts`-fil under `src/`, `tests/` eller `scripts/`.
- Kör `prettier --write` och `eslint` på filen och sedan `tsc --noEmit`.
- Vid fel avslutar den med kod 2 och skriver felen på stderr, så att agenten rättar själv.

**Klart när:** be agenten införa ett typfel eller en SQL-strängmall. Hooken ska stoppa ändringen och agenten ska rätta den utan att du säger något.
**Commit:** `Rigg: PostToolUse-hook för format, lint och typer`

## Steg 5: Hooken `skydda-tester`

**Fil:** `.claude/hooks/skydda-tester.mjs` (**PreToolUse**, matcher `Edit|Write|Bash`).

Stoppar med kod 2 och skriver orsaken på stderr när agenten försöker:
- Ta bort testfiler (`rm`, `git rm` eller `mv` på `tests/**`, `*.test.ts` eller `test_*.py`).
- Lägga till `.skip`, `.only`, `xit`, `xdescribe` eller `@pytest.mark.skip` i en testfil.
- Minska antalet `it(` eller `test(` i en ändring, alltså ta bort ett test.
- Ändra `testMatch` i `jest.config.js` eller `testpaths` i `pytest.ini`.

Meddelandet blir "Tester får ändras men inte tas bort eller stängas av. Rätta koden, eller föreslå ändringen av testet för användaren."

**Klart när:** skicka in stdin-JSON för vart och ett av de fyra fallen, till exempel `echo '{"tool_name":"Bash","tool_input":{"command":"rm tests/orders.test.ts"}}' | node .claude/hooks/skydda-tester.mjs; echo $?`. Varje fall ska ge kod 2. En vanlig ändring i ett test ska ge kod 0. Visa också fallet en gång i en riktig session.
**Commit:** `Rigg: PreToolUse-hook som stoppar borttagna och avstängda tester`

## Steg 6: Hooken `skydda-hemligheter`

**Fil:** `.claude/hooks/skydda-hemligheter.mjs` (**PreToolUse**, matcher `Edit|Write`).

- Stoppar skrivningar till `.env` och `.env.*` utom `.env.example`.
- Stoppar innehåll som liknar en nyckel eller ett lösenord: `password=`, `api_key`, `secret`, `token` med ett värde, långa slumpmässiga strängar och URL:er med inloggningsuppgifter till andra värdar än `localhost`.
- Undantag: den lokala standardadressen `postgres:postgres@localhost` finns redan i `src/db.ts` och `tests/helpers/env.ts`. Den måste släppas igenom, annars stoppas varje ändring i de filerna.

**Klart när:** en ändring med `const apiKey = "sk-..."` stoppas och en vanlig ändring i `src/db.ts` går igenom.
**Commit:** `Rigg: PreToolUse-hook som stoppar hemligheter och .env`

## Steg 7: Subagenter

**Filer:** `.claude/agents/*.md`. Varje fil har `name`, `description`, `tools` och `model` i frontmatter och en kort instruktion.

| Fil | Verktyg | Modell | Instruktion i korthet |
|---|---|---|---|
| `utforskare.md` | Read, Grep, Glob | haiku | Hitta och sammanfatta med fil och rad. Ändrar inget. Svarar kort. |
| `planerare.md` | Read, Grep, Glob, Write | sonnet | Läser `research.md` och skriver `plan.md` utifrån de godkända acceptanskriterierna (vägrar om de bara är förslag) med numrerade steg: filer, vilket test först, vad som inte görs. När ett beslut har ett verkligt alternativ markerar den beslutet i planen och skriver ett utkast `docs/adr/NNNN-kort-beskrivning.md` enligt `docs/adr/mall.md`, med `Status: föreslagen`. Ändrar aldrig en ADR som redan är beslutad. Om beslutet ändras skriver den en ny ADR som ersätter den gamla. |
| `testskrivare.md` | Read, Grep, Glob, Edit, Write, Bash | sonnet | Skriver ett test per kriterium i stil med de befintliga testerna och visar att det är rött. Tar aldrig bort tester. |
| `granskare.md` | Read, Grep, Glob | sonnet | Granskar diffen mot `plan.md`, `docs/standard.md` och de beslutade ADR:er som planen hänvisar till. Rapporterar fynd under säkerhet, struktur och kodstandard med fil och rad. Ändrar inget. |

**Även:** `docs/adr/mall.md` med rubrikerna Status (föreslagen, beslutad eller ersatt av NNNN, plus datum och funktionens mapp), Kontext, Beslut, Alternativ som valdes bort (och varför) och Konsekvenser (+ och −). Arbetsgången för en ADR:
1. `planerare` skriver utkastet med `Status: föreslagen`.
2. Du tar ställning och ändrar till `Status: beslutad`. Beslutet är ditt.
3. ADR:en committas tillsammans med planen, före koden. Till exempel: `ADR 0001: <beslutet>`.
4. Commits som bygger på beslutet hänvisar till det, till exempel `(plan steg 2, ADR 0001)`.

**Klart när:** `/agents` visar alla fyra. Be utforskaren hitta var ägarkontrollen för beställningar görs. Den ska svara med fil och rad.
**Commit:** `Rigg: fyra subagenter med verktyg och modell, och ADR-mall`

## Steg 8: Skills för arbetsflödet

**Filer:** `.claude/skills/<namn>/SKILL.md`. Alla skriver till `docs/<mapp>/` och mappen anges som första argument.

- **`/research <mapp> <story>`**: använder `utforskare` och skriver sedan själv `research.md` med rubrikerna Berörs, Befintliga tester, Regler som gäller, Kräver schemaändring?, Oklart och Acceptanskriterier (Givet/När/Så) med raden `Status: förslag`. Kriterierna utgår från storyn och standarden, inte från koden. Människan rättar kriterierna i filen och ändrar raden till `Status: godkänd`. Det är beslutet som planen och verifieringen sedan bygger på.
- **`/tdd <steg> i <plan>`**: läser steget. `testskrivare` skriver ett rött test, huvudagenten gör minsta möjliga ändring, kör `npm test` tills det är grönt och stannar sedan med ett förslag på commit-meddelande som hänvisar till steget i planen.
- **`/granska <plan>`**: låter `granskare` gå igenom `git diff main` och skriva `granskning.md`. Avvikelser från en beslutad ADR blir ett fynd under struktur. Utan plan granskas en utdelad PR-diff mot `docs/standard.md`.
- **`/verifiera <mapp>`**: läser de godkända kriterierna i `research.md` och avbryter om raden säger `Status: förslag`. Kör `npm run check` och hela `npm test`. Kopplar varje kriterium till testet som täcker det (fil och rad) och till ett `curl`-anrop mot servern efter `npm run db:reset` och `npm start`. Kontrollerar också att `docs/api.md` är uppdaterad, att stegen i `plan.md` är klara och att eventuella migreringar går att backa. Skriver `verifiering.md` med commit-hash och en tabell: kriterium, test, anrop och status. Rättar ingenting. Ett kriterium som inte är uppfyllt blir ett nytt `/tdd`-steg.

**Klart när:** `/research prov <en liten ändring>` ger en fil med alla rubriker. `/tdd` på ett litet steg ger rött, sedan grönt och sedan ett stopp före commit. `/granska` ger fynd som är sorterade efter typ. `/verifiera` ger en tabell där varje kriterium har bevis eller markeras som inte uppfyllt.
**Commit:** `Rigg: skills /research, /tdd, /granska och /verifiera`

## Steg 9: CLAUDE.md beskriver riggen

**Fil:** `CLAUDE.md`. Lägg till ett kort avsnitt:
- Faserna och filen varje fas lämnar i `docs/<mapp>/`: `research.md` (med de godkända acceptanskriterierna), `plan.md`, `granskning.md`, `verifiering.md`.
- Att beslut med alternativ skrivs som ADR i `docs/adr/` och godkänns innan koden skrivs.
- Att `/clear` körs mellan faserna, att varje commit hänvisar till ett steg i planen och, där det finns, till en ADR, och att varje pass avslutas med `/sessionslogg`.

**Commit:** `Rigg: CLAUDE.md beskriver arbetsflödet`

## Steg 10: Generalprov

Kör hela flödet på något litet innan de riktiga arbetena, till exempel ett 404-test som saknas. Gå igenom `/research`, godkännande av kriterierna, plan, `/tdd`, `/granska`, `/verifiera` och `/sessionslogg`. Rätta det som skaver, med en commit per rättning.

**Klart när:**
- Varje fas har lämnat sin fil.
- Minst en hook har stoppat något och det står i sessionsloggen.
- Ett nytt pass startar med förra passets läge.

## Efter bygget

De tre arbetena körs med riggen. Repot taggas `inlamning` först när allt är klart.
