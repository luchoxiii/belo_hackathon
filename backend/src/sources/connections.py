"""
Qué fuentes tiene conectadas cada usuario (patrón repository para el estado).

`JsonFileConnectionStore` persiste en un archivo local (demo / hackathon).
En Vercel el filesystem es efímero: para producción, implementar el mismo
protocolo sobre una base (Vercel KV, Turso...).
"""

import json
import os
import threading
from pathlib import Path
from typing import Protocol

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "connections.json"


class ConnectionStore(Protocol):
    def get(self, subject_id: str) -> list[str] | None:
        """Fuentes dummy conectadas; None = el usuario nunca configuró (usar los defaults)."""
        ...

    def set(self, subject_id: str, source_ids: list[str]) -> None:
        ...


class InMemoryConnectionStore:
    def __init__(self) -> None:
        self._data: dict[str, list[str]] = {}

    def get(self, subject_id: str) -> list[str] | None:
        return list(self._data[subject_id]) if subject_id in self._data else None

    def set(self, subject_id: str, source_ids: list[str]) -> None:
        self._data[subject_id] = list(source_ids)


class JsonFileConnectionStore:
    """`{subject_id: [source_id, ...]}`. Escritura atómica (archivo temporal + rename)."""

    def __init__(self, path: Path | str | None = None):
        self.path = Path(path or os.getenv("SOURCE_CONNECTIONS_PATH") or DEFAULT_PATH)
        self._lock = threading.Lock()

    def _read(self) -> dict[str, list[str]]:
        try:
            return json.loads(self.path.read_text())
        except FileNotFoundError:
            return {}

    def get(self, subject_id: str) -> list[str] | None:
        with self._lock:
            value = self._read().get(subject_id)
        return list(value) if value is not None else None

    def set(self, subject_id: str, source_ids: list[str]) -> None:
        with self._lock:
            data = self._read()
            data[subject_id] = list(source_ids)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2, sort_keys=True))
            tmp.replace(self.path)
