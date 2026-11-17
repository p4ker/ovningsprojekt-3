---
name: sessionslogg
description: Skriver passets sessionslogg i sessions/ med läge, bevis, misslyckanden, återstående arbete, beslut och mätning. Körs i slutet av varje arbetspass.
---

Skriv sessionsloggen för det här arbetspasset. $ARGUMENTS

Loggen är nästa pass enda minne och underlag när arbetet bedöms. Skriv så att någon som inte var med kan fortsätta.

## Vilken fil

1. Läs starttiden i `.claude/.pass-start`.
2. Finns det redan en fil i `sessions/` med raden `Pass: <starttiden>` uppdaterar du den. Ersätt i så fall raden "Ingen sammanfattning skrevs."
3. Annars skapar du `sessions/ÅÅÅÅ-MM-DD-n.md`, där n är nästa lediga nummer för dagens datum.

## Innehåll

Följ den här mallen exakt. Raden `Pass:` måste stå kvar oförändrad, eftersom hooken `skriv-logg` använder den för att hitta filen.

```markdown
# Sessionslogg ÅÅÅÅ-MM-DD, pass n

Pass: <innehållet i .claude/.pass-start>
Arbete: <rigg | ny funktion | granskning av PR | modernisering>

## Läge
Var arbetet står just nu, till exempel "steg 3 av 5 i docs/<mapp>/plan.md".

## Vad som fungerade
En punkt per sak, alltid med bevis: commit-hash, testnamn, fil och rad eller utdata från ett kommando.

## Vad som misslyckades
Vad som gick fel och varför. Även försök som övergavs.

## Vad som återstår
Nästa steg, i den ordning de ska göras. Det som inte hanns, med varför.

## Beslut
Vad som valdes, vad som valdes bort och var det står (till exempel en ADR).

## Vad kontrollerna fångade
Rader ur sessions/fangster.log från det här passet och fel som lint, typkontroll eller tester hittade.
Skriv vad som hade hänt utan kontrollen. Skriv "Inget" om inget fångades.

## Mätning
Tokens, tid och kostnad för passet. Be användaren klistra in utdata från /cost.
Skriv "Ej angivet" om användaren inte ger några siffror. Hitta inte på siffror.
```

## Regler

- Påstå inget som du inte har bevis för. Kör `git log --oneline` och `git status --short`, och kör testerna om du skriver att de är gröna.
- Skriv inte avsnittet "Fakta (skriven av hook)". Det lägger hooken till när sessionen avslutas, och det ska gå att jämföra med det du skrev.
- Inga personuppgifter (namn, e-post), ingen kunddata och inga hemligheter i loggen.
- Committa inte loggen själv. Faktadelen läggs till först när sessionen avslutas, så loggen committas efter det: i terminalen eller i början av nästa pass.
- Avsluta med att säga vilken fil du skrev och påminn användaren om att avsluta sessionen med /exit så att faktadelen läggs till.
