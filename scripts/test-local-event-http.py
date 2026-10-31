#!/usr/bin/env python3
"""Pure launcher routing tests; no Docker, database, network, or services."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


TARGET = Path(__file__).with_name("local-event-http.py")
SPEC = importlib.util.spec_from_file_location("local_event_http", TARGET)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LauncherRoutingTests(unittest.TestCase):
    def test_default_contract_is_unchanged(self):
        self.assertEqual(
            MODULE.database_network(MODULE.DEFAULT_DB_CONTAINER),
            (MODULE.DEFAULT_DB_CONTAINER, ["--network", "supabase_network_bracket-fyi"]),
        )

    def test_owned_container_uses_loopback_namespace(self):
        self.assertEqual(
            MODULE.database_network(MODULE.OWNED_DB_CONTAINER),
            (MODULE.OWNED_DB_CONTAINER, ["--network", MODULE.OWNED_RUNTIME_NETWORK]),
        )

    def test_owned_network_is_created_and_only_owned_db_is_connected(self):
        inspected = [{"Labels": {"bracket.p11-owned": "true", "bracket.local-http": "true"},
                      "Containers": {}}]
        with patch.object(MODULE, "run", side_effect=[RuntimeError("missing"), "network-id", json.dumps(inspected), ""]):
            self.assertEqual(MODULE.ensure_owned_runtime_network(MODULE.OWNED_DB_CONTAINER), MODULE.OWNED_RUNTIME_NETWORK)

    def test_shared_network_is_not_inspected(self):
        with patch.object(MODULE, "run") as mocked:
            MODULE.ensure_owned_runtime_network(MODULE.DEFAULT_DB_CONTAINER)
        mocked.assert_not_called()

    def test_sql_propagates_selected_container_without_execution(self):
        completed = type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        with patch.object(MODULE.subprocess, "run", return_value=completed) as mocked:
            MODULE.sql("bracket_http_0123456789ab", "select 1", MODULE.OWNED_DB_CONTAINER)
        self.assertEqual(mocked.call_args.args[0][3], MODULE.OWNED_DB_CONTAINER)

    def test_invalid_container_is_rejected_before_subprocess(self):
        with patch.object(MODULE.subprocess, "run") as mocked:
            with self.assertRaises(ValueError):
                MODULE.start(MODULE.PIN, "supabase_db_other")
        mocked.assert_not_called()

    def test_database_names_remain_strictly_disposable(self):
        with self.assertRaises(RuntimeError):
            MODULE.sql("postgres", "select 1", MODULE.OWNED_DB_CONTAINER)


if __name__ == "__main__":
    unittest.main()
