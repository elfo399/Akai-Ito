#!/usr/bin/env python3
"""Small offline safety tests: temporary synthetic data only."""
import importlib.util
import io
import json
from pathlib import Path
import shutil
import sqlite3
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("vault", ROOT / "scripts/vault-files.py")
vault = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vault)


class FilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="akai-vault-unit-")
        self.root = Path(self.temp.name)
        self.data = self.root / "data"
        self.data.mkdir()
        (self.data / "media").mkdir()
        db = sqlite3.connect(self.data / "akai.sqlite")
        db.execute("CREATE TABLE _migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)")
        for file in sorted((ROOT / "apps/api/migrations").glob("*.sql")):
            db.executescript(file.read_text())
            db.execute("INSERT INTO _migrations VALUES(?,?)", (file.name, "2026-11-15"))
        db.execute("INSERT INTO users(id,username,name,password) VALUES('u','test','Synthetic','hash')")
        db.execute("INSERT INTO memories(id,title,event_date,description,category,location,author_id,version,created_at,updated_at) VALUES('m','Synthetic','2026-11-15','','Viaggi','','u',1,'now','now')")
        db.execute("INSERT INTO memory_media(id,memory_id,position,is_cover,original,display,thumb) VALUES('p','m',0,1,'p.png','p.webp','p.thumb.webp')")
        db.commit()
        db.close()
        for name in ("p.png", "p.webp", "p.thumb.webp"):
            (self.data / "media" / name).write_bytes(b"synthetic photo bytes")

    def tearDown(self):
        self.temp.cleanup()

    def manifest(self):
        payload = self.root / "payload"
        payload.mkdir()
        shutil.copytree(self.data, payload / "data")
        report = vault.inspect(payload / "data", True)
        vault.atomic(payload / "manifest.json", {"format": vault.FORMAT, "files": vault.inventory(payload / "data"), "report": report})
        return payload

    def test_sqlite_counts_and_media(self):
        result = vault.inspect(self.data)
        self.assertEqual(result["counts"]["memories"], 1)
        self.assertEqual(result["referencedMedia"], 3)

    def test_corrupt_database(self):
        (self.data / "akai.sqlite").write_bytes(b"broken")
        with self.assertRaises(sqlite3.DatabaseError):
            vault.inspect(self.data)

    def test_missing_media(self):
        (self.data / "media/p.png").unlink()
        with self.assertRaises(ValueError):
            vault.inspect(self.data)

    def test_empty_media(self):
        (self.data / "media/p.png").write_bytes(b"")
        with self.assertRaises(ValueError):
            vault.inspect(self.data)

    def test_foreign_key_failure(self):
        db = sqlite3.connect(self.data / "akai.sqlite")
        db.execute("UPDATE memory_media SET memory_id='absent'")
        db.commit(); db.close()
        with self.assertRaises(ValueError):
            vault.inspect(self.data)

    def test_unsafe_media_reference(self):
        db = sqlite3.connect(self.data / "akai.sqlite")
        db.execute("UPDATE memory_media SET original='../secret'")
        db.commit(); db.close()
        with self.assertRaises(ValueError):
            vault.inspect(self.data)

    def test_symlink_inventory_rejected(self):
        (self.data / "media/link").symlink_to(self.data / "akai.sqlite")
        with self.assertRaises(ValueError):
            vault.inventory(self.data)

    def test_symlink_data_root_rejected(self):
        link = self.root / "linked-data"; link.symlink_to(self.data, target_is_directory=True)
        with self.assertRaises(ValueError):
            vault.inventory(link)
        with self.assertRaises(ValueError):
            vault.inspect(link)

    def test_copy_normalization_does_not_change_source(self):
        before = vault.digest(self.data / "akai.sqlite")
        self.manifest()
        self.assertEqual(vault.digest(self.data / "akai.sqlite"), before)

    def test_content_hash_detects_modified_photo(self):
        payload = self.manifest()
        expected = json.loads((payload / "manifest.json").read_text())["files"]
        (payload / "data/media/p.png").write_bytes(b"different photo")
        self.assertNotEqual(expected, vault.inventory(payload / "data"))

    def tar(self, name="file", kind=tarfile.REGTYPE):
        target = self.root / "test.tar"
        with tarfile.open(target, "w") as archive:
            member = tarfile.TarInfo(name)
            member.type = kind
            if kind == tarfile.REGTYPE:
                member.size = 3
                archive.addfile(member, io.BytesIO(b"abc"))
            else:
                member.linkname = "/tmp/secret"
                archive.addfile(member)
        return target

    def test_good_archive_and_dot_file_preserved(self):
        target = self.tar("./.persistent")
        vault.extract(target, self.root / "extract")
        self.assertEqual((self.root / "extract/.persistent").read_bytes(), b"abc")

    def test_traversal_and_absolute_paths(self):
        for name in ("../escape", "/escape", "a/../../escape", "a\\..\\escape"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                vault.extract(self.tar(name), self.root / "extract")
        self.assertFalse((self.root / "extract").exists())

    def test_links_devices_and_fifos_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE):
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                vault.extract(self.tar(kind=kind), self.root / "extract")

    def test_existing_destination_preserved(self):
        dest = self.root / "existing"; dest.mkdir(); (dest / "keep").write_text("keep")
        with self.assertRaises(ValueError):
            vault.extract(self.tar(), dest)
        self.assertEqual((dest / "keep").read_text(), "keep")

    def test_archive_truncated(self):
        file = self.tar(); file.write_bytes(file.read_bytes()[:520])
        with self.assertRaises(tarfile.TarError):
            vault.extract(file, self.root / "extract")

    def test_checksum_rejected_and_valid(self):
        file = self.tar()
        sidecar = Path(str(file) + ".sha256")
        sidecar.write_text("0" * 64 + "  " + file.name + "\n")
        with self.assertRaises(ValueError):
            vault.checksum(file)
        sidecar.write_text(vault.digest(file) + "  " + file.name + "\n")
        vault.checksum(file)

    def test_checksum_filename_injection_rejected(self):
        file = self.tar()
        Path(str(file) + ".sha256").write_text(vault.digest(file) + "  ../other\n")
        with self.assertRaises(ValueError):
            vault.checksum(file)

    def test_duplicate_archive_entry_rejected(self):
        file = self.tar()
        with tarfile.open(file, "a") as archive:
            member = tarfile.TarInfo("./file"); member.size = 3
            archive.addfile(member, io.BytesIO(b"def"))
        with self.assertRaises(ValueError):
            vault.extract(file, self.root / "extract")

    def test_atomic_state_rejects_symlink(self):
        file = self.root / "state"; file.symlink_to(self.root / "outside")
        with self.assertRaises(ValueError):
            vault.atomic(file, {"result": "success"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
