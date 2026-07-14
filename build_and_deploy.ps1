Write-Host "Bumping version in pubspec.yaml..."
$pubspecPath = "pubspec.yaml"
$pubspec = Get-Content $pubspecPath
$newPubspec = @()
$version = ""
$buildNumber = 0
$utf8NoBom = New-Object System.Text.UTF8Encoding $False

foreach ($line in $pubspec) {
    if ($line -match "^version:\s*(\d+)\.(\d+)\.(\d+)\+(\d+)$") {
        $major = [int]$matches[1]
        $minor = [int]$matches[2]
        $patch = [int]$matches[3]
        $buildNumber = [int]$matches[4]
        
        $patch++
        $buildNumber++
        
        $version = "$major.$minor.$patch"
        $line = "version: $version+$buildNumber"
        Write-Host "Bumped version to $version+$buildNumber"
    }
    $newPubspec += $line
}
$newPubspec | Set-Content $pubspecPath

Write-Host "Generating lib/core/utils/app_version.dart..."
$dartCode = @"
class AppVersion {
  static const String version = '$version';
  static const int buildNumber = $buildNumber;
  static String get displayVersion => 'v`$version';
}
"@
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "lib\core\utils\app_version.dart"), $dartCode, $utf8NoBom)

Write-Host "Building APK..."
flutter build apk --release
if ($LASTEXITCODE -ne 0) { Write-Error "APK Build Failed"; exit 1 }

Write-Host "Building Web..."
flutter build web --release
if ($LASTEXITCODE -ne 0) { Write-Error "Web Build Failed"; exit 1 }

Write-Host "Generating custom version data..."
$versionData = @{
    app_name = "pharmacy_erp"
    version = $version
    build_number = "$buildNumber"
    buildNumber = [int]$buildNumber
    package_name = "pharmacy_erp"
    downloadUrl = "https://adgen-pharmacy.web.app/app-release.bin"
}
$jsonString = $versionData | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "build\web\version.json"), $jsonString, $utf8NoBom)

Write-Host "Copying APK to web build..."
Copy-Item "build\app\outputs\flutter-apk\app-release.apk" -Destination "build\web\app-release.bin"

Write-Host "Deploying to Firebase..."
firebase deploy --only hosting
