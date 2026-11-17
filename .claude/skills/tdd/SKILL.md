---
name: tdd
description: Genomför ett steg ur docs/<mapp>/plan.md med test först. Ett rött test, minsta möjliga ändring, grönt, och stopp före commit.
argument-hint: <mapp> <stegets nummer>
---

Uppdrag: $ARGUMENTS

Första ordet är mappnamnet under `docs/`. Andra ordet är stegets nummer i `docs/<mapp>/plan.md`. Du gör ett steg och inget mer.

## Innan du börjar

1. Läs steget i `docs/<mapp>/plan.md` och kriteriet det hör till i `docs/<mapp>/research.md`.
2. Avbryt om kriterierna har `Status: förslag`, eller om planen hänvisar till en ADR med `Status: föreslagen`. Säg vad människan behöver godkänna.
3. Kör testerna och kontrollera att de är gröna innan du ändrar något. Är de röda från början rapporterar du det och stannar.

Testkommandon:

- TypeScript: `npm test`, eller `npx jest <fil> -t "<namn>"` för ett test.
- Python: `npm run test:legacy`.

Om pristester är röda med felet att `psycopg` saknas är den virtuella miljön inte aktiverad. Be användaren starta om med `.venv` aktiverad.

## Slingan

1. **Rött.** Låt subagenten `testskrivare` skriva testet för steget och visa att det är rött av rätt anledning. Du skriver inte testet själv.
2. **Grönt.** Gör minsta möjliga ändring i produktionskoden för att testet ska bli grönt. Bygg inget som steget inte kräver.
3. **Kontroll.** Kör hela testsviten, inte bara det nya testet. Kör `npm run check`.
4. **Städning.** Förenkla koden om det behövs, med gröna tester efter varje ändring.

Följ `docs/standard.md`. Hooks kontrollerar format, lint och typer efter varje ändring. Rätta felen de rapporterar. Stäng aldrig av en regel.

## Stoppvillkor

- Högst tre försök att få steget grönt. Är det fortfarande rött efter tredje försöket stannar du och rapporterar: vad du provade, vad som händer och vad du tror att felet är.
- Du ändrar aldrig ett test för att bli grön utan att fråga. Om testet verkar fel beskriver du varför och låter användaren avgöra.
- Om steget visar sig kräva något som planen inte beskriver stannar du och säger det, i stället för att utöka steget.

## När steget är grönt

1. Markera steget i `plan.md` genom att lägga till raden `- Status: klart` under det.
2. Stanna före commit. Visa:
   - testet som lades till (fil och rad)
   - filerna som ändrades
   - utdata från `npm test` (och `npm run test:legacy` för Python)
   - ett förslag på commit-meddelande som hänvisar till steget, till exempel
     `Avbryt egen ny beställning (plan steg 1, ADR 0001)`
3. Committa först när användaren har sagt ja till just det här steget. Det gäller alla steg, även steg som bara ändrar dokumentation, och ett ja till ett tidigare steg räcker inte.
