@echo off

echo Production Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Activating Environment
call conda activate OneEnv
echo    OneEnv Environment Activated

echo 3. Running migrations
python manage.py migrate

for /f "tokens=14" %%a in ('ipconfig ^| findstr IPv4') do set myIP=%%a
echo 4. Launching the WebApp 
start "" chrome http://%myIP%:8000

echo 5. Starting the server
python manage.py runserver %myIP%:8000
