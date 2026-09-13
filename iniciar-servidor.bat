@echo off
echo Abriendo la app en http://localhost:8080 ...
start http://localhost:8080
python -m http.server 8080
