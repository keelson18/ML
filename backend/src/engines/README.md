# Backend Engine Boundary

This directory contains the canonical implementations of the intelligence
engines. Backend services import engines from this directory, while the old
frontend paths provide compatibility re-exports during the UI migration.
There is one implementation body per engine and the backend remains the
execution source of truth.