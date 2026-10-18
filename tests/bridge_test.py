import importlib.util
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("bridge", Path(__file__).resolve().parents[1] / "bridge/server.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
REQUEST = {"provider": "codex", "model": "", "data": {"groups": [], "instructions": "", "channels": [{"id": "/@test", "title": "测试频道", "description": "音乐教学"}]}}
RESULT = {"suggestions": [{"channelId": "/@test", "groups": ["音乐"], "reason": "简介", "certainty": "medium"}]}


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

        def runner(request, executables):
            self.calls.append(request)
            return RESULT

        self.server = bridge.Broker(("127.0.0.1", 0), "test-only-pairing", runner=runner)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method, path, data=None, extra=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=3)
        headers = {"Authorization": "Bearer test-only-pairing", "Content-Type": "application/json", "Origin": "chrome-extension://" + "a" * 32}
        headers.update(extra or {})
        body = json.dumps(data).encode() if data is not None else None
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read()), dict(response.getheaders())
        connection.close()
        return result

    def test_authenticated_job_roundtrip(self):
        status, body, headers = self.request("POST", "/jobs", REQUEST)
        self.assertEqual(status, 202)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "chrome-extension://" + "a" * 32)
        for _ in range(30):
            status, result, _ = self.request("GET", "/jobs/" + body["id"])
            if result["status"] == "done":
                break
            time.sleep(0.01)
        self.assertEqual(result["result"], RESULT)
        self.assertEqual(len(self.calls), 1)

    def test_origin_host_token_and_input_rejections_do_not_run_models(self):
        for headers, expected in [({"Authorization": "Bearer wrong"}, 401), ({"Origin": "https://www.youtube.com"}, 403), ({"Host": "evil.test"}, 403)]:
            self.assertEqual(self.request("POST", "/jobs", REQUEST, headers)[0], expected)
        self.assertEqual(self.request("POST", "/jobs", {**REQUEST, "provider": "arbitrary-command"})[0], 400)
        self.assertEqual(self.request("POST", "/jobs", {**REQUEST, "model": "--bad-flag"})[0], 400)
        self.assertEqual(self.request("GET", "/anything")[0], 404)
        self.assertEqual(self.calls, [])

    def test_preflight_does_not_require_token_but_rejects_web_origins(self):
        self.assertEqual(self.request("OPTIONS", "/jobs", extra={"Authorization": ""})[0], 200)
        self.assertEqual(self.request("OPTIONS", "/jobs", extra={"Origin": "https://evil.test"})[0], 403)

    def test_runner_failure_is_reported_without_raw_diagnostics(self):
        def fail(*args):
            raise RuntimeError("sensitive fake diagnostic")
        self.server.runner = fail
        _, body, _ = self.request("POST", "/jobs", REQUEST)
        for _ in range(30):
            _, result, _ = self.request("GET", "/jobs/" + body["id"])
            if result["status"] != "running":
                break
            time.sleep(0.01)
        self.assertEqual(result["status"], "error")
        self.assertNotIn("sensitive", result["error"])


class CliTests(unittest.TestCase):
    def test_subscription_environment_drops_api_credentials(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fake", "ANTHROPIC_API_KEY": "fake", "CLAUDECODE": "fake"}):
            environment = bridge.subscription_env()
        self.assertNotIn("OPENAI_API_KEY", environment)
        self.assertNotIn("ANTHROPIC_API_KEY", environment)
        self.assertNotIn("CLAUDECODE", environment)

    def test_fixed_cli_commands_disable_tools_and_accept_prompt_via_stdin(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for provider in ("codex", "claude"):
                command = bridge.build_command(provider, "/fake/" + provider, "test-model", directory)
                self.assertEqual(command[0], "/fake/" + provider)
                self.assertEqual(command[command.index("--model") + 1], "test-model")
                if provider == "codex":
                    self.assertIn("read-only", command)
                    self.assertIn("shell_tool", command)
                    self.assertIn("--ignore-user-config", command)
                else:
                    self.assertEqual(command[command.index("--tools") + 1], "")
                    self.assertIn("--restricted", command)
                    self.assertIn("--strict-mcp-config", command)

    def test_actual_subprocess_adapters_with_disposable_fake_executables(self):
        # Executes only these test scripts, never the installed model CLIs.
        with tempfile.TemporaryDirectory() as temporary:
            executable = Path(temporary) / "fake-provider"
            executable.write_text("#!/usr/bin/env python3\nimport json,sys,pathlib\ndata=sys.stdin.read()\nassert '音乐教学' in data\nresult=" + repr(RESULT) + "\nif '--output-last-message' in sys.argv:\n pathlib.Path(sys.argv[sys.argv.index('--output-last-message')+1]).write_text(json.dumps(result))\nelse:\n print(json.dumps({'structured_output':result}))\n", encoding="utf-8")
            executable.chmod(0o700)
            for provider in ("codex", "claude"):
                request = bridge.validate_request({**REQUEST, "provider": provider})
                self.assertEqual(bridge.run_cli(request, {provider: str(executable)}), RESULT)

    def test_timed_out_fake_model_is_killed_and_registry_is_cleared(self):
        with tempfile.TemporaryDirectory() as temporary:
            executable = Path(temporary) / "fake-slow-provider"
            executable.write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(10)\n")
            executable.chmod(0o700)
            with self.assertRaisesRegex(ValueError, "超时"):
                bridge.run_cli(bridge.validate_request(REQUEST), {"codex": str(executable)}, timeout=0.1)
            self.assertEqual(bridge.ACTIVE_PROCESSES, set())


if __name__ == "__main__":
    unittest.main()
