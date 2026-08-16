#!/usr/bin/env python3
import os
import sys
import json
import hashlib
import argparse
import subprocess
import plistlib
import datetime

RELEASE_ROOT = "/Volumes/T7/PARA_MAC/PARA_FIRMAR/FINAL_CLOUD_UPDATER"
MANIFEST_PATH = os.path.join(RELEASE_ROOT, "Manifest", "manifest.json")
ALTSOURCE_PATH = os.path.join(RELEASE_ROOT, "AltStore", "altstore-source.json")
BASE_URL = "https://panel.dcarelacompufoto.com/ios-releases"
ALTSTORE_SOURCE_URL = f"{BASE_URL}/altstore-source.json"

APP_DEFS = {
    "brujula": {
        "name": "Brújula",
        "bundle_id": "com.dcarela.brujula",
        "folder": "Brujula",
        "developer": "D' Carela Studio",
        "subtitle": "Productividad, hábitos y lecturas",
        "description": "Sistema integral de productividad personal, gestión de lecturas y enfoque firme."
    },
    "finanzas": {
        "name": "D' Carela Finanzas",
        "bundle_id": "com.dcarela.panel",
        "folder": "Finanzas",
        "developer": "D' Carela Studio",
        "subtitle": "Operaciones financieras y panel POS",
        "description": "Control financiero y administrativo oficial para D' Carela Estudio Fotográfico."
    }
}

def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default
    return default

def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def extract_ipa_info(ipa_path):
    # Extracts bundle info using unzip -p to read Info.plist
    cmd = f"unzip -p '{ipa_path}' 'Payload/*.app/Info.plist'"
    res = subprocess.run(cmd, shell=True, capture_output=True)
    if res.returncode != 0 or not res.stdout:
        raise RuntimeError(f"Error extracting Info.plist from {ipa_path}")
    
    plist = plistlib.loads(res.stdout)
    bundle_id = plist.get("CFBundleIdentifier", "")
    version = plist.get("CFBundleShortVersionString", "1.0.0")
    build = str(plist.get("CFBundleVersion", "1"))
    name = plist.get("CFBundleDisplayName", plist.get("CFBundleName", "App"))
    size = os.path.getsize(ipa_path)
    sha256 = compute_sha256(ipa_path)
    
    return {
        "bundle_id": bundle_id,
        "version": version,
        "build": build,
        "name": name,
        "size": size,
        "sha256": sha256
    }

def publish_app(app_key, ipa_path, channel="stable", notes=None, mandatory=False):
    if app_key not in APP_DEFS:
        print(f"Error: unknown app '{app_key}'. Available: {list(APP_DEFS.keys())}")
        sys.exit(1)
        
    app_info = APP_DEFS[app_key]
    print(f"=== PUBLICANDO {app_info['name']} ({channel}) ===")
    print(f"Archivo IPA: {ipa_path}")
    
    # 1. Validar IPA
    val_script = "/Volumes/T7/PARA_MAC/Scripts/validate_ipa_altstore.sh"
    if os.path.exists(val_script):
        res = subprocess.run([val_script, ipa_path], capture_output=True, text=True)
        if "ALTSTORE_FORMAT_CANDIDATE = PASS" not in res.stdout:
            print(f"VALIDATION FAILED:\n{res.stdout}")
            sys.exit(1)
        print("  ✓ Validación AltStore / Mach-O arm64: PASS")
    
    # 2. Extraer metadatos reales del binario
    meta = extract_ipa_info(ipa_path)
    print(f"  ✓ Bundle ID: {meta['bundle_id']}")
    print(f"  ✓ Versión: {meta['version']} (Build {meta['build']})")
    print(f"  ✓ Tamaño: {meta['size'] / (1024*1024):.2f} MB")
    print(f"  ✓ SHA-256: {meta['sha256']}")
    
    today_str = datetime.date.today().isoformat()
    release_notes = notes or f"Actualización de estabilidad, mejoras en rendimiento y sincronización de {app_info['name']}."
    
    download_url = f"{BASE_URL}/{app_info['folder'].lower()}/{meta['version']}/{meta['build']}/{os.path.basename(ipa_path)}"
    
    # 3. Guardar estructura local en FINAL_CLOUD_UPDATER
    app_dir = os.path.join(RELEASE_ROOT, app_info["folder"], meta["version"], meta["build"])
    os.makedirs(app_dir, exist_ok=True)
    
    dest_ipa = os.path.join(app_dir, os.path.basename(ipa_path))
    if os.path.abspath(ipa_path) != os.path.abspath(dest_ipa):
        import shutil
        shutil.copy2(ipa_path, dest_ipa)
    
    # Escribir SHA256.txt y release.json
    with open(os.path.join(app_dir, "SHA256.txt"), "w", encoding="utf-8") as f:
        f.write(f"{meta['sha256']}  {os.path.basename(ipa_path)}\n")
        
    release_entry = {
        "name": app_info["name"],
        "bundle_id": meta["bundle_id"],
        "channel": channel,
        "version": meta["version"],
        "build": meta["build"],
        "size": meta["size"],
        "sha256": meta["sha256"],
        "download_url": download_url,
        "altstore_source_url": ALTSTORE_SOURCE_URL,
        "published_at": today_str,
        "release_notes": release_notes,
        "mandatory": mandatory
    }
    save_json(os.path.join(app_dir, "release.json"), release_entry)
    
    # 4. Actualizar AltStore Source
    altsource = load_json(ALTSOURCE_PATH, {
        "name": "D' Carela Apps",
        "identifier": "com.dcarela.altstore-source",
        "sourceURL": ALTSTORE_SOURCE_URL,
        "apps": []
    })
    
    found_app = False
    for a in altsource["apps"]:
        if a.get("bundleIdentifier") == meta["bundle_id"]:
            found_app = True
            # Check version existing
            v_exists = any(v.get("buildVersion") == meta["build"] for v in a.get("versions", []))
            if not v_exists:
                a["versions"].insert(0, {
                    "version": meta["version"],
                    "buildVersion": meta["build"],
                    "date": today_str,
                    "downloadURL": download_url,
                    "size": meta["size"],
                    "sha256": meta["sha256"],
                    "localizedDescription": release_notes
                })
            break
            
    if not found_app:
        altsource["apps"].append({
            "name": app_info["name"],
            "bundleIdentifier": meta["bundle_id"],
            "developerName": app_info["developer"],
            "subtitle": app_info["subtitle"],
            "localizedDescription": app_info["description"],
            "versions": [{
                "version": meta["version"],
                "buildVersion": meta["build"],
                "date": today_str,
                "downloadURL": download_url,
                "size": meta["size"],
                "sha256": meta["sha256"],
                "localizedDescription": release_notes
            }]
        })
    save_json(ALTSOURCE_PATH, altsource)
    print("  ✓ AltStore Source actualizada: altstore-source.json")
    
    # 5. Actualizar manifest.json al final (Publicación Atómica)
    manifest = load_json(MANIFEST_PATH, {
        "schemaVersion": 1,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "apps": {}
    })
    
    manifest["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    manifest["apps"][meta["bundle_id"]] = {
        "name": app_info["name"],
        "channel": channel,
        "latestVersion": meta["version"],
        "latestBuild": meta["build"],
        "minimumSupportedBuild": meta["build"] if mandatory else manifest["apps"].get(meta["bundle_id"], {}).get("minimumSupportedBuild", meta["build"]),
        "downloadURL": download_url,
        "altStoreSourceURL": ALTSTORE_SOURCE_URL,
        "sha256": meta["sha256"],
        "size": meta["size"],
        "publishedAt": today_str,
        "releaseNotes": release_notes,
        "mandatory": mandatory
    }
    save_json(MANIFEST_PATH, manifest)
    print("  ✓ Manifest central actualizado atómicamente: manifest.json")
    print("\n✅ PUBLICACIÓN COMPLETADA CON ÉXITO.")

