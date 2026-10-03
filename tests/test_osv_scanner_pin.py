#!/usr/bin/env python3
"""Cover the OSV-Scanner reusable workflow pin and its required permissions."""
import re
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "osv-scanner.yml"
# Verified against the upstream google/osv-scanner-action v2.6.0 release.
PINNED_SHA = "a345acffa64b0eaede81a3d9aae6141214d9c8fc"
PINNED_RELEASE = "v2.6.0"
# v1.7.1 calls the retired actions/upload-artifact v3, which GitHub rejects.
RETIRED_SHA = "1f1242919d8a60496dd1874b24b62b2370ed4c78"
REUSABLE_REFERENCE = re.compile(
    r"uses:\s*google/osv-scanner-action/\.github/workflows/[\w.-]+@([0-9a-f]{40})"
)


class OsvScannerPinTest(unittest.TestCase):
    """Keep the scanner on a release GitHub still runs."""

    def setUp(self):
        self.text = WORKFLOW_PATH.read_text(encoding="utf-8")
        self.workflow = yaml.safe_load(self.text)

    def test_both_reusable_workflows_use_the_verified_release(self):
        pins = REUSABLE_REFERENCE.findall(self.text)
        self.assertEqual(len(pins), 2)
        self.assertEqual(set(pins), {PINNED_SHA})

    def test_retired_release_is_absent(self):
        self.assertNotIn(RETIRED_SHA, self.text)

    def test_version_comments_name_the_pinned_release(self):
        labels = re.findall(r"#\s*(v\d+\.\d+\.\d+)\s*\n\s*uses:\s*google/osv-scanner-action", self.text)
        self.assertEqual(labels, [PINNED_RELEASE, PINNED_RELEASE])

    def test_caller_grants_the_permissions_the_reusable_jobs_request(self):
        permissions = self.workflow["permissions"]
        self.assertEqual(permissions.get("actions"), "read")
        self.assertEqual(permissions.get("contents"), "read")
        self.assertEqual(permissions.get("security-events"), "write")


if __name__ == "__main__":
    unittest.main()
