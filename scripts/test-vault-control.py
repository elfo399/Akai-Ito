#!/usr/bin/env python3
"""Offline host-bridge validation; no Docker or real backup schedule is touched."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("control", Path(__file__).with_name("vault-control.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        deploy = self.base / 'deploy'
        deploy.mkdir()
        self.policy = self.base / 'policy.json'
        self.policy.write_text(json.dumps({'deploy': str(deploy), 'project': 'qa-vault', 'uid': os.getuid(), 'home': str(self.base)}))
        self.control = module.Control(self.policy)
        self.body = dict(destinationId='local', folder='diary', automatic=True, time='03:30', daily=7, weekly=4, monthly=6, localAcknowledged=True, keyAcknowledged=True, encryptionPassword='SyntheticKey2026!')

    def tearDown(self):
        self.temp.cleanup()

    def test_rejects_path_shell_schedule_and_type_injections(self):
        for values in [dict(folder='../diary'), dict(folder='$(id)'), dict(time='03:30\nExecStart=evil'), dict(daily=True), dict(automatic='true'), dict(encryptionPassword='anything\nEVIL=1'), dict(command='anything')]:
            with self.subTest(values=values), self.assertRaises(module.ControlError):
                self.control.validate({**self.body, **values})

    def test_local_requires_explicit_acknowledgement(self):
        with self.assertRaises(module.ControlError):
            self.control.target({**self.body, 'localAcknowledged': False}, True)

    def test_missing_mount_is_not_replaced_with_local_storage(self):
        with self.assertRaises(module.ControlError):
            self.control.target({**self.body, 'destinationId': 'mount:' + 'a' * 24}, True)

    def test_rejects_symlinks_and_nonprivate_targets(self):
        target, _ = self.control.target(self.body, True)
        target.chmod(0o755)
        with self.assertRaises(module.ControlError): self.control.target(self.body)
        target.rmdir()
        target.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(module.ControlError): self.control.target(self.body)

    def test_key_cannot_be_changed_and_never_returned(self):
        with patch.object(self.control, 'schedule'), patch.object(self.control, 'start_job', return_value={}), patch.object(self.control, 'automatic_active', return_value=False):
            self.control.configure(self.body)
            self.assertEqual(self.control.password_file.stat().st_mode & 0o777, 0o400)
            self.assertNotIn('SyntheticKey', json.dumps(self.control.status()))
            self.assertNotIn('encryptionPassword', self.control.settings_file.read_text())
            with self.assertRaises(module.ControlError): self.control.configure(self.body)
            second = {**self.body}; del second['encryptionPassword']
            self.control.configure(second)
            self.assertEqual(self.control.password_file.read_text().strip(), 'SyntheticKey2026!')

    def test_refuses_unmanaged_scheduler_units(self):
        self.control.user_units.mkdir(parents=True)
        (self.control.user_units / (self.control.unit + '.timer')).write_text('[Timer]\nOnCalendar=daily')
        with self.assertRaises(module.ControlError): self.control.schedule(False)

    def test_interrupted_job_is_reported_failed(self):
        module.files.atomic(self.control.latest_job, {'id': 'qa', 'result': 'running', 'queuedAt': 0})
        self.assertEqual(self.control.active_job()['result'], 'failed')

    def test_disable_during_prepare_prevents_late_timer_activation(self):
        module.files.atomic(self.control.settings_file, {**self.body, 'prepared': True, 'automatic': False})
        with patch.object(self.control, 'systemctl') as scheduler:
            self.control.schedule(True)
            scheduler.assert_not_called()

    def test_global_deployment_lock_blocks_configuration(self):
        import fcntl
        with (self.control.deploy / '.deploy.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with self.assertRaises(module.ControlError) as error: self.control.configure(self.body)
            self.assertEqual(error.exception.status, 409)


if __name__ == '__main__':
    os.umask(0o077)
    unittest.main()
