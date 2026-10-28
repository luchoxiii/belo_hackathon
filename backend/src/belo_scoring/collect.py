"""
Script para iterar sobre la recolección y las reglas.

    cd backend
    PYTHONPATH=src python -m belo_scoring.collect --window-days 180 --out data/
    PYTHONPATH=src python -m belo_scoring.collect --from-raw data/raw/ --out data/

🛡️ `data/` contiene datos financieros reales: está en .gitignore.
"""

import argparse
import asyncio
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

from .aggregate import month_range, aggregate_monthly
from .categorize import categorize
from .fetch import fetch_raw, load_raw, save_raw
from .models import CategorizedMovement
from .snapshot import build_declared_profile, build_savings_snapshot


def _write(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))


def print_summary(movements: list[CategorizedMovement]) -> None:
    groups: dict[tuple[str, str], list[CategorizedMovement]] = defaultdict(list)
    for m in movements:
        groups[(m.category.value, m.subcategory)].append(m)

    print(f"\n{'categoría':<12} {'subcategoría':<20} {'movs':>6} {'total USD':>14} {'partial':>8}")
    print("-" * 64)
    for (category, subcategory), items in sorted(groups.items()):
        total = sum((m.amount_usd for m in items if m.amount_usd is not None), Decimal(0))
        partial = sum(1 for m in items if m.data_quality == "partial") * 100 / len(items)
        print(f"{category:<12} {subcategory:<20} {len(items):>6} {total:>14.2f} {partial:>7.0f}%")
    if not movements:
        print("(sin movimientos en la ventana)")


async def run(window_days: int, out: Path, from_raw: Path | None) -> None:
    if from_raw:
        raw = load_raw(from_raw)
    else:
        raw = await fetch_raw(window_days)
        save_raw(raw, out / "raw")

    movements = categorize(raw)
    savings = build_savings_snapshot(raw)
    declared = build_declared_profile(raw)
    months = month_range(raw.window_from.strftime("%Y-%m"), raw.window_to.strftime("%Y-%m"))
    monthly = aggregate_monthly(movements, savings, declared, months=months)

    out.mkdir(parents=True, exist_ok=True)
    _write(out / "categorized.json", [m.model_dump(mode="json") for m in movements])
    _write(out / "monthly.json", {
        "aggregates": monthly.model_dump(mode="json"),
        "savings": savings.model_dump(mode="json"),
        "declared_profile": declared.model_dump(mode="json"),
        "unavailable": raw.unavailable,
    })

    print_summary(movements)
    if raw.unavailable:
        print("\nNo disponible:", ", ".join(f"{k} ({v})" for k, v in raw.unavailable.items()))
    if savings.unconverted_currencies:
        print("Sin cotización USD (pendiente FxProvider):", ", ".join(savings.unconverted_currencies))
    print(f"\nPartial: {monthly.partial_pct if monthly.partial_pct is not None else '-'}%")
    print(f"Salida: {out / 'categorized.json'}, {out / 'monthly.json'}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Recolecta y categoriza datos de belo para scoring")
    parser.add_argument("--window-days", type=int, default=180)
    parser.add_argument("--out", type=Path, default=Path("data"))
    parser.add_argument("--from-raw", type=Path, help="Recategorizar desde disco, sin llamar a la API")
    args = parser.parse_args()
    asyncio.run(run(args.window_days, args.out, args.from_raw))


if __name__ == "__main__":
    main()
