Clear-Host
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   GÃ‰NÃ‰RATEUR WEB & DÃ‰PLOIEMENT NETLIFY" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "1) DÃ©ployer la variante : Jeu Pousse" -ForegroundColor White
Write-Host "2) DÃ©ployer la variante : Demo CrÃ¨che" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan

$choix = Read-Host "Entrez votre choix (1 ou 2)"

if ($choix -eq "1") {
    $variant = "jeupousse"
} elseif ($choix -eq "2") {
    $variant = "demo"
} else {
    Write-Host "âŒ Choix invalide. ArrÃªt du script." -ForegroundColor Red
    Exit
}

Write-Host "`nðŸ“¦ 1/2 Compilation du site Web pour [$variant]..." -ForegroundColor Green
Write-Host "âš ï¸  VÃ©rification : Injection de la variable d'environnement...`n" -ForegroundColor Yellow

# DÃ©finition de la variante pour app.config.js
$env:APP_VARIANT=$variant

# Ã‰tape 1 : Export de l'application Expo pour le Web (gÃ©nÃ¨re le dossier 'dist')
npx expo export

# VÃ©rification si la compilation a rÃ©ussi
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nâŒ Erreur lors de la compilation Expo Web. ArrÃªt." -ForegroundColor Red
    Exit
}

Write-Host "`nðŸš€ 2/2 Envoi et publication sur Netlify..." -ForegroundColor Green

# Ã‰tape 2 : DÃ©ploiement de production du dossier 'dist' sur Netlify
netlify deploy --prod --dir=dist

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nðŸŽ‰ DÃ©ploiement terminÃ© avec succÃ¨s pour $variant !" -ForegroundColor Green
} else {
    Write-Host "`nâŒ Le dÃ©ploiement Netlify a Ã©chouÃ©." -ForegroundColor Red
}
