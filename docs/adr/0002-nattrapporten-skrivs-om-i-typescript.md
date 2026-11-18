# 0002: Nattrapporten skrivs om i TypeScript och använder calcPrice

Status: beslutad
Datum: 2026-11-18
Funktion: docs/modernisera-prisberakning/

## Kontext

`jobs/nightly_report.py` importerar `calc_price` och `conn` direkt från `src/legacy/price_calc.py` (`jobs/nightly_report.py:3-4`) och körs av cron på driftservern. När prisberäkningen flyttas till TypeScript måste rapporten få sitt pris från samma beräkning, annars finns två beräkningar som kan glida isär (`docs/standard.md:26`, acceptanskriterium 19). Rapportens utskrift ska vara exakt densamma (kriterium 15 och 16, research Besvarat 5).

Det som begränsar valet:
- Rapporten körs utanför repot. Hur cron anropar den kan vi inte ändra med en commit.
- Python-modulen ligger kvar parallellt tills en separat uppgift tar bort den (Besvarat 8). Rapporten i Python ska därför finnas kvar oförändrad tills dess (kriterium 21).
- Rapporten summerar `total` från många ordrar. Ett anrop per order är en N+1-loop (`docs/standard.md:11`).

## Beslut

Nattrapporten skrivs om i TypeScript som `jobs/nattrapport.ts` och körs med ett nytt npm-skript (`npm run rapport:natt -- 2026-10-01`). Den hämtar dagens betalda ordrar med parametriserad SQL och räknar alla i ett anrop till `src/pricing/`, så att den använder samma beräkning som API:t. Utskriften är exakt `<dag>: <antal> betalda ordrar, totalt <summa> kr`.

`jobs/nightly_report.py` lämnas oförändrad i det här arbetet och tas bort i den separata uppgiften.

Följd utanför repot: cron-raden på driftservern måste ändras från `python3 jobs/nightly_report.py` till det nya kommandot (`npm run rapport:natt` i projektmappen, med `DATABASE_URL` satt). Den ändringen görs av den som ansvarar för driftservern, och ska nämnas i överlämningen. Tills cron-raden är ändrad körs den gamla Python-rapporten och räknar med den gamla beräkningen, vilket ger samma resultat så länge båda är kvar.

## Alternativ som valdes bort

- **Tunt Python-skal som anropar TypeScript per order:** cron-raden kunde vara oförändrad. Men rapporten skulle då starta Node en gång per order eller kräva ett eget internt gränssnitt, och Python-koden som skulle tas bort blir kvar. Det är en N+1 av processer och bevarar språkgränsen som refaktoreringen ska få bort.
- **Behålla Python-beräkningen för rapporten:** minst arbete nu och ingen ändring av cron. Men då finns två beräkningar för alltid, och `price_calc.py` (som ansluter vid import och bygger SQL med `%`) kan aldrig tas bort. Det bryter mot `docs/standard.md:26`.

## Konsekvenser

- + En enda beräkning för API och rapport.
- + Python-modulen går att ta bort i den separata uppgiften utan att rapporten påverkas.
- + Rapporten får parametriserad SQL och ingen fråga per order.
- − Cron-raden på driftservern måste ändras utanför repot. Missas det körs den gamla rapporten vidare, och den slutar fungera när Python-modulen tas bort.
- − Rapporten kräver Node 22 och `tsx` på driftservern.
- − Under parallellfasen finns rapporten i två språk. Båda är täckta av samma tester (kriterium 15 och 16).
