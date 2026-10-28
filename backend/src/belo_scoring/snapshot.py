"""Snapshot de ahorro y perfil declarado. Lógica pura, sin I/O."""

from decimal import Decimal

from .fx import FxProvider, fx_for_rates, normalize_currency, to_decimal, to_usd
from .models import BalanceSnapshot, DeclaredProfile, RawData, SavingsSnapshot, VaultSnapshot


def build_savings_snapshot(raw: RawData, fx: FxProvider | None = None) -> SavingsSnapshot:
    fx = fx or fx_for_rates(raw.fx_rates)
    at = raw.fetched_at
    unconverted: set[str] = set()

    def usd(amount: Decimal | None, currency: str) -> Decimal | None:
        value = to_usd(amount, currency, at, fx)
        if value is None and amount:
            unconverted.add(normalize_currency(currency))
        return value

    balances = []
    for b in raw.balances:
        available = to_decimal(b.get("available")) or Decimal(0)
        earned = b.get("earned") or {}
        earned_total = to_decimal(earned.get("total")) or Decimal(0)
        earned_month = to_decimal(earned.get("month")) or Decimal(0)
        balances.append(BalanceSnapshot(
            currency=b["currencyCode"],
            available=available,
            available_usd=usd(available, b["currencyCode"]),
            earned_total=earned_total,
            earned_month=earned_month,
            earned_total_usd=usd(earned_total, b["currencyCode"]),
            earned_month_usd=usd(earned_month, b["currencyCode"]),
            rate=(b.get("yield") or {}).get("rate"),
        ))

    vaults = []
    for v in raw.vaults:
        # El detalle trae `earned`; el listado no
        detail = raw.vault_details.get(str(v["id"]), v)
        balance = to_decimal(detail.get("balance")) or Decimal(0)
        earned = detail.get("earned")
        earned_total = to_decimal(earned.get("total")) if earned else None
        earned_month = to_decimal(earned.get("month")) if earned else None
        currency = detail["currencyCode"]
        vaults.append(VaultSnapshot(
            id=str(detail["id"]),
            name=(detail.get("details") or {}).get("name"),
            currency=currency,
            balance=balance,
            balance_usd=usd(balance, currency),
            rate=detail.get("rate"),
            goal_amount=to_decimal((detail.get("details") or {}).get("goalAmount")),
            earned_total=earned_total,
            earned_month=earned_month,
            earned_total_usd=usd(earned_total, currency),
            earned_month_usd=usd(earned_month, currency),
        ))

    def total(values: list[Decimal | None]) -> Decimal | None:
        known = [v for v in values if v is not None]
        return sum(known, Decimal(0)) if known else None

    vaults_available = "vaults" not in raw.unavailable
    return SavingsSnapshot(
        taken_at=at,
        balances=balances,
        vaults=vaults,
        total_liquid_usd=total([b.available_usd for b in balances]),
        total_vaults_usd=total([v.balance_usd for v in vaults]) if vaults_available else None,
        unconverted_currencies=sorted(unconverted),
        vaults_available=vaults_available,
    )


def build_declared_profile(raw: RawData) -> DeclaredProfile:
    """
    Perfil declarado. `/end-users` queda fuera por ahora: KYC, ocupación, país
    y compliance flags quedan en None. `civilStatus` nunca se incluye.
    """
    return DeclaredProfile(
        kyc_status=None,
        kyc_reason=None,
        occupation=None,
        country=None,
        declared_annual_revenue=raw.declared_brackets.get("annual_revenue"),
        declared_monthly_card_spend=raw.declared_brackets.get("monthly_card_spend"),
        card_application_status=(raw.card_application or {}).get("status"),
        compliance_flags={"pep": None, "obligatedSubject": None, "usTaxResident": None},
    )
