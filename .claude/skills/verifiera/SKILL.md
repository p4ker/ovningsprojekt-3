---
name: verifiera
description: Visar att varje godkänt acceptanskriterium håller i den färdiga koden, med test och anrop som bevis, och skriver docs/<mapp>/verifiering.md. Sista fasen före sessionsloggen. Rättar ingenting.
argument-hint: <mapp>
---

Uppdrag: $ARGUMENTS

Första ordet är mappnamnet under `docs/`.

Verifieringen svarar på en fråga: gör funktionen det vi bad om? Den utgår från filerna, inte från vad du minns av bygget.

## 1. Läs facit

Läs acceptanskriterierna och API-kontraktet i `docs/<mapp>/research.md`.

Avbryt om raden säger `Status: förslag`. Då finns inget facit att verifiera mot.

## 2. Kör de automatiska kontrollerna

- `npm run check`
- `npm test` (hela sviten)
- `npm run test:legacy`

Skriv ned resultatet av varje kommando. Fortsätt även om något är rött, så att rapporten blir fullständig.

## 3. Prova mot den körande servern

1. `npm run db:reset`, så att testdatan är känd.
2. Starta servern med `npm start` i bakgrunden.
3. Gör ett anrop per kriterium. Skriv adressen först i kommandot, så att det matchar behörighetsregeln:
   `curl http://localhost:3000/orders/1/cancel -X POST -H "X-Customer-Id: 1" -i`
4. Stäng servern när du är klar.

Kontrollera i varje svar: statuskoden, felformatet `{ "error": { "code", "message" } }`, fältnamn i camelCase och belopp som strängar med två decimaler.

## 4. Koppla varje kriterium till bevis

För varje kriterium:

- **Test:** testets fil och rad. Ett kriterium utan test är ett fynd.
- **Anrop:** kommandot och det väsentliga i svaret.
- **Status:** Uppfyllt, Inte uppfyllt eller Saknar test.

## 5. Kontrollera resten

- `docs/api.md` beskriver det nya eller ändrade enligt API-kontraktet.
- Varje steg i `docs/<mapp>/plan.md` har `Status: klart`, eller är uttryckligen struket.
- Fynden som människan valde under Åtgärder i `granskning.md` är åtgärdade.
- Migreringar går att backa, om det finns några.

## 6. Skriv docs/<mapp>/verifiering.md

```markdown
# Verifiering: <funktionen>

Gren: <gren> · Commit: <hash>
Datum: ÅÅÅÅ-MM-DD

## Automatiska kontroller
- npm run check: <resultat>
- npm test: <antal gröna och röda>
- npm run test:legacy: <resultat>

## Acceptanskriterier

| # | Kriterium | Test | Anrop | Status |
|---|---|---|---|---|
| 1 | <kort> | <fil:rad> | <kommando → svar> | Uppfyllt |

## Övrigt
- docs/api.md: <uppdaterad eller inte>
- Plan: <vilka steg som är klara>
- Granskningens åtgärder: <åtgärdade eller inte>
- Migreringar: <går att backa, eller "inga">

## Slutsats
Klart, eller vad som återstår.
```

## Avgränsning

Du rättar ingenting i den här fasen, varken kod, tester eller dokumentation. Verifieringen mäter. Ett kriterium som inte är uppfyllt eller saknar test blir ett nytt steg som körs med `/tdd`, och sedan körs `/verifiera` igen.

Skriv bara "Uppfyllt" när du har sett beviset i den här körningen. Avsluta med slutsatsen och en lista över det som inte är uppfyllt.
