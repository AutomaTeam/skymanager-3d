@echo off
rem Lance le serveur local et ouvre le jeu dans le navigateur.
cd /d "%~dp0"
set PORT=8123

where python >nul 2>nul
if errorlevel 1 (
    echo Python est introuvable. Installe-le depuis python.org puis relance.
    pause
    exit /b 1
)

echo Demarrage du jeu sur http://localhost:%PORT%/
echo Ferme cette fenetre pour arreter le serveur.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%/"
python devserver.py %PORT%
pause
