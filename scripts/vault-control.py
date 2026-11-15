#!/usr/bin/env python3
"""Private, socket-activated host bridge. No TCP listener, arbitrary commands or web secrets."""
import datetime as dt
import fcntl
import hashlib
import hmac
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import socketserver
import stat
import struct
import subprocess
import sys
import threading
import time
import uuid

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vault_files", HERE / "vault-files.py")
files = importlib.util.module_from_spec(spec)
spec.loader.exec_module(files)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


class ControlError(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status


def read_json(path, default=None):
    if not path.exists():
        return default
    if path.is_symlink() or not path.is_file():
        raise ControlError("unsafe_configuration")
    return json.loads(path.read_text())


def write_text(path, text, mode=0o600):
    if path.is_symlink():
        raise ControlError("unsafe_configuration")
    temp = path.parent / ("." + str(uuid.uuid4()) + ".tmp")
    with temp.open("x") as stream:
        os.chmod(temp, mode)
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


class Control:
    def __init__(self, policy_path):
        self.policy_path = Path(policy_path).resolve()
        self.policy = read_json(self.policy_path)
        self.deploy = Path(self.policy["deploy"])
        self.project = self.policy["project"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]+", self.project):
            raise ControlError("unsafe_configuration")
        self.state = self.deploy / ".memory-vault"
        self.state.mkdir(mode=0o700, exist_ok=True)
        self.settings_file = self.state / "web-settings.json"
        self.env_file = self.state / "backup.env"
        self.password_file = self.state / "restic-password"
        self.latest_job = self.state / "web-job.json"
        self.lock = threading.RLock()
        self.unit = self.project + "-memory-vault"
        self.user_units = Path(self.policy["home"]) / ".config/systemd/user"

    def settings(self):
        return read_json(self.settings_file)

    def run(self, args, timeout=15, **kwargs):
        env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": self.policy["home"],
               "XDG_RUNTIME_DIR": f'/run/user/{self.policy["uid"]}', "LANG": "C.UTF-8",
               "MEMORY_VAULT_CONFIG": str(self.env_file)}
        return subprocess.run(args, env=env, timeout=timeout, check=False, **kwargs)

    def systemctl(self, *args, check=True):
        executable = self.policy.get("scheduler", "/usr/bin/systemctl")
        if executable != "/usr/bin/systemctl" and not self.policy.get("test_mode"):
            raise ControlError("unsafe_configuration")
        result = self.run([executable, "--user", *args], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if check and result.returncode:
            raise ControlError("scheduler_unavailable", 503)
        return result.returncode == 0

    def automatic_active(self):
        return self.systemctl("is-enabled", self.unit + ".timer", check=False) and self.systemctl("is-active", self.unit + ".timer", check=False)

    def destinations(self):
        local = self.deploy / "backups/memory-vault"
        probe = local if local.exists() else self.deploy
        result = [{"id": "local", "label": "Su questo Raspberry", "path": str(local), "local": True,
                   "availableBytes": shutil.disk_usage(probe).free, "writable": os.access(probe, os.W_OK)}]
        mounted = self.run(["findmnt", "--json", "--real", "--output", "TARGET,SOURCE,FSTYPE,UUID"], stdout=subprocess.PIPE)
        if mounted.returncode:
            return result

        def visit(entries):
            for entry in entries:
                target = str(entry.get("target", ""))
                path = Path(target)
                if entry.get("fstype") in {"ext4", "xfs", "btrfs", "vfat", "exfat", "cifs", "nfs", "nfs4"} and any(target.startswith(root + "/") or target == root for root in self.policy.get("mount_roots", ["/mnt", "/media", "/srv/backups", "/run/media"])) and path.is_dir():
                    identity = "|".join(str(entry.get(k) or "") for k in ("target", "source", "fstype", "uuid"))
                    try:
                        result.append({"id": "mount:" + hashlib.sha256(identity.encode()).hexdigest()[:24],
                                       "label": path.name or target, "path": str(path.resolve()), "local": False,
                                       "availableBytes": shutil.disk_usage(path).free, "writable": os.access(path, os.W_OK),
                                       "source": str(entry.get("source") or ""), "uuid": str(entry.get("uuid") or "")})
                    except OSError:
                        pass
                visit(entry.get("children", []))
        visit(json.loads(mounted.stdout).get("filesystems", []))
        return result

    def target(self, settings, create=False):
        selected = next((d for d in self.destinations() if d["id"] == settings["destinationId"]), None)
        if not selected or not selected["writable"]:
            raise ControlError("invalid_destination")
        if selected["local"] and not settings["localAcknowledged"]:
            raise ControlError("local_acknowledgement")
        base = Path(selected["path"])
        if create and selected["local"]:
            if base.is_symlink():
                raise ControlError("unsafe_destination")
            base.mkdir(mode=0o700, parents=True, exist_ok=True)
        target = base / settings["folder"]
        if target.is_symlink() or (target.exists() and not target.is_dir()):
            raise ControlError("unsafe_destination")
        if create:
            target.mkdir(mode=0o700, exist_ok=True)
        if target.exists() and stat.S_IMODE(target.stat().st_mode) & 0o077:
            raise ControlError("unsafe_destination")
        if target.parent.resolve() != base.resolve():
            raise ControlError("unsafe_destination")
        return target, selected

    @staticmethod
    def validate(body):
        required = {"destinationId", "folder", "automatic", "time", "daily", "weekly", "monthly", "localAcknowledged", "keyAcknowledged"}
        if not isinstance(body, dict) or not required.issubset(body) or set(body) - required - {"encryptionPassword"}:
            raise ControlError("invalid_configuration")
        if not isinstance(body["destinationId"], str) or not re.fullmatch(r"local|mount:[a-f0-9]{24}", body["destinationId"]):
            raise ControlError("invalid_destination")
        if not isinstance(body["folder"], str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}", body["folder"]):
            raise ControlError("unsafe_destination")
        for key in ("automatic", "localAcknowledged", "keyAcknowledged"):
            if type(body[key]) is not bool:
                raise ControlError("invalid_configuration")
        if not isinstance(body["time"], str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", body["time"]):
            raise ControlError("invalid_configuration")
        for key, limit in (("daily", 365), ("weekly", 104), ("monthly", 120)):
            if type(body[key]) is not int or not 0 <= body[key] <= limit:
                raise ControlError("invalid_configuration")
        password = body.get("encryptionPassword")
        if password is not None and (not isinstance(password, str) or not 12 <= len(password) <= 128 or any(ord(c) < 32 or ord(c) == 127 for c in password)):
            raise ControlError("password_required")
        return dict(body)

    def active_job(self):
        job = read_json(self.latest_job)
        if not job or job["result"] != "running":
            return job
        if not job.get("pid"):
            alive = time.time() - job.get("queuedAt", 0) < 30
        else:
            try:
                alive = Path(f'/proc/{job["pid"]}/stat').read_text().split()[21] == job.get("processStart")
            except OSError:
                alive = False
        if not alive:
            latest = read_json(self.latest_job)
            if latest and latest.get("result") != "running":
                return latest
            job.update(result="failed", error="interrupted", phase="interrupted", finishedAt=utc())
            files.atomic(self.latest_job, job)
        return job

    def guard(self):
        job = self.active_job()
        if job and job["result"] == "running":
            raise ControlError("busy", 409)
        lock = (self.deploy / ".deploy.lock").open("a")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock.close()
            raise ControlError("busy", 409)
        return lock

    def start_job(self, action):
        job = {"id": str(uuid.uuid4()), "action": action, "result": "running", "phase": "queued", "startedAt": utc(), "queuedAt": time.time()}
        files.atomic(self.latest_job, job)
        log = (self.state / ("web-" + job["id"] + ".log")).open("xb")
        try:
            subprocess.Popen([sys.executable, str(HERE / "vault-control.py"), "worker", str(self.policy_path), job["id"]], stdin=subprocess.DEVNULL, stdout=log, stderr=log, close_fds=True, start_new_session=True)
        except OSError:
            job.update(result="failed", error="operation_failed", phase="start_failed", finishedAt=utc())
            files.atomic(self.latest_job, job)
            raise ControlError("operation_failed", 503)
        finally:
            log.close()
        return {"jobId": job["id"]}

    def configure(self, body):
        body = self.validate(body)
        with self.lock, self.guard():
            target, selected = self.target(body, True)
            exists = self.password_file.exists()
            if exists and body.get("encryptionPassword") is not None:
                raise ControlError("key_already_configured")
            if not exists and (not body.get("encryptionPassword") or not body["keyAcknowledged"]):
                raise ControlError("password_required")
            # No old timer may start with a half-prepared configuration.
            self.schedule(False)
            if not exists:
                write_text(self.password_file, body["encryptionPassword"] + "\n", 0o400)
            public = {k: v for k, v in body.items() if k not in {"encryptionPassword", "keyAcknowledged"}}
            public.update(prepared=False, targetPath=str(target))
            env = {"BACKUP_DEPLOY_DIR": str(self.deploy), "COMPOSE_PROJECT_NAME": self.project,
                   "BACKUP_TARGET_DIR": str(target), "BACKUP_STATE_DIR": str(self.state),
                   "RESTIC_PASSWORD_FILE": str(self.password_file), "RESTIC_REPOSITORY": str(target / "repository"),
                   "BACKUP_REQUIRE_MOUNT": "false" if selected["local"] else "true",
                   "BACKUP_ALLOW_LOCAL_DESTINATION": "true" if selected["local"] else "false",
                   "BACKUP_MOUNT_POINT": selected["path"], "BACKUP_EXPECTED_SOURCE": selected.get("source", ""),
                   "BACKUP_EXPECTED_UUID": selected.get("uuid", ""),
                   "BACKUP_KEEP_DAILY": str(body["daily"]), "BACKUP_KEEP_WEEKLY": str(body["weekly"]), "BACKUP_KEEP_MONTHLY": str(body["monthly"]),
                   "BACKUP_AUTO_RETENTION": "true", "BACKUP_VERIFY_READ_DATA": "true",
                   "BACKUP_MIN_FREE_MB": "0" if self.policy.get("test_mode") else "1024"}
            write_text(self.env_file, "# Managed by Akai Ito backup settings\n" + "".join(k + "=" + shlex.quote(v) + "\n" for k, v in env.items()))
            files.atomic(self.settings_file, public)
            return self.start_job("prepare")

    def action(self, body):
        if not isinstance(body, dict) or set(body) != {"action"} or body["action"] not in {"backup", "verify", "test-restore", "disable"}:
            raise ControlError("invalid_action")
        with self.lock:
            if body["action"] == "disable":
                self.schedule(False)
                settings = self.settings()
                if settings:
                    settings["automatic"] = False
                    files.atomic(self.settings_file, settings)
                return {"disabled": True}
            with self.guard():
                settings = self.settings()
                if not settings or not settings.get("prepared"):
                    raise ControlError("not_ready")
                self.target(settings)
                return self.start_job(body["action"])

    def schedule(self, enabled):
        timer = self.user_units / (self.unit + ".timer")
        marker = "# Managed by Akai Ito backup settings\n"
        for path in (timer, self.user_units / (self.unit + ".service")):
            if path.exists() and (path.is_symlink() or not path.read_text().startswith(marker)):
                raise ControlError("unsafe_schedule")
        if not enabled:
            if timer.exists():
                self.systemctl("disable", "--now", self.unit + ".timer")
            return
        settings = self.settings()
        if not settings or not settings.get("prepared"):
            raise ControlError("not_ready")
        if not settings.get("automatic"):
            return
        self.user_units.mkdir(parents=True, mode=0o700, exist_ok=True)
        def quote(value):
            return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
        service = marker + "[Unit]\nDescription=Akai Ito encrypted diary backup\n[Service]\nType=oneshot\n" \
            + "Environment=" + quote("MEMORY_VAULT_CONFIG=" + str(self.env_file)) + "\n" \
            + "ExecStartPre=/usr/bin/python3 " + quote(HERE / "vault-control.py") + " wait-docker " + quote(self.policy_path) + "\n" \
            + "ExecStart=/bin/bash " + quote(HERE / "memory-vault.sh") + " backup scheduled\n" \
            + "UMask=0077\nNice=10\nIOSchedulingClass=best-effort\nIOSchedulingPriority=7\nTimeoutStartSec=6h\nTimeoutStopSec=240\nKillMode=mixed\n"
        write_text(self.user_units / (self.unit + ".service"), service)
        write_text(timer, marker + "[Unit]\nDescription=Daily Akai Ito backup\n[Timer]\nOnCalendar=*-*-* " + settings["time"] + ":00 Europe/Rome\nPersistent=true\nUnit=" + self.unit + ".service\n[Install]\nWantedBy=timers.target\n")
        self.systemctl("daemon-reload")
        self.systemctl("enable", "--now", self.unit + ".timer")
        if not self.automatic_active():
            raise ControlError("scheduler_unavailable", 503)

    def status(self):
        settings = self.settings()
        target = None
        available = False
        if settings:
            try:
                target, _ = self.target(settings)
                available = target.is_dir()
            except (ControlError, OSError):
                pass
        status = files.read_status(self.state)
        job = self.active_job()
        return {"available": True, "destinations": [{k: v for k, v in d.items() if k not in {"source", "uuid"}} for d in self.destinations()],
                "configuration": {k: v for k, v in settings.items() if k not in {"prepared", "targetPath"}} if settings else None,
                "keyConfigured": self.password_file.is_file(), "ready": bool(settings and settings.get("prepared") and available),
                "automaticActive": self.automatic_active() if settings else False, "targetPath": str(target) if target else None,
                "job": {k: v for k, v in job.items() if k not in {"pid", "processStart", "queuedAt"}} if job else None,
                "lastAttempt": status["lastAttempt"], "lastSuccess": status["lastSuccess"], "lastRestoreTest": status["lastRestoreTest"],
                "snapshotCount": (status["inventory"] or {}).get("count", 0)}

    def worker(self, job_id):
        job = read_json(self.latest_job)
        if not job or job["id"] != job_id or job["result"] != "running":
            return
        job.update(pid=os.getpid(), processStart=Path(f"/proc/{os.getpid()}/stat").read_text().split()[21], phase=job["action"])
        files.atomic(self.latest_job, job)
        try:
            def cli(action):
                result = self.run(["/bin/bash", str(HERE / "memory-vault.sh"), action], timeout=21600)
                if result.returncode:
                    raise ControlError("busy" if result.returncode == 75 else "operation_failed")
            if job["action"] == "prepare":
                settings = self.settings()
                target, _ = self.target(settings)
                if not (target / ".memory-vault-repository.json").exists():
                    cli("init")
                cli("list")
                settings["prepared"] = True
                files.atomic(self.settings_file, settings)
                # An automatic schedule starts only after its first real copy succeeds.
                if settings["automatic"]:
                    cli("backup")
                    self.schedule(True)
            else:
                cli(job["action"])
            job.update(result="success", phase="complete", finishedAt=utc())
        except (ControlError, OSError, subprocess.SubprocessError) as error:
            job.update(result="failed", phase="failed", error=error.code if isinstance(error, ControlError) else "operation_failed", finishedAt=utc())
        files.atomic(self.latest_job, job)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def handle_request(self, post):
        try:
            uid = struct.unpack("3i", self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]
            control = self.server.control
            if uid != control.policy["uid"] and not (control.policy.get("test_mode") and uid == 0):
                raise ControlError("unauthorized", 403)
            key = Path(control.policy["key_file"]).read_text().strip()
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + key):
                raise ControlError("unauthorized", 403)
            if self.headers.get("Transfer-Encoding") or int(self.headers.get("Content-Length", "0")) > 16384:
                raise ControlError("invalid_request")
            self.connection.settimeout(10)
            self.server.last_request = time.monotonic()
            if not post and self.path == "/status":
                data = control.status()
            elif post and self.path in {"/configure", "/actions"}:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 16384:
                    raise ControlError("invalid_request")
                body = json.loads(self.rfile.read(size))
                data = control.configure(body) if self.path == "/configure" else control.action(body)
            else:
                raise ControlError("not_found", 404)
            self.send_json(200, data)
        except ControlError as error:
            self.send_json(error.status, {"error": error.code})
        except (ValueError, TypeError, OSError, subprocess.SubprocessError):
            self.send_json(503, {"error": "operation_failed"})

    def do_GET(self):
        self.handle_request(False)

    def do_POST(self):
        self.handle_request(True)

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    operation, policy_path = sys.argv[1:3]
    control = Control(policy_path)
    if operation == "worker":
        control.worker(sys.argv[3])
        return
    if operation == "wait-docker":
        for _ in range(90):
            if control.run(["docker", "info"], timeout=5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                return
            time.sleep(1)
        sys.exit(1)
    if operation != "serve":
        raise ControlError("invalid_operation")
    address = control.policy["socket"]
    activated = os.environ.get("LISTEN_FDS") == "1" and os.environ.get("LISTEN_PID") == str(os.getpid())
    if not activated:
        # Manual binding is used by isolated QA only; production uses systemd fd 3.
        if not control.policy.get("test_mode"):
            raise ControlError("socket_activation_required")
        server = Server(address, Handler)
        os.chmod(address, 0o600)
        if os.getuid() == 0:
            os.chown(address, control.policy["uid"], control.policy["uid"])
    else:
        server = Server(address, Handler, bind_and_activate=False)
        server.socket = socket.socket(fileno=3)
    server.control = control
    server.timeout = 20
    server.last_request = time.monotonic()
    try:
        while time.monotonic() - server.last_request < 300 or (control.active_job() or {}).get("result") == "running":
            server.handle_request()
    finally:
        server.server_close()


if __name__ == "__main__":
    os.umask(0o077)
    main()
