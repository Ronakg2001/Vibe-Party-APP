@echo off

echo Production Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Using project virtual environment
set PYTHON=E:\project\Party_connect_hub_redefine\.venv\Scripts\python.exe
echo    %PYTHON%

echo 3. Running migrations
%PYTHON% manage.py migrate

echo 4. Starting the server
%PYTHON% manage.py runserver 0.0.0.0:8000
