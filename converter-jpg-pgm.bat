@echo off
REM Script de conversão JPG para PGM
REM Requer ImageMagick instalado

echo Convertendo arquivos JPG para PGM...

for %%f in (*.jpg *.jpeg) do (
    echo Convertendo %%f...
    magick "%%f" -colorspace Gray "%%~nf.pgm"
)

echo Conversao concluida!
echo Arquivos PGM criados na pasta atual.
pause