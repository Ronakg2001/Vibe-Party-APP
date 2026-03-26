@echo off

echo Localhost Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Using project virtual environment
set PYTHON=E:\project\Party_connect_hub_redefine\.venv\Scripts\python.exe
echo    %PYTHON%

echo 3. Running migrations
%PYTHON% manage.py migrate

echo 4. Launching the WebApp
start "" chrome http://127.0.0.1:8000

echo 5. Starting the server
%PYTHON% manage.py runserver 127.0.0.1:8000
