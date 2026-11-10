"""Perfiles sintéticos de `scoring_engine.demo`, fijados a la fecha de `conftest.raw_data`."""

from datetime import datetime, timezone

from scoring_engine import demo

# Meses completos considerados: 2026-05..2026-09
NOW = datetime(2026, 10, 28, tzinfo=timezone.utc)


def salaried():
    return demo.salaried(NOW)


def erratic():
    return demo.erratic(NOW)


def short_history():
    return demo.short_history(NOW)
