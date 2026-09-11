Clear-Host
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   GENERATEUR DE BUILD CLOUD iOS (EXPO EAS)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "1) Variante : Jeu Pousse" -ForegroundColor White
Write-Host "2) Variante : Demo Creche" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan

$choixVariante = Read-Host "Entrez votre choix pour la creche (1 ou 2)"

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "   CANAL DE DISTRIBUTION iOS" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "1) Simulateur / Test interne" -ForegroundColor White
Write-Host "2) Production (TestFlight / App Store Connect) [STORE]" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Cyan

$choixFormat = Read-Host "Entrez votre choix pour le format (1 ou 2)"

# Determination du profil de base
if ($choixVariante -eq "1") {
    $baseProfile = "jeupousse"
} elseif ($choixVariante -eq "2") {
    $baseProfile = "demo"
} else {
    Write-Host "[X] Choix de creche invalide. Arret du script." -ForegroundColor Red
    Exit
}

# Determination du profil final selon les profils disponibles dans eas.json
if ($choixFormat -eq "1") {
    $profile = $baseProfile
    $formatText = "Test / Simulateur"
} elseif ($choixFormat -eq "2") {
    $profile = "$baseProfile-store"
    $formatText = "App Store (Production)"
} else {
    Write-Host "[X] Format invalide. Arret du script." -ForegroundColor Red
    Exit
}

Write-Host "`n>>> Lancement du build EAS Cloud iOS pour $formatText avec le profil [$profile]..." -ForegroundColor Green
Write-Host "(!) Verification : Assurez-vous que vos certificats Apple sont prets.`n" -ForegroundColor Yellow

# Definition de la variable pour contourner l'absence de Git si necessaire
$env:EAS_NO_VCS=1

# Execution de la commande officielle EAS pour iOS
eas build -p ios --profile $profile