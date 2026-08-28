$scriptContent = @'
Clear-Host
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   GÉNÉRATEUR WEB & DÉPLOIEMENT NETLIFY" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "1) Déployer la variante : Jeu Pousse" -ForegroundColor White
Write-Host "2) Déployer la variante : Demo Crèche" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan

$choix = Read-Host "Entrez votre choix (1 ou 2)"

if ($choix -eq "1") {
    $variant = "jeupousse"
} elseif ($choix -eq "2") {
    $variant = "demo"
} else {
    Write-Host "❌ Choix invalide. Arrêt du script." -ForegroundColor Red
    Exit
}

Write-Host "`n📦 1/2 Compilation du site Web pour [$variant]..." -ForegroundColor Green
Write-Host "⚠️  Vérification : Injection de la variable d'environnement...`n" -ForegroundColor Yellow

# Définition de la variante pour app.config.js
$env:APP_VARIANT=$variant

# Étape 1 : Export de l'application Expo pour le Web (génère le dossier 'dist')
npx expo export

# Vérification si la compilation a réussi
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Erreur lors de la compilation Expo Web. Arrêt." -ForegroundColor Red
    Exit
}

Write-Host "`n🚀 2/2 Envoi et publication sur Netlify..." -ForegroundColor Green

# Étape 2 : Déploiement de production du dossier 'dist' sur Netlify
netlify deploy --prod --dir=dist

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 Déploiement terminé avec succès pour $variant !" -ForegroundColor Green
} else {
    Write-Host "`n❌ Le déploiement Netlify a échoué." -ForegroundColor Red
}
'@

Set-Content -Path .\deploy-web.ps1 -Value $scriptContent -Encoding UTF8