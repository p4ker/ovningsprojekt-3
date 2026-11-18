import os
from pathlib import Path

# Måste sättas innan något test importerar price_calc, som ansluter vid import.
# Samma standardvärde som tests/helpers/env.ts.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/butik_test"
)

import psycopg  # noqa: E402
import pytest  # noqa: E402

ROT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def aterstall_db():
    """Återställer testdatabasen till schema + testdata före varje test."""
    schema = (ROT / "db" / "schema.sql").read_text(encoding="utf8")
    seed = (ROT / "db" / "seed.sql").read_text(encoding="utf8")
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as anslutning:
        anslutning.execute("SET client_min_messages TO warning")
        anslutning.execute(schema)
        anslutning.execute(seed)
    yield
