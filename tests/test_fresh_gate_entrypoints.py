#!/usr/bin/env python3
"""Exercise representative denials through fresh gate processes."""
import json
import subprocess
import sys
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CASES = (
    ("block_destructive_bash.py", "Bash", "aws --version"),
    ("block_destructive_powershell.py", "PowerShell", "terraform validate"),
    ("block_destructive_cmd.py", "Cmd", "kubectl get pods"),
)


class FreshGateEntrypointTest(unittest.TestCase):
    """Fresh processes preserve denial output and exit status."""

    def test_representative_denials_exit_two(self):
        for hook_name, tool_name, command in CASES:
            with self.subTest(hook=hook_name):
                payload = {
                    "hook_event_name": "PreToolUse",
                    "permission_mode": "default",
                    "tool_name": tool_name,
                    "tool_input": {"command": command},
                }
                result = subprocess.run(
                    [sys.executable, str(REPOSITORY_ROOT / "hooks" / hook_name)],
                    cwd=REPOSITORY_ROOT,
                    input=json.dumps(payload),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 2, result.stderr)
                output = json.loads(result.stdout)
                decision = output["hookSpecificOutput"]["permissionDecision"]
                self.assertEqual(decision, "deny")


if __name__ == "__main__":
    unittest.main()
