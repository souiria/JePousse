Clear-Host
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   GÉNÉRATEUR DE BUILD CLOUD (EXPO EAS)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "1) Variante : Jeu Pousse" -ForegroundColor White
Write-Host "2) Variante : Demo Crèche" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan

$choixVariante = Read-Host "Entrez votre choix pour la crèche (1 ou 2)"

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "   FORMAT DE SORTIE" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "1) APK (Pour tester manuellement sur téléphone)" -ForegroundColor White
Write-Host "2) AAB (Pour uploader sur Google Play Store) 🚀" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Cyan

$choixFormat = Read-Host "Entrez votre choix pour le format (1 ou 2)"

# Détermination du profil de base (La crèche)
if ($choixVariante -eq "1") {
    $baseProfile = "jeupousse"
} elseif ($choixVariante -eq "2") {
    $baseProfile = "demo"
} else {
    Write-Host "❌ Choix de crèche invalide. Arrêt du script." -ForegroundColor Red
    Exit
}

# Détermination du profil final (Le format)
if ($choixFormat -eq "1") {
    $profile = $baseProfile
    $formatText = "APK"
} elseif ($choixFormat -eq "2") {
    $profile = "$baseProfile-store"
    $formatText = "AAB (Google Play)"
} else {
    Write-Host "❌ Format invalide. Arrêt du script." -ForegroundColor Red
    Exit
}

Write-Host "`n🚀 Lancement du build EAS Cloud pour $formatText avec le profil [$profile]..." -ForegroundColor Green
Write-Host "⚠️  Vérification : Assurez-vous que eas.json et app.config.js sont enregistrés.`n" -ForegroundColor Yellow

# Définition de la variable pour contourner l'absence de Git
$env:EAS_NO_VCS=1

# Exécution de la commande officielle EAS
eas build -p android --profile $profile