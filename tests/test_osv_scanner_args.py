#!/usr/bin/env python3
"""Keep the OSV-Scanner arguments valid for the v2 command line."""
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "osv-scanner.yml"
SCAN_JOBS = ("scan-scheduled", "scan-pr")
# OSV-Scanner v2 removed --skip-git and exits 127 on it. Git roots stay
# unscanned by default unless --include-git-root is passed.
REMOVED_FLAGS = ("--skip-git",)


class OsvScannerArgsTest(unittest.TestCase):
    """Each scan job passes only flags the v2 scanner accepts."""

    def setUp(self):
        self.jobs = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))["jobs"]

    def _scan_args(self, job_name: str) -> list[str]:
        """Return one job's scan arguments as a token list."""
        return self.jobs[job_name]["with"]["scan-args"].split()

    def test_no_job_passes_a_removed_flag(self):
        for job_name in SCAN_JOBS:
            with self.subTest(job=job_name):
                for flag in REMOVED_FLAGS:
                    self.assertNotIn(flag, self._scan_args(job_name))

    def test_jobs_still_scan_the_repository_recursively(self):
        for job_name in SCAN_JOBS:
            with self.subTest(job=job_name):
                self.assertEqual(self._scan_args(job_name), ["-r", "./"])


if __name__ == "__main__":
    unittest.main()
