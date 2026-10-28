"""Snapshot de ahorro y perfil declarado sobre todas las fuentes. Lógica pura, sin I/O."""

from decimal import Decimal

from sources.models import ProfileData

from .fx import FxProvider, fx_for_rates, normalize_currency, to_usd
from .models import BalanceSnapshot, DeclaredProfile, RawData, SavingsSnapshot, VaultSnapshot


def build_savings_snapshot(data: RawData | ProfileData, fx: FxProvider | None = None) -> SavingsSnapshot:
    from sources.belo import as_profile  # import local: sources.belo depende de este paquete

    profile = as_profile(data)
    fx = fx or fx_for_rates(profile.fx_rates)
    at = profile.fetched_at
    unconverted: set[str] = set()

    def usd(amount: Decimal | None, currency: str) -> Decimal | None:
        value = to_usd(amount, currency, at, fx)
        if value is None and amount:
            unconverted.add(normalize_currency(currency))
        return value

    balances, vaults = [], []
    for b in profile.balances:
        if b.kind == "wallet":
            earned_total, earned_month = b.earned_total or Decimal(0), b.earned_month or Decimal(0)
            balances.append(BalanceSnapshot(
                provider=b.source,
                currency=b.currency,
                available=b.available,
                available_usd=usd(b.available, b.currency),
                earned_total=earned_total,
                earned_month=earned_month,
                earned_total_usd=usd(earned_total, b.currency),
                earned_month_usd=usd(earned_month, b.currency),
                rate=b.rate,
            ))
        else:
            vaults.append(VaultSnapshot(
                provider=b.source,
                id=b.account_id.removeprefix("vault-"),
                name=b.name,
                currency=b.currency,
                balance=b.available,
                balance_usd=usd(b.available, b.currency),
                rate=b.rate,
                goal_amount=b.goal_amount,
                earned_total=b.earned_total,
                earned_month=b.earned_month,
                earned_total_usd=usd(b.earned_total, b.currency),
                earned_month_usd=usd(b.earned_month, b.currency),
            ))

    def total(values: list[Decimal | None]) -> Decimal | None:
        known = [v for v in values if v is not None]
        return sum(known, Decimal(0)) if known else None

    vaults_available = not any(k.endswith(":vaults") for k in profile.unavailable)
    return SavingsSnapshot(
        taken_at=at,
        balances=balances,
        vaults=vaults,
        total_liquid_usd=total([b.available_usd for b in balances]),
        total_vaults_usd=total([v.balance_usd for v in vaults]) if vaults_available else None,
        unconverted_currencies=sorted(unconverted),
        vaults_available=vaults_available,
    )


def build_declared_profile(data: RawData | ProfileData) -> DeclaredProfile:
    """
    Perfil declarado. `/end-users` queda fuera por ahora: KYC, ocupación, país
    y compliance flags quedan en None. `civilStatus` nunca se incluye.
    """
    from sources.belo import as_profile

    profile = as_profile(data)
    return DeclaredProfile(
        kyc_status=None,
        kyc_reason=None,
        occupation=None,
        country=None,
        declared_annual_revenue=profile.declared_brackets.get("annual_revenue"),
        declared_monthly_card_spend=profile.declared_brackets.get("monthly_card_spend"),
        card_application_status=profile.card_application_status,
        compliance_flags={"pep": None, "obligatedSubject": None, "usTaxResident": None},
    )
