"""Verify the trusted Foucault pull request review wiring."""

import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CALLER_WORKFLOW = REPOSITORY_ROOT / ".github" / "workflows" / "security-review-pr.yml"
PROVIDER_CONFIG = REPOSITORY_ROOT / "ci" / "model_providers.json"


class FoucaultReviewWiringTest(unittest.TestCase):
    """Keep model review on trusted default-branch workflow code."""

    def test_caller_uses_the_pinned_reusable_workflow(self):
        workflow = CALLER_WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("workflow_run", workflow)
        self.assertIn("Immutable Compliance", workflow)
        self.assertIn("listPullRequestsAssociatedWithCommit", workflow)
        self.assertIn("is_draft", workflow)
        self.assertIn("outputs.is_draft != 'true'", workflow)
        self.assertIn("abuzucom/foucault/.github/workflows/security-review.yml@", workflow)
        self.assertIn("62851df1ef177593adbb9e06b223f5a6dce66fc0", workflow)
        self.assertIn("MODEL_API_KEY: ${{ secrets.OLLAMA_API_KEY }}", workflow)
        self.assertIn("fork-review-skipped", workflow)

    def test_provider_profile_stays_pinned_to_the_reviewed_ollama_model(self):
        provider_config = PROVIDER_CONFIG.read_text(encoding="utf-8")

        self.assertIn('"active_provider": "ollama"', provider_config)
        self.assertIn('"model": "kimi-k2.7-code"', provider_config)


if __name__ == "__main__":
    unittest.main()
