@echo off
echo Starting server on http://localhost:40312
start http://localhost:40312
python -m http.server 40312
