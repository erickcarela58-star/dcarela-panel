#!/usr/bin/env python3
"""
validate_altstore_ipa_version.py
Automated Version Guard for AltStore IPAs and Feed Manifests.

Extracts Info.plist from the specified IPA and validates:
1. CFBundleIdentifier matches expected bundle ID
2. CFBundleShortVersionString matches expected version
3. CFBundleVersion matches expected build number
4. If source JSON / manifest JSON is provided, verifies consistency.
"""

import sys
import os
import json
import zipfile
import plistlib
import hashlib
import tempfile

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def extract_app_plist(ipa_path):
    with zipfile.ZipFile(ipa_path, 'r') as z:
        plist_files = [f for f in z.namelist() if f.startswith('Payload/') and f.endswith('.app/Info.plist') and f.count('/') == 2]
        if not plist_files:
            raise RuntimeError(f"No valid Payload/*.app/Info.plist found in {ipa_path}")
        with z.open(plist_files[0]) as pfile:
            return plistlib.load(pfile)

def validate_ipa(ipa_path, expected_bundle_id=None, expected_version=None, expected_build=None, source_json_path=None):
    print(f"=== VALIDATING IPA: {os.path.basename(ipa_path)} ===")
    if not os.path.exists(ipa_path):
        print(f"❌ ERROR: File does not exist: {ipa_path}")
        return False

    size = os.path.getsize(ipa_path)
    sha256 = compute_sha256(ipa_path)
    print(f"File Size : {size} bytes")
    print(f"SHA-256   : {sha256}")

    plist = extract_app_plist(ipa_path)
    bundle_id = plist.get('CFBundleIdentifier')
    version = plist.get('CFBundleShortVersionString')
    build = str(plist.get('CFBundleVersion'))

    print(f"IPA CFBundleIdentifier         : {bundle_id}")
    print(f"IPA CFBundleShortVersionString : {version}")
    print(f"IPA CFBundleVersion            : {build}")

    errors = []
    if expected_bundle_id and bundle_id != expected_bundle_id:
        errors.append(f"Bundle ID mismatch: expected '{expected_bundle_id}', got '{bundle_id}'")

    if expected_version and version != expected_version:
        errors.append(f"Version mismatch: expected '{expected_version}', got '{version}'")

    if expected_build and build != str(expected_build):
        errors.append(f"Build version mismatch: expected '{expected_build}', got '{build}'")

    if source_json_path and os.path.exists(source_json_path):
        print(f"--- Checking against source feed: {os.path.basename(source_json_path)} ---")
        with open(source_json_path, 'r') as sf:
            source_data = json.load(sf)
        
        # Match app in source feed
        app_entry = None
        for app in source_data.get('apps', []):
            if app.get('bundleIdentifier') == bundle_id or (bundle_id and bundle_id.startswith(app.get('bundleIdentifier', ''))):
                app_entry = app
                break

        if not app_entry:
            errors.append(f"App '{bundle_id}' not found in source feed {source_json_path}")
        else:
            versions = app_entry.get('versions', [])
            if not versions:
                errors.append(f"No versions defined for '{bundle_id}' in source feed")
            else:
                latest = versions[0]
                src_version = latest.get('version')
                src_build = str(latest.get('buildVersion'))
                src_size = latest.get('size')
                src_sha = latest.get('sha256')

                print(f"Source Latest Version : {src_version}")
                print(f"Source Latest Build   : {src_build}")
                print(f"Source Latest Size    : {src_size}")
                print(f"Source Latest SHA-256 : {src_sha}")

                if src_version != version:
                    errors.append(f"Source version '{src_version}' != IPA version '{version}'")
                if src_build != build:
                    errors.append(f"Source build '{src_build}' != IPA build '{build}'")
                if src_sha and src_sha.lower() != sha256.lower():
                    errors.append(f"Source SHA256 '{src_sha}' != actual IPA SHA256 '{sha256}'")

    if errors:
        print("❌ VALIDATION FAILED:")
        for err in errors:
            print(f"  - {err}")
        return False

    print("✅ VALIDATION PASSED: IPA and Source are perfectly aligned!")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: validate_altstore_ipa_version.py <ipa_path> [expected_bundle_id] [expected_version] [expected_build] [source_json_path]")
        sys.exit(1)

    ipa = sys.argv[1]
    b_id = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "-" else None
    ver = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "-" else None
    bld = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "-" else None
    src = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] != "-" else None

    success = validate_ipa(ipa, b_id, ver, bld, src)
    sys.exit(0 if success else 1)
