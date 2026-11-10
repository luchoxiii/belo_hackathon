"""
Fuentes de datos del usuario (patrón repository).

Cada fuente implementa `SourceRepository.fetch` y devuelve `SourceData` en el
modelo canónico (`sources.models`). Para agregar una fuente: un módulo nuevo
y una línea en `sources.registry.REGISTRY`.

Este `__init__` no importa submódulos para evitar ciclos con `belo_scoring`.
"""
