Write-Host "Building APK..."
flutter build apk --release
if ($LASTEXITCODE -ne 0) { Write-Error "APK Build Failed"; exit 1 }

Write-Host "Building Web..."
flutter build web --release
if ($LASTEXITCODE -ne 0) { Write-Error "Web Build Failed"; exit 1 }

Write-Host "Generating version.json..."
$versionData = @{
    version = "1.0.1"
    buildNumber = 2
    downloadUrl = "https://adgen-pharmacy.web.app/app-release.bin"
}
$versionData | ConvertTo-Json | Set-Content -Path "build\web\version.json"

Write-Host "Copying APK to web build..."
Copy-Item "build\app\outputs\flutter-apk\app-release.apk" -Destination "build\web\app-release.bin"

Write-Host "Deploying to Firebase..."
firebase deploy --only hosting
