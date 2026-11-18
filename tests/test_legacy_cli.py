import os
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent


def kor(*args):
    return subprocess.run(
        [sys.executable, *args],
        cwd=ROT,
        env=os.environ,
        capture_output=True,
        text=True,
    )


def test_cli_skriver_pris_som_json_for_order_1042():
    """price_calc.py 1042 skriver net, vat och total som strängar och avslutar med 0."""
    res = kor("src/legacy/price_calc.py", "1042")
    assert res.stdout == '{"net": "950", "vat": "237.5", "total": "1187.5"}\n'
    assert res.returncode == 0


def test_cli_skriver_fel_och_avslutar_med_1_for_okand_order():
    """price_calc.py 9999 skriver felet 'finns inte' och avslutar med 1."""
    res = kor("src/legacy/price_calc.py", "9999")
    assert res.stdout == '{"error": "finns inte"}\n'
    assert res.returncode == 1


def test_nattrapporten_summerar_betalda_ordrar_for_dagen():
    """nightly_report.py 2026-10-01 skriver antal betalda ordrar och summan."""
    res = kor("jobs/nightly_report.py", "2026-10-01")
    assert res.stdout == "2026-10-01: 1 betalda ordrar, totalt 1187.5 kr\n"
    assert res.returncode == 0


def test_calc_price_ger_pris_med_decimal_som_kan_adderas():
    """calc_price importerad som i nightly_report.py ger Decimal-fält, och None för okänd order."""
    sys.path.insert(0, str(ROT / "src" / "legacy"))
    from price_calc import calc_price

    p = calc_price(1042)
    assert isinstance(p.net, Decimal)
    assert isinstance(p.vat, Decimal)
    assert isinstance(p.total, Decimal)
    assert 0 + p.total == Decimal("1187.5")
    assert str(p.net) == "950"
    assert str(p.vat) == "237.5"
    assert str(p.total) == "1187.5"
    assert calc_price(9999) is None
