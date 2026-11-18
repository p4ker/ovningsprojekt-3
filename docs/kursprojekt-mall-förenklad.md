# Kursprojekt: En rigg för en kodbas

Dokumentation enligt mallen i kursprojektet (AI-assisterad systemutveckling). Lämnas in som PDF.

För godkänt: fyll i svaret och visa var i repot det finns (fil, commit eller sessionslogg). För väl godkänt: skriv också vilket alternativ du valde bort och varför, och stöd valet med en siffra (tokens, tid, kronor eller antal fel som en kontroll fångade).

Läget 2026-11-18: riggen, den nya funktionen (pull request #1) och moderniseringen (pull request #2) är ifyllda. Avsnitt märkta "Inte ifyllt än" väntar.

| Namn | Kodbas | Repo och tagg |
|---|---|---|
| _Inte ifyllt än_ | Butikens API (övningsprojektet) | `ovningsprojekt-3`, taggen `inlamning` |

## Kodbas, krav och beslut

### Vilken kodbas, och varför

_Inte ifyllt än: egen motivering._

REST-API i TypeScript med tester, plus en äldre prisberäkning i Python.

_Var i repot:_ `README.md`, `CLAUDE.md`.

### User story och acceptanskriterier (Givet / När / Så)

Story 2: *Som kund vill jag kunna avbryta en beställning inom 30 minuter efter att jag lagt den.* 12 kriterier godkändes. Exempel:

1. Givet en egen beställning med status `new` som är yngre än 30 minuter, när kunden anropar `POST /orders/:id/cancel`, så blir svaret 200 med `status: "cancelled"`.
2. Givet en beställning som är äldre än 30 minuter, när kunden avbryter den, så blir svaret 409.
3. Givet en annan kunds beställning, när kunden avbryter den, så blir svaret 403.

_Var i repot:_ `docs/avbryta-en-beställning/research.md`, commit `c30e060`.

### API-kontraktet för funktionen: endpoint, statuskoder, fel

`POST /orders/:id/cancel` med `X-Customer-Id`, ingen body.

| Status | Felkod | När |
|---|---|---|
| 200 | – | Egen beställning, `new`, högst 30 minuter gammal |
| 400 | `invalid_input` | Ogiltigt id |
| 401 | `unauthorized` | Header saknas eller är ogiltig |
| 403 | `forbidden` | Annans beställning |
| 404 | `not_found` | Beställningen finns inte |
| 409 | `conflict` | För gammal eller inte `new` |

_Var i repot:_ `docs/api.md`.

### ADR: beslutet

ADR 0001: egen endpoint, och kontrollerna görs i en villkorad `UPDATE` så att två samtidiga anrop inte båda lyckas.

_Var i repot:_ `docs/adr/0001-avbryt-som-egen-endpoint.md`.

### Alternativ du valde bort, och varför

- **`PATCH` med status:** öppnar för otillåtna statusbyten.
- **`DELETE`:** beställningen ska finnas kvar.
- **Läs, kontrollera, skriv:** samtidighetstestet blev rött i 5 av 5 körningar.

_Var i repot:_ ADR 0001.

### Antaganden: vad du utgår från om kodbasen och dess användare

- 30 minuter räknas från `created_at` med databasens klocka.
- Inget annat system ändrar status under tiden.

_Var i repot:_ `docs/avbryta-en-beställning/research.md`.

_Inte ifyllt än: egen bedömning av kodbasens användare._

## Riggens delar

En rad per skill, subagent och hook: vad den gör, varför den finns, vad som gick fel utan den, och hur man ser att den fungerar.

### Skills och kommandon

**`/research`**

- **Vad den gör:** Kartlägger ändringen och föreslår kriterier.
- **Varför den finns:** Samma kartläggning varje gång.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** `research.md` med `Status: godkänd`.

**`/tdd`**

- **Vad den gör:** Rött test, minsta ändring, grönt, stopp före commit.
- **Varför den finns:** Test först och en granskningspunkt per steg.
- **Vad som gick fel utan den:** Steg 3 i generalprovet committades utan stopp.
- **Hur man ser att den fungerar:** 12 röda tester före koden i den nya funktionen.

**`/granska`**

- **Vad den gör:** Granskar diffen och skriver `granskning.md`.
- **Varför den finns:** Koden läses av någon som inte skrev den.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** Fyra noteringar i den nya funktionen.

**`/verifiera`**

- **Vad den gör:** Bevisar varje kriterium med test och `curl`.
- **Varför den finns:** Kopplar koden till kraven.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** `verifiering.md` med alla kriterier.

**`/sessionslogg`**

- **Vad den gör:** Skriver passets logg.
- **Varför den finns:** Nästa pass börjar med tom kontext.
- **Vad som gick fel utan den:** Agenten visste inget om tidigare arbete.
- **Hur man ser att den fungerar:** Loggen läses in vid nästa start.

_Var i repot:_ `.claude/skills/`.

### Subagenter: namn, uppgift, verktyg, modell

**`utforskare`**

- **Uppgift:** Hittar kod, med fil och rad.
- **Verktyg:** Read, Grep, Glob
- **Modell:** haiku
- **Varför den finns:** Sparar kontext och kostnad.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** Rätt radnummer i researchen.

**`planerare`**

- **Uppgift:** Skriver plan och ADR-utkast.
- **Verktyg:** Read, Grep, Glob, Write
- **Modell:** sonnet
- **Varför den finns:** Planen bygger på filerna.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** `plan.md` och ADR 0001.

**`testskrivare`**

- **Uppgift:** Skriver röda tester.
- **Verktyg:** Read, Grep, Glob, Edit, Write, Bash
- **Modell:** sonnet
- **Varför den finns:** Testet formas av kravet, inte lösningen.
- **Vad som gick fel utan den:** Läste inte `research.md` (rättat).
- **Hur man ser att den fungerar:** Testerna var röda av rätt skäl.

**`granskare`**

- **Uppgift:** Granskar diffen. Ändrar inget.
- **Verktyg:** Read, Grep, Glob
- **Modell:** sonnet
- **Varför den finns:** Ny kontext, bara läsverktyg.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** Noteringar med fil och rad.

_Var i repot:_ `.claude/agents/`.

### Hooks: händelse, vad som körs, vad som stoppas

**`las-logg`**

- **Händelse:** SessionStart
- **Vad som körs:** Läser in senaste loggen.
- **Vad som stoppas:** Ingenting.
- **Varför den finns:** Agenten ska känna till läget.
- **Vad som gick fel utan den:** Fel starttid vid `resume` (rättat).
- **Hur man ser att den fungerar:** Loggen finns i kontexten vid start.

**`skriv-logg`**

- **Händelse:** SessionEnd, PreCompact
- **Vad som körs:** Lägger till fakta i loggen.
- **Vad som stoppas:** Ingenting.
- **Varför den finns:** Fakta från kommandon.
- **Vad som gick fel utan den:** För kort tid utan tidsgräns.
- **Hur man ser att den fungerar:** Faktadelen i sessionsloggarna.

**`kontrollera-kodstandard`**

- **Händelse:** PostToolUse
- **Vad som körs:** Prettier, ESLint, `tsc`.
- **Vad som stoppas:** Agenten får felen och rättar.
- **Varför den finns:** Kontroll vid varje ändring.
- **Vad som gick fel utan den:** Inget observerat.
- **Hur man ser att den fungerar:** Rader i `sessions/fangster.log`.

**`skydda-tester`**

- **Händelse:** PreToolUse
- **Vad som körs:** Räknar tester, letar efter `skip`/`only`.
- **Vad som stoppas:** Borttagna eller avstängda tester.
- **Varför den finns:** Tester får aldrig tas bort.
- **Vad som gick fel utan den:** `it.each` räknades fel (rättat).
- **Hur man ser att den fungerar:** Ett riktigt `rm` stoppades.

**`skydda-hemligheter`**

- **Händelse:** PreToolUse
- **Vad som körs:** Letar efter nycklar.
- **Vad som stoppas:** Hemligheter och `.env`.
- **Varför den finns:** Hemligheter i miljövariabler.
- **Vad som gick fel utan den:** Falsklarm på loggen (rättat).
- **Hur man ser att den fungerar:** En nyckel i koden stoppades.

_Var i repot:_ `.claude/hooks/`, `.claude/settings.json`.

### Delar du övervägde men valde bort, och varför

- **Separat säkerhetsgranskare:** täcks av `granskare`.
- **Stop-hook för loggen:** körs efter varje svar och kan slinga.
- **Separat byggare-agent:** huvudagenten bygger med `/tdd`.

_Var i repot:_ `docs/rigg-plan.md`.

## Behörigheter och sandlåda

| Regler | Motivering |
|---|---|
| **Allow:** tester, lint, typkontroll, `curl` mot localhost, läsande git | Körs ofta och ändrar inget. |
| **Ask:** `git commit`, `git add`, `db:reset`, installationer | Människan godkänner ändringar av historik, databas och beroenden. |
| **Deny:** `.env`, `git push`, `rm -rf`, `git reset --hard` | Hemligheter, publicering och sådant som inte går att ångra. |

_Var i repot:_ `.claude/settings.json`.

### Var agenten körs (din dator, sandlåda, container) och varför

På den egna datorn utan sandlåda. Databasen körs i Docker.

_Inte ifyllt än: egen motivering._

_Var i repot:_ `docker-compose.yml`.

## Arbetsslingan och kontexten

### Stegen från krav till commit

1. `/research` – människan godkänner kriterierna.
2. `planerare` – människan beslutar ADR:en.
3. `/tdd` per steg – människan godkänner varje commit.
4. `/granska` – människan väljer åtgärder.
5. `/verifiera`.
6. `/sessionslogg`.

_Var i repot:_ `CLAUDE.md` (Arbetsflöde).

### Hur kontexten hanteras: plan i fil, rensa, komprimera, sessionslogg

Varje fas lämnar en fil som nästa fas läser. `/clear` mellan faserna. Hooks sparar och läser in loggen. Subagenter arbetar i egna kontexter.

_Var i repot:_ `.claude/hooks/`, `sessions/`.

### En commit som exempel: hash, och vad som går att spåra från den

`c6a9795` Avbryt ger 403 för annans beställning före 409 (plan steg 3, ADR 0001)

Från commiten går det att spåra planens steg, ADR:en, kriterierna, testerna, granskningen och verifieringen.

## Orkestrering och modellval

### Faserna och filen varje fas lämnar

| Fas | Körs med | Fil som lämnas |
|---|---|---|
| Research | `/research` | `research.md` |
| Plan | `planerare` | `plan.md`, ADR |
| Bygg | `/tdd` | test, kod, commit |
| Granska | `/granska` | `granskning.md` |
| Verifiera | `/verifiera` | `verifiering.md` |
| Avsluta | `/sessionslogg` | sessionslogg |

_Var i repot:_ `CLAUDE.md`.

### Modell per subagent, och varför

| Subagent | Modell | Varför |
|---|---|---|
| `utforskare` | haiku | Hitta och sammanfatta. |
| `planerare` | sonnet | Väga krav mot kod. |
| `testskrivare` | sonnet | Skriva kod efter kriterium. |
| `granskare` | sonnet | Bedöma kod mot regler. |

_Var i repot:_ `.claude/agents/`.

### Kostnad med ditt val och med en större modell

Subagenterna använde 218 165 tokens i den nya funktionen och 468 473 i moderniseringen.

_Inte ifyllt än: kostnad i kronor och jämförelse med en större modell._

_Var i repot:_ `sessions/` (Mätning).

### Loop: vad görs om

`/tdd` upprepas tills steget är grönt. Fynd från granskning och verifiering blir nya `/tdd`-steg.

_Var i repot:_ `.claude/skills/`.

### Stoppvillkor (varv, kronor eller minuter)

`/tdd` stannar efter tre försök, gör ett steg i taget och kräver godkända statusrader. Varvgränsen har inte lösts ut.

_Inte ifyllt än: stoppvillkor i kronor eller minuter._

_Var i repot:_ `.claude/skills/tdd/SKILL.md`.

### Vad du körde parallellt i worktrees, och varför (eller varför inte)

Inget. Stegen byggde på varandra och ändrade samma filer.

_Inte ifyllt än: egen motivering._

## Styrd kodgenerering

### Kodstandarden i verktyg: regler som säger nej, och deras felmeddelanden

| Regel | Verktyg | Felmeddelande |
|---|---|---|
| Ingen SQL med strängmallar | ESLint | "SQL får inte byggas med strängmallar eller sammanslagning …" |
| Inga `skip`/`only` | ESLint | "Tester får inte hoppas över eller köras ensamma …" |
| Formatering och typer | Prettier, `tsc` | Omformatering och kompilatorfel |
| Inga borttagna tester | `skydda-tester` | "Tester får ändras men inte tas bort eller stängas av …" |
| Inga hemligheter | `skydda-hemligheter` | "Läs värdet från en miljövariabel …" |

_Var i repot:_ `eslint.config.js`, `.claude/hooks/`.

### Granskningslagren: vad varje lager fångar

| Lager | Vad det fångar |
|---|---|
| 1. Hooks före ändringen | Borttagna tester och hemligheter |
| 2. Hook efter ändringen | Format, lint, typer |
| 3. Tester | Trasigt beteende |
| 4. `granskare` | Struktur, säkerhet, avvikelser från plan |
| 5. `/verifiera` | Att kraven uppfylls |
| 6. Människan | Krav, plan, commits, åtgärder |

### Var sitter människan i granskningen, och varför just där

Vid kriterierna, planen och ADR:en, varje commit och valet av åtgärder efter granskningen.

_Inte ifyllt än: egen motivering till varför just där._

_Var i repot:_ `CLAUDE.md` (Arbetsflöde).

## Granskning av agentgenererad kod

Det utdelade pull requestet. För varje brist: rad, vad bristen är, varför den är en brist, och vilken kontroll eller hook som hade stoppat den.

_Inte ifyllt än: pull requestet är inte utdelat._

| Typ | Rad | Vad bristen är | Varför den är en brist | Kontroll eller hook som hade stoppat den |
|---|---|---|---|---|
| Säkerhet |  |  |  |  |
| Struktur |  |  |  |  |
| Kodstandard |  |  |  |  |

### Vad automatiken hittade, och vad bara du hittade

_Inte ifyllt än._

## Modernisering

Prisberäkningen och nattrapporten flyttades från Python till TypeScript utan att beteendet ändrades. Python-koden ligger kvar parallellt tills den tas bort i en separat uppgift.

- **ADR 0002:** nattrapporten skrivs om i TypeScript, så att beräkningen bara finns på ett ställe.
- **ADR 0003:** belopp räknas som `BigInt` i ören, för exakt samma resultat som Python.

_Var i repot:_ `docs/modernisera-prisberakning/`, ADR 0002 och 0003.

### Codemap: moduler, ansvar och beroenden i den äldre delen

```
GET /orders/:id/price → legacyPrice.ts → price_calc.py (Python-process)
cron → nightly_report.py → importerar calc_price direkt
```

| Modul | Ansvar | Beroenden | Användare |
|---|---|---|---|
| `price_calc.py` | Räknar pris, loggar | `psycopg`, databasen | API:t, nattrapporten |
| `legacyPrice.ts` | Startar Python-skriptet | `python3` | Routen |
| `nightly_report.py` | Summerar dagens betalda ordrar | `calc_price` | cron |

Två användare med olika gränssnitt, därför ADR 0002 och parallellfasen.

### Karakteriseringstester: vilket beteende de fångar, även buggar

| Test | Beteende som fångas | Är det en bugg? |
|---|---|---|
| `tests/price.test.ts` | Exakta priser för seed-ordrarna | Nej |
| `tests/price.test.ts` | Trunkering i stället för avrundning | Nej, avstämt med ekonomi |
| `tests/price.test.ts` | Utgångna rabattkoder ger rabatt | Troligen ja |
| `tests/price.test.ts` | Formatet `"736.0"`, inte två decimaler | Ja, men bevaras |
| `tests/price.test.ts` | Beräkningsfel ger 404 | Ja, men bevaras |
| `tests/nattrapport.test.ts` | Rapportens exakta rad | Nej |

Testerna skrevs mot Python innan något flyttades och visades kunna bli röda med tillfälliga mutationer.

### Stegen: minst tre, med commit och grönt efter varje

| Steg | Vad som ändrades | Commit | Tester efter steget |
|---|---|---|---|
| 1–6 | Karakteriseringstester mot Python | `9251fd3`–`61ec4ef` | Jest 79/79, pytest 4/4 |
| 7–9 | TypeScript-koden byggs vid sidan av | `ec1f772`–`c080afd` | Jest 124/124, pytest 4/4 |
| 10–11 | API:t och nattrapporten kopplas om | `547ac98`, `b2b5cac` | Jest 125/125, pytest 4/4 |
| 12 | Dokumentation | `3f00a32`, `a9dfe66` | Jest 125/125, pytest 4/4 |

### Migreringsplan för databasen i expand/contract-steg, och vilka steg som går att backa

Schemat ändras inte. Bytet av implementation följer ändå mönstret:

| Steg | Typ (expand / migrera / contract) | Vad som görs | Går att backa? |
|---|---|---|---|
| 7–9 | expand | Ny kod vid sidan av | Ja |
| 10–11 | migrera | Omkoppling till TypeScript | Ja, med `git revert` |
| Separat | contract | Python tas bort | Bara med `git revert` |

## Mätningar

| Arbete | Tokens | Tid | Kostnad |
|---|---|---|---|
| Ny funktion | Subagenter 218 165 | 14 min | 7,12 dollar |
| Granskning av agentgenererad kod | _Inte ifyllt än_ |  |  |
| Modernisering | Subagenter 468 473 | 39 min | 18,98 dollar |

Siffrorna kommer från `/usage` och täcker troligen inte hela passen.

_Var i repot:_ `sessions/` (Mätning).

### Vad kontrollerna fångade: antal och exempel

Sex stopp från hooks: tre avsiktliga prov och tre falsklarm. 12 röda tester före koden i den nya funktionen. Granskaren hittade att `parseId` godtar för stora id, vilket ingen automatisk kontroll fångar.

_Var i repot:_ `sessions/fangster.log`.

### Två besparingar, och vad de kostar i kvalitet

_Inte ifyllt än: egen bedömning._

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