def list_releases():
    manifest = load_json(MANIFEST_PATH, {"apps": {}})
    print("=== D' CARELA IOS RELEASES ===")
    for bid, item in manifest.get("apps", {}).items():
        print(f"\n• {item['name']} ({bid})")
        print(f"  - Canal: {item.get('channel', 'stable')}")
        print(f"  - Última Versión: {item.get('latestVersion')} (Build {item.get('latestBuild')})")
        print(f"  - Tamaño: {item.get('size', 0) / (1024*1024):.1f} MB")
        print(f"  - Publicado: {item.get('publishedAt')}")
        print(f"  - URL: {item.get('downloadURL')}")

def rollback(app_key, target_build):
    if app_key not in APP_DEFS:
        print(f"Error: unknown app '{app_key}'")
        sys.exit(1)
    app_info = APP_DEFS[app_key]
    bid = app_info["bundle_id"]
    manifest = load_json(MANIFEST_PATH, {"apps": {}})
    if bid not in manifest["apps"]:
        print(f"Error: {bid} not in manifest")
        sys.exit(1)
        
    print(f"Rollback {app_info['name']} to build {target_build}...")
    manifest["apps"][bid]["latestBuild"] = str(target_build)
    manifest["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save_json(MANIFEST_PATH, manifest)
    print(f"  ✓ Latest build cambiado a {target_build} en manifest.json")

def main():
    parser = argparse.ArgumentParser(description="D' Carela iOS Release Admin CLI")
    subparsers = parser.add_subparsers(dest="cmd")
    
    p_pub = subparsers.add_parser("publish", help="Publicar nueva versión de IPA")
    p_pub.add_argument("app", choices=["brujula", "finanzas"], help="Aplicación a publicar")
    p_pub.add_argument("ipa", help="Ruta al archivo IPA")
    p_pub.add_argument("--channel", default="stable", choices=["stable", "beta"], help="Canal de release")
    p_pub.add_argument("--notes", help="Notas de la versión")
    p_pub.add_argument("--mandatory", action="store_true", help="Marcar actualización como obligatoria")
    
    subparsers.add_parser("list", help="Listar releases publicados")
    
    p_roll = subparsers.add_parser("rollback", help="Cambiar release latest a un build anterior")
    p_roll.add_argument("app", choices=["brujula", "finanzas"])
    p_roll.add_argument("build", help="Número de build al que retroceder")
    
    args = parser.parse_args()
    if args.cmd == "publish":
        publish_app(args.app, args.ipa, channel=args.channel, notes=args.notes, mandatory=args.mandatory)
    elif args.cmd == "list":
        list_releases()
    elif args.cmd == "rollback":
        rollback(args.app, args.build)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
