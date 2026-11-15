#!/usr/bin/env python3
"""Offline inspection of COPIES only. No migrations, purge or production writes."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import sys
import tarfile
import uuid

FORMAT = "akai-ito-memory-vault/v1"
TABLES = ("users", "memories", "memory_media", "comments", "couple_settings",
          "collections", "session", "passkeys", "auth_challenges", "session_presence", "_migrations")


def digest(file):
    h = hashlib.sha256()
    with open(file, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def inventory(data):
    if data.is_symlink() or not data.is_dir():
        raise ValueError("Unsafe data root")
    result = []
    for root, dirs, files in os.walk(data, followlinks=False):
        for name in dirs + files:
            p = Path(root, name)
            if p.is_symlink() or not (p.is_dir() or p.is_file()):
                raise ValueError("Unsupported persistent file type")
        for name in sorted(files):
            p = Path(root, name)
            result.append({"path": p.relative_to(data).as_posix(), "size": p.stat().st_size,
                           "sha256": digest(p)})
    return sorted(result, key=lambda entry: entry["path"])


def inspect(data, normalize=False):
    if data.is_symlink() or not data.is_dir():
        raise ValueError("Unsafe data root")
    database = data / "akai.sqlite"
    if not database.is_file() or database.is_symlink() or not (data / "media").is_dir():
        raise ValueError("Database or media directory absent")
    connection = sqlite3.connect(database.as_uri() + ("?mode=rw" if normalize else "?mode=ro"), uri=True)
    try:
        connection.execute("PRAGMA trusted_schema=OFF")
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity failed")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign keys failed")
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not set(TABLES[:5] + ("_migrations",)).issubset(tables):
            raise ValueError("Not an Akai Ito database")
        counts = {}
        logical = hashlib.sha256()
        for table in TABLES:
            if table not in tables:
                continue
            counts[table] = 0
            logical.update(table.encode())
            for row in connection.execute(f'SELECT * FROM "{table}" ORDER BY rowid'):
                counts[table] += 1
                logical.update(json.dumps(row, ensure_ascii=True, separators=(",", ":")).encode())
                logical.update(b"\n")
        references = set()
        for row in connection.execute("SELECT original,display,thumb FROM memory_media"):
            references.update(row)
        references.update(r[0] for r in connection.execute("SELECT avatar FROM users WHERE avatar IS NOT NULL"))
        for name in references:
            if not isinstance(name, str) or name in ("", ".", "..") or Path(name).name != name or "/" in name or "\\" in name:
                raise ValueError("Unsafe media reference")
            file = data / "media" / name
            if file.is_symlink() or not file.is_file() or file.stat().st_size == 0:
                raise ValueError("Missing or empty referenced media")
        migrations = [r[0] for r in connection.execute("SELECT name FROM _migrations ORDER BY name")]
        if not migrations or any(not re.fullmatch(r"[0-9]{4}_[a-z0-9_]+\.sql", str(n)) for n in migrations):
            raise ValueError("Migration registry invalid")
        if normalize:
            # Only the stopped-volume COPY: consolidate captured WAL before hashing.
            if connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0] != 0:
                raise ValueError("Copy WAL checkpoint busy")
        return {"healthy": True, "integrity": "ok", "foreignKeyErrors": 0, "missingMedia": 0,
                "counts": counts, "referencedMedia": len(references), "migrations": migrations,
                "logicalSha256": logical.hexdigest()}
    finally:
        connection.close()


def archive_members(archive):
    seen = set()
    for member in archive:
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or "\\" in member.name or any(ord(c) < 32 for c in member.name):
            raise ValueError("Unsafe archive path")
        normalized = path.as_posix()
        if normalized in ("", ".") and member.isdir():
            continue
        if not normalized or normalized in seen or not (member.isfile() or member.isdir()):
            raise ValueError("Duplicate path, link or special archive member")
        seen.add(normalized)
        yield member, normalized


def checksum(file):
    sidecar = Path(str(file) + ".sha256")
    if file.is_symlink() or sidecar.is_symlink() or file.stat().st_size == 0:
        raise ValueError("Invalid archive or checksum file")
    text = sidecar.read_text().strip()
    match = re.fullmatch(r"([a-fA-F0-9]{64}) [ *](.+)", text)
    if not match or match[2] != file.name or digest(file).lower() != match[1].lower():
        raise ValueError("Archive checksum mismatch")


def extract(file, target, copies=1):
    if target.exists() or target.is_symlink():
        raise ValueError("Extraction target already exists")
    # Audit every path and budget before writing any member.
    with tarfile.open(file, "r:*") as archive:
        total = sum(m.size for m, _ in archive_members(archive))
    if copies not in (1, 2, 3, 4, 5) or shutil.disk_usage(target.parent).free < total * copies + 16 * 1024 * 1024:
        raise ValueError("Insufficient extraction space")
    target.mkdir(mode=0o700)
    with tarfile.open(file, "r:*") as archive:
        for member, relative in archive_members(archive):
            dest = target / relative
            if member.isdir():
                dest.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with archive.extractfile(member) as source, open(dest, "xb") as output:
                    os.chmod(dest, 0o600)
                    shutil.copyfileobj(source, output, 1024 * 1024)


def atomic(file, content):
    if file.is_symlink():
        raise ValueError("Symlink state file")
    temp = file.parent / ("." + str(uuid.uuid4()) + ".tmp")
    with open(temp, "x") as stream:
        os.chmod(temp, 0o600)
        json.dump(content, stream, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, file)


def read_status(state):
    attempts = []
    for file in (state / "attempts").glob("*.json"):
        if file.is_symlink():
            raise ValueError("Symlink state")
        attempts.append(json.loads(file.read_text()))
    attempts.sort(key=lambda r: (r["startedAt"], r["id"]), reverse=True)
    backups = [r for r in attempts if r["operation"] == "backup"]
    successful = [r for r in backups if r["result"] == "success"]
    drills = [r for r in attempts if r["operation"] == "test-restore" and r["result"] == "success"]
    inventory_file = state / "inventory.json"
    if inventory_file.is_symlink():
        raise ValueError("Symlink inventory")
    return {"lastAttempt": backups[0] if backups else None,
            "lastSuccess": successful[0] if successful else None,
            "lastRestoreTest": drills[0] if drills else None,
            "inventory": json.loads(inventory_file.read_text()) if inventory_file.exists() else None}


def main():
    command, *args = sys.argv[1:]
    if command == "checksum":
        checksum(Path(args[0]).absolute())
    elif command == "extract":
        extract(Path(args[0]), Path(args[1]), int(args[2]) if len(args) > 2 else 1)
    elif command == "inspect":
        print(json.dumps(inspect(Path(args[0]).absolute(), "--normalize" in args)))
    elif command == "manifest":
        payload, run_id, kind, image, project = args
        payload = Path(payload).resolve()
        report = inspect(payload / "data", True)
        files = inventory(payload / "data")
        manifest = {"format": FORMAT, "id": run_id, "kind": kind, "appImage": image,
                    "project": project, "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "dataBytes": sum(f["size"] for f in files), "files": files, "report": report}
        atomic(payload / "manifest.json", manifest)
        print(json.dumps({k: v for k, v in manifest.items() if k != "files"}))
    elif command == "verify":
        payload = Path(args[0]).absolute()
        if payload.is_symlink() or (payload / "manifest.json").is_symlink() or not (payload / "manifest.json").is_file():
            raise ValueError("Unsafe payload or manifest")
        manifest = json.loads((payload / "manifest.json").read_text())
        if manifest.get("format") != FORMAT or inventory(payload / "data") != manifest.get("files"):
            raise ValueError("Snapshot files differ from manifest")
        report = inspect(payload / "data")
        if report != manifest["report"]:
            raise ValueError("Snapshot database differs from manifest")
        print(json.dumps({"healthy": True, "id": manifest["id"], "dataBytes": manifest["dataBytes"], "report": report}))
    elif command == "state":
        directory, run_id = args
        uuid.UUID(run_id)
        atomic(Path(directory) / (run_id + ".json"), json.load(sys.stdin))
    elif command == "status":
        print(json.dumps(read_status(Path(args[0]))))
    else:
        raise ValueError("Unknown operation")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, sqlite3.Error, tarfile.TarError, KeyError, TypeError) as error:
        # No SQL contents, paths or credentials in the public error output.
        print(json.dumps({"healthy": False, "error": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
