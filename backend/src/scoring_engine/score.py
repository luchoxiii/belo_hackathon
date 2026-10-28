"""
Calcula el score y la oferta preaprobada del titular de la credencial.

    cd backend
    PYTHONPATH=src python -m scoring_engine.score --out data/
    PYTHONPATH=src python -m scoring_engine.score --from-raw data/raw/ --term 6
    PYTHONPATH=src python -m scoring_engine.score --demo salaried

🛡️ Solo lectura: no mueve fondos. La oferta es una simulación indicativa.
"""

import argparse
import asyncio
import os
from pathlib import Path

from belo_scoring import fetch_raw, load_raw, save_raw

from .decision import decide, save_decision, subject_id_for
from .demo import PROFILES, demo_raw
from .models import CreditDecision


def print_decision(decision: CreditDecision) -> None:
    f = decision.features
    print(f"\nScorecard {decision.scorecard_version} · meses {', '.join(f.months_considered) or '-'}")
    print(f"Ingreso mediano USD {f.income_median_usd:.2f} · recurrente {f.recurring_income_ratio} · "
          f"CV {f.income_cv} · margen neto {f.net_margin} · runway {f.runway_months}")

    if not decision.eligible:
        print(f"\n❌ No elegible: {', '.join(decision.rejection_reasons)}")
        return

    s = decision.score
    print(f"\nScore {s.score} · banda {s.band}")
    for c in s.contributions:
        print(f"  {c.feature:<24} {str(c.value):<12} {c.points:>4} / {c.max_points}")
    if s.reason_texts:
        print("Razones:", "; ".join(s.reason_texts))

    o = decision.offer
    if o is None:
        print(f"\nSin oferta: {decision.no_offer_reason}")
        return
    print(f"\n✅ Preaprobado hasta USD {o.amount_max_usd} · {o.term_months} cuotas de USD {o.installment_usd} "
          f"(TNA {o.tna * 100:.1f}%, TEA {o.tea * 100:.2f}%) · válida hasta {o.valid_until:%Y-%m-%d}")
    print(o.disclaimer)


async def run(window_days: int, out: Path, from_raw: Path | None, term: int | None, demo: str | None) -> None:
    if demo:
        raw = demo_raw(demo)
        subject_id = f"demo-{demo}"
        print(f"🧪 Modo demo: perfil sintético '{demo}' (sin llamadas a belo)")
    elif from_raw:
        raw = load_raw(from_raw)
        subject_id = "from-raw"
    else:
        raw = await fetch_raw(window_days)
        save_raw(raw, out / "raw")
        subject_id = subject_id_for(os.environ["BELO_API_KEY"])

    decision = decide(raw, subject_id, term_months=term)
    path = save_decision(decision, out / "decisions")
    print_decision(decision)
    print(f"\nDecisión: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Score crediticio y oferta preaprobada (simulada)")
    parser.add_argument("--window-days", type=int, default=180)
    parser.add_argument("--out", type=Path, default=Path("data"))
    parser.add_argument("--from-raw", type=Path, help="Usar respuestas crudas guardadas, sin llamar a la API")
    parser.add_argument("--term", type=int, help="Plazo deseado en meses")
    parser.add_argument("--demo", choices=sorted(PROFILES), help="Usar un perfil sintético en lugar de la API")
    args = parser.parse_args()
    asyncio.run(run(args.window_days, args.out, args.from_raw, args.term, args.demo))


if __name__ == "__main__":
    main()
