PYTHON ?= python

.PHONY: check lint test sync

check: sync lint test

lint:
	$(PYTHON) scripts/lint_style.py
	$(PYTHON) scripts/check_conflict_markers.py
	$(PYTHON) scripts/check_action_pins.py
	$(PYTHON) scripts/check_persist_credentials.py .github/workflows/agents-compliance.yml .github/workflows/agents-md-compliance.yml .github/workflows/ci.yml .github/workflows/immutable-conflict-check.yml .github/workflows/sync-check.yml

test:
	$(PYTHON) scripts/run_tests.py

sync:
	$(PYTHON) scripts/sync.py
