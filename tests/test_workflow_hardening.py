#!/usr/bin/env python3
"""Cover workflow and launcher hardening from the repository security review."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github" / "workflows"
SECURITY_REVIEW = WORKFLOWS / "security-review-pr.yml"
SYNC_CHECK = WORKFLOWS / "sync-check.yml"
LAUNCHERS = (ROOT / "start-overlay.sh", ROOT / "start-overlay.ps1")
# Verified against the upstream actions/checkout tag list.
CHECKOUT_RELEASES = {
    "11d5960a326750d5838078e36cf38b85af677262": "v4.4.0",
    "11bd71901bbe5b1630ceea73d27597364c9af683": "v4.2.2",
}
PIN_COMMENT = re.compile(r"actions/checkout@([0-9a-f]{40})\s+#\s*(v\S+)")


class SecurityReviewSkipTest(unittest.TestCase):
    """A forgeable check run must not suppress the model review."""

    def setUp(self):
        self.text = SECURITY_REVIEW.read_text(encoding="utf-8")

    def test_no_check_run_lookup_decides_whether_to_review(self):
        self.assertNotIn("listForRef", self.text)
        self.assertNotIn("already_reviewed", self.text)
        self.assertNotIn("alreadyReviewed", self.text)


class ThirdPartyActionTest(unittest.TestCase):
    """The unvetted AgentLint action stays out of CI."""

    def test_agentlint_is_absent_from_every_workflow(self):
        for workflow in sorted(WORKFLOWS.glob("*.yml")):
            with self.subTest(workflow=workflow.name):
                text = workflow.read_text(encoding="utf-8")
                self.assertNotIn("0xmariowu/AgentLint", text)


class CheckoutPinLabelTest(unittest.TestCase):
    """A version comment beside a checkout pin names that pin's release."""

    def test_checkout_pin_comments_match_their_release(self):
        for workflow in sorted(WORKFLOWS.glob("*.yml")):
            text = workflow.read_text(encoding="utf-8")
            for sha, label in PIN_COMMENT.findall(text):
                with self.subTest(workflow=workflow.name, sha=sha):
                    self.assertIn(sha, CHECKOUT_RELEASES)
                    self.assertEqual(label, CHECKOUT_RELEASES[sha])


class LauncherInstallTest(unittest.TestCase):
    """First-run installs follow the committed lockfile exactly."""

    def test_launchers_use_npm_ci(self):
        for launcher in LAUNCHERS:
            with self.subTest(launcher=launcher.name):
                text = launcher.read_text(encoding="utf-8")
                self.assertIn("npm ci", text)
                self.assertNotIn("npm install", text)


if __name__ == "__main__":
    unittest.main()
