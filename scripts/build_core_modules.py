#!/usr/bin/env python3
"""Build/check the classic-script bundle from ordered feature source fragments.

We preserve one original IIFE scope. The parts are edit-time files, *not* ES
modules and must never be loaded as standalone browser scripts.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
MANIFEST = WEB / "assets" / "core-src" / "manifest.json"

def assemble():
    conf = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if conf.get("schemaVersion") != 1:
        raise ValueError("Unrecognized source manifest schema")
    parts = conf.get("parts")
    if not isinstance(parts, list) or len(parts) != 6 or len(set(parts)) != len(parts):
        raise ValueError("Expected six unique source parts")
    src_root = (WEB / conf["sourceRoot"]).resolve(strict=True)
    dest = (WEB / conf["entry"]).resolve()
    if src_root != MANIFEST.parent.resolve() or dest != (WEB / "assets/scripts/00-app-core.js").resolve():
        raise ValueError("Unexpected build path; refuse unsafe destination")
    contents = []
    for item in parts:
        if not isinstance(item, str) or Path(item).name != item or not item.endswith(".js"):
            raise ValueError("Unsafe manifest part name")
        target = (src_root / item).resolve(strict=True)
        if target.parent != src_root or not target.is_file():
            raise ValueError(f"Unsafe or missing source: {item}")
        part = target.read_bytes()
        if not part:
            raise ValueError(f"Empty source fragment: {item}")
        contents.append(part)
    output = b"".join(contents)
    if not output.startswith(b"\n(()=>{") or not output.rstrip().endswith(b"})();"):
        raise ValueError("The shared IIFE boundary was lost")
    return dest, output

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Fail if committed bundle is outdated")
    group.add_argument("--write", action="store_true", help="Intentionally regenerate the bundle")
    args = parser.parse_args()
    dest, contents = assemble()
    if args.write:
        # Write atomically so a failed write never leaves a half-built bundle.
        descriptor, name = tempfile.mkstemp(prefix=".core-build-", suffix=".tmp", dir=dest.parent)
        try:
            with os.fdopen(descriptor, "wb") as fp:
                fp.write(contents)
            os.replace(name, dest)
        finally:
            if os.path.exists(name):
                os.unlink(name)
    elif not dest.is_file() or dest.read_bytes() != contents:
        raise SystemExit("FAIL: core source parts do not match deployed bundle. Run --write and review the diff.")
    digest = hashlib.sha256(contents).hexdigest()
    print(f"PASS: core JS bundle {len(contents)} bytes SHA256 {digest} ({'written' if args.write else 'matched'})")

if __name__ == "__main__":
    main()
