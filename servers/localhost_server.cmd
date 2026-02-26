@echo off

echo Localhost Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Activating Environment
call conda activate OneEnv
echo    OneEnv Environment Activated

echo 3. Running migrations
python manage.py migrate

echo 4. Launching the WebApp 
start "" chrome http://127.0.0.1:8000

echo 5. Starting the server
python manage.py runserver 127.0.0.1:8000
