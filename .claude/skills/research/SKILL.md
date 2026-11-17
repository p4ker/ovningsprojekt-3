---
name: research
description: Kartlägger vad en user story eller ändring berör i kodbasen och skriver docs/<mapp>/research.md med förslag på acceptanskriterier. Första fasen i ett arbete. Ändrar ingen kod.
argument-hint: <mapp> <user story eller ändring>
---

Uppdrag: $ARGUMENTS

Första ordet är mappnamnet under `docs/`. Resten är user storyn eller ändringen. Saknas något av dem frågar du användaren innan du börjar.

## 1. Gren

Varje arbete görs på en egen gren, så att det går att jämföra med `main` i granskningen.

- Står du på `main` skapar du grenen `funktion/<mapp>` med `git switch -c`.
- Står du redan på en annan gren stannar du kvar på den.

## 2. Kartläggning

Använd subagenten `utforskare`. Be den hitta, med fil och rad för varje fynd:

- endpoints, tjänster, tabeller och kolumner som berörs
- befintliga tester för området och hur de är skrivna
- regler i `docs/standard.md` som gäller för ändringen
- beroenden utanför API:t, till exempel `src/legacy/price_calc.py` och `jobs/`

Läs själv storyn i `docs/user-stories.md` och kontraktet i `docs/api.md`.

## 3. Skriv docs/<mapp>/research.md

```markdown
# Research: <storyn i en mening>

Story: <storyn ordagrant, eller ändringen>
Gren: <grenens namn>

## Berörs
Fil och rad för varje fynd, med en mening om varför det berörs.

## Befintliga tester
Vilka tester som täcker området i dag, och vad som saknas.

## Regler som gäller
De regler i docs/standard.md som ändringen måste följa.

## Kräver schemaändring?
Ja eller nej. Vid ja: vilka tabeller och kolumner, och att det görs som en migrering som går att backa.

## Oklart
Frågor till människan. Det som måste besvaras innan kriterierna kan godkännas står först.

## Acceptanskriterier

Status: förslag

1. Givet ... När ... Så ...

## API-kontrakt
Endpoint, indata, svar och statuskoder med felkoder.
```

## Regler för acceptanskriterierna

- De utgår från storyn och från `docs/standard.md`, inte från hur koden beter sig i dag. Kriterierna är facit för planen och verifieringen.
- Ett kriterium per beteende. Varje felfall får ett eget: 400, 401, 403, 404 och 409 där de är möjliga.
- Varje kriterium går att kontrollera med ett test eller ett anrop.
- Raden `Status: förslag` ska stå kvar. Bara människan ändrar den till `Status: godkänd`.

## Avgränsning

Du ändrar inga andra filer än `docs/<mapp>/research.md`. Du skriver ingen kod, inga tester och ingen plan.

Avsluta med de tre viktigaste oklarheterna. Påminn användaren om att rätta kriterierna i filen och ändra statusraden till `Status: godkänd` innan planeringen börjar.
