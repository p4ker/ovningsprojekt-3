---
name: granska
description: Granskar ändringarna på en gren mot planen, kodstandarden och beslutade ADR:er med subagenten granskare, och skriver docs/<mapp>/granskning.md. Används för det egna arbetet och för ett utdelat pull request.
argument-hint: <mapp> [gren]
---

Uppdrag: $ARGUMENTS

Första ordet är mappnamnet under `docs/`. Ett valfritt andra ord är grenen som ska granskas. Utan gren granskas den gren du står på.

## 1. Ta fram diffen

- Utan gren: `git diff main...HEAD`
- Med gren: `git diff main...<gren>`

Spara diffen i `.claude/tmp/granskning.diff`. Skapa mappen om den saknas. Den committas inte.

Är diffen tom stannar du och säger det. Då står du troligen på `main`, eller så är grenen redan sammanslagen.

## 2. Låt granskaren granska

Använd subagenten `granskare`. Ge den:

- sökvägen till diff-filen
- mappen `docs/<mapp>/`, om den innehåller `plan.md` och `research.md`
- grenens namn, så att den vet vilka filer den ska läsa

Finns ingen plan i mappen granskas diffen bara mot `docs/standard.md`. Så granskas ett utdelat pull request.

Granskaren skriver inga filer. Den svarar med fynden.

## 3. Skriv docs/<mapp>/granskning.md

```markdown
# Granskning: <vad som granskades>

Gren: <gren> (<första commit>..<sista commit>)
Granskat mot: <plan.md, docs/standard.md, ADR NNNN>
Datum: ÅÅÅÅ-MM-DD

## Säkerhet

### <bristen i en mening>
- Var: <fil och rad>
- Varför: <vad som kan hända, eller vilken regel som bryts>
- Allvar: <måste åtgärdas | bör åtgärdas | notering>
- Kontroll som hade stoppat den: <hook, ESLint-regel eller test i riggen, eller "ingen, hittades bara i granskningen">

## Struktur

## Kodstandard

## Vad automatiken hittade
Kör `npm run check` och `npm test` på grenen och skriv vad de rapporterar.
Det som står här hittades utan granskaren.

## Inte bedömt
Det granskaren inte kunde bedöma.

## Åtgärder
- [ ] <fynd som ska åtgärdas, ifyllt av människan>
```

Regler:

- Återge granskarens fynd utan att lägga till egna och utan att stryka några. Skriv "Inga fynd" under en rubrik som är tom.
- Raden "Kontroll som hade stoppat den" fyller du i själv. Var ärlig: en kontroll räknas bara om den faktiskt finns i riggen. Peka på filen, till exempel `.claude/hooks/skydda-tester.mjs` eller regeln i `eslint.config.js`.
- Listan under Åtgärder lämnar du tom. Människan bestämmer vilka fynd som ska åtgärdas.

## Avgränsning

Du rättar ingenting i den här fasen. Fynd som ska åtgärdas blir nya steg som körs med `/tdd`.

Avsluta med antalet fynd per rubrik och de fynd som måste åtgärdas.
