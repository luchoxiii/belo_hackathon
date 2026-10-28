"""
Base de las fuentes dummy: datos sintéticos determinísticos por (fuente, usuario).

No se conectan a ningún servicio. Mismo usuario + misma ventana = mismos datos.
Un usuario puede tener ingresos y gastos en la misma fuente (no se modela un rol).
"""

import hashlib
import random
from datetime import datetime, timezone
from decimal import Decimal

from ..models import BalanceRecord, Direction, Movement, MovementKind, SourceData


def own_key(source: str, subject_id: str) -> str:
    """Clave estable de la cuenta del usuario en una fuente (para detectar transferencias propias)."""
    return f"{source}.{hashlib.sha256(subject_id.encode()).hexdigest()[:8]}"


class DummyContext:
    def __init__(self, source: str, subject_id: str, window_from: datetime, window_to: datetime):
        self.source = source
        self.subject_id = subject_id
        self.window_from = window_from
        self.window_to = window_to
        self.rng = random.Random(f"{source}:{subject_id}")
        self.movements: list[Movement] = []
        self.balances: list[BalanceRecord] = []
        self.own_accounts: set[str] = {own_key(source, subject_id)}
        self.facts: dict = {}

    def months(self) -> list[str]:
        """Meses de la ventana (YYYY-MM), del más viejo al actual."""
        index = self.window_from.year * 12 + self.window_from.month - 1
        last = self.window_to.year * 12 + self.window_to.month - 1
        return [f"{i // 12:04d}-{i % 12 + 1:02d}" for i in range(index, last + 1)]

    def ars(self, low: int, high: int) -> Decimal:
        return Decimal(self.rng.randint(low, high) // 10 * 10)

    def usd(self, low: int, high: int) -> Decimal:
        return Decimal(self.rng.randint(low * 100, high * 100)) / 100

    def day(self) -> int:
        return self.rng.randint(1, 28)

    def add(
        self,
        kind: MovementKind,
        direction: Direction,
        month: str,
        day: int,
        amount: Decimal,
        counterparty: str,
        *,
        currency: str = "ARS",
        rail: str | None = None,
        description: str | None = None,
        counterparty_key: str | None = None,
        card_last4: str | None = None,
        card_brand: str | None = None,
        status: str = "success",
    ) -> None:
        occurred_at = datetime.fromisoformat(f"{month}-{day:02d}T13:00:00").replace(tzinfo=timezone.utc)
        if not self.window_from <= occurred_at < self.window_to:
            return
        key = counterparty_key or counterparty.lower().replace(" ", ".")
        self.movements.append(Movement(
            id=f"{self.source}:{len(self.movements) + 1:04d}",
            source=self.source,
            kind=kind,
            direction=direction,
            status=status,
            occurred_at=occurred_at,
            amount=amount,
            currency=currency,
            debits={currency: amount} if direction == Direction.OUT else {},
            rail=rail,
            counterparty_name=counterparty,
            counterparty_key=key,
            counterparty_ids=[key],
            description=description or counterparty,
            card_last4=card_last4,
            card_brand=card_brand,
            raw_type=kind.value,
        ))

    def wallet(self, name: str, available: Decimal, currency: str = "ARS",
               rate: str | None = None, earned_month: Decimal | None = None) -> None:
        self.balances.append(BalanceRecord(
            source=self.source, account_id=f"{self.source}-wallet-{currency}", kind="wallet", name=name,
            currency=currency, available=available, rate=rate,
            earned_total=(earned_month or Decimal(0)) * 6, earned_month=earned_month or Decimal(0),
        ))


class DummyRepository:
    """Subclases definen `id`, `name` y `generate(ctx)`."""

    id: str
    name: str
    live = False

    def generate(self, ctx: DummyContext) -> None:
        raise NotImplementedError

    async def fetch(self, subject_id: str, window_from: datetime, window_to: datetime) -> SourceData:
        return self.build(subject_id, window_from, window_to)

    def build(self, subject_id: str, window_from: datetime, window_to: datetime) -> SourceData:
        """Sin I/O: se puede usar también desde código síncrono."""
        ctx = DummyContext(self.id, subject_id, window_from, window_to)
        self.generate(ctx)
        return SourceData(
            source=self.id, live=False, movements=ctx.movements, balances=ctx.balances,
            own_accounts=ctx.own_accounts, facts=ctx.facts,
        )
