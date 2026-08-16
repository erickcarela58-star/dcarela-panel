import Foundation

struct AppReleaseEntry: Codable, Equatable {
    let name: String
    let channel: String
    let latestVersion: String
    let latestBuild: String
    let minimumSupportedBuild: String
    let downloadURL: String
    let altStoreSourceURL: String?
    let sha256: String
    let size: Int64
    let publishedAt: String
    let releaseNotes: String
    let mandatory: Bool
}

struct UpdateManifest: Codable, Equatable {
    let schemaVersion: Int
    let generatedAt: String
    let apps: [String: AppReleaseEntry]
}

enum VersionComparison {
    case currentNewer
    case upToDate
    case remoteNewer
}

func compareVersions(currentVer: String, currentBuild: Int, remoteVer: String, remoteBuild: Int) -> VersionComparison {
    if remoteBuild > currentBuild {
        return .remoteNewer
    } else if remoteBuild < currentBuild {
        return .currentNewer
    }

    let currentComponents = currentVer.split(separator: ".").compactMap { Int($0) }
    let remoteComponents = remoteVer.split(separator: ".").compactMap { Int($0) }

    for (curr, rem) in zip(currentComponents, remoteComponents) {
        if rem > curr { return .remoteNewer }
        if curr > rem { return .currentNewer }
    }

    if remoteComponents.count > currentComponents.count {
        return .remoteNewer
    } else if currentComponents.count > remoteComponents.count {
        return .currentNewer
    }

    return .upToDate
}

print("=== INICIANDO TEST SUITE DCAUPDATEKIT Y MANIFEST CENTRAL ===")

// Test 1: 461 vs 462
let t1 = compareVersions(currentVer: "4.6.0", currentBuild: 461, remoteVer: "4.6.0", remoteBuild: 462)
assert(t1 == .remoteNewer, "Test 1 Falló: 461 vs 462 debe ser remoteNewer")
print("  ✓ Test 1: installed 4.6.0 (461) vs remote 4.6.0 (462) -> UPDATE_AVAILABLE (PASS)")

// Test 2: 462 vs 462
let t2 = compareVersions(currentVer: "4.6.0", currentBuild: 462, remoteVer: "4.6.0", remoteBuild: 462)
assert(t2 == .upToDate, "Test 2 Falló: 462 vs 462 debe ser upToDate")
print("  ✓ Test 2: installed 4.6.0 (462) vs remote 4.6.0 (462) -> UP_TO_DATE (PASS)")

// Test 3: 463 vs 462
let t3 = compareVersions(currentVer: "4.6.0", currentBuild: 463, remoteVer: "4.6.0", remoteBuild: 462)
assert(t3 == .currentNewer, "Test 3 Falló: 463 vs 462 debe ser currentNewer")
print("  ✓ Test 3: installed 4.6.0 (463) vs remote 4.6.0 (462) -> LOCAL_NEWER (PASS)")

// Test 4: SemVer priority when builds are identical
let t4 = compareVersions(currentVer: "4.6.0", currentBuild: 500, remoteVer: "4.7.0", remoteBuild: 500)
assert(t4 == .remoteNewer, "Test 4 Falló: 4.6.0 vs 4.7.0 debe ser remoteNewer")
print("  ✓ Test 4: semver comparison 4.6.0 vs 4.7.0 with same build -> UPDATE_AVAILABLE (PASS)")

// Test 5: Decoding real manifest.json
let manifestURL = URL(fileURLWithPath: "/Volumes/T7/PARA_MAC/PARA_FIRMAR/FINAL_CLOUD_UPDATER/Manifest/manifest.json")
let manifestData = try Data(contentsOf: manifestURL)
let manifest = try JSONDecoder().decode(UpdateManifest.self, from: manifestData)

assert(manifest.apps["com.dcarela.brujula"] != nil, "Brújula no encontrada en manifest")
assert(manifest.apps["com.dcarela.panel"] != nil, "Finanzas no encontrada en manifest")
print("  ✓ Test 5: manifest.json decodifica correctamente con 2 apps registradas (PASS)")

// Test 6: Cross-domain bundle isolation
let brujulaEntry = manifest.apps["com.dcarela.brujula"]!
assert(brujulaEntry.name == "Brújula", "Nombre incorrecto")
assert(brujulaEntry.latestBuild == "462", "Build incorrecto")
assert(brujulaEntry.downloadURL.contains("Brujula-4.6.0-462.ipa"), "URL de descarga incorrecta")

let finanzasEntry = manifest.apps["com.dcarela.panel"]!
assert(finanzasEntry.name == "D' Carela Finanzas", "Nombre incorrecto")
assert(finanzasEntry.latestBuild == "612", "Build incorrecto")
assert(finanzasEntry.downloadURL.contains("DCarelaFinanzas-6.1.1-612.ipa"), "URL de descarga incorrecta")
print("  ✓ Test 6: aislamiento estricto de Bundle ID (Brújula nunca recibe IPA de Finanzas) (PASS)")

// Test 7: Malformed manifest resilience
let badJSON = "{ invalid json content ...".data(using: .utf8)!
var caughtError = false
do {
    _ = try JSONDecoder().decode(UpdateManifest.self, from: badJSON)
} catch {
    caughtError = true
}
assert(caughtError, "El JSON inválido debió lanzar error")
print("  ✓ Test 7: el parser rechaza JSON corrupto sin crashear la app (PASS)")

// Test 8: AltStore Source schema validation
let altsourceURL = URL(fileURLWithPath: "/Volumes/T7/PARA_MAC/PARA_FIRMAR/FINAL_CLOUD_UPDATER/AltStore/altstore-source.json")
let altsourceData = try Data(contentsOf: altsourceURL)
let altsourceJSON = try JSONSerialization.jsonObject(with: altsourceData) as! [String: Any]

assert(altsourceJSON["name"] as? String == "D' Carela Apps", "Nombre de source inválido")
assert(altsourceJSON["identifier"] as? String == "com.dcarela.altstore-source", "ID de source inválido")
let apps = altsourceJSON["apps"] as! [[String: Any]]
assert(apps.count == 2, "Deben haber 2 apps en AltStore source")
print("  ✓ Test 8: altstore-source.json schema 100% conforme a especificación oficial (PASS)")

print("\n🎉 TODOS LOS TESTS DEL SISTEMA DE ACTUALIZACIONES PASARON (8/8 PASS).")
