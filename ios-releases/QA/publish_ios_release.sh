#!/bin/bash
set -eo pipefail

APP=""
IPA=""
CHANNEL="stable"
NOTES=""
MANDATORY=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --app)
            APP="$2"
            shift 2
            ;;
        --ipa)
            IPA="$2"
            shift 2
            ;;
        --channel)
            CHANNEL="$2"
            shift 2
            ;;
        --notes)
            NOTES="$2"
            shift 2
            ;;
        --mandatory)
            MANDATORY=1
            shift 1
            ;;
        *)
            echo "Opción desconocida: $1"
            exit 1
            ;;
    esac
done

if [ -z "$APP" ] || [ -z "$IPA" ]; then
    echo "Uso: publish_ios_release.sh --app [brujula|finanzas] --ipa </ruta/app.ipa> [--channel stable|beta] [--notes <texto>]"
    exit 1
fi

if [ ! -f "$IPA" ]; then
    echo "Error: el archivo IPA no existe: $IPA"
    exit 1
fi

MANDATORY_FLAG=""
if [ "$MANDATORY" -eq 1 ]; then
    MANDATORY_FLAG="--mandatory"
fi

if [ -n "$NOTES" ]; then
    python3 /Volumes/T7/PARA_MAC/Scripts/release_ios.py publish "$APP" "$IPA" --channel "$CHANNEL" $MANDATORY_FLAG --notes "$NOTES"
else
    python3 /Volumes/T7/PARA_MAC/Scripts/release_ios.py publish "$APP" "$IPA" --channel "$CHANNEL" $MANDATORY_FLAG
fi
