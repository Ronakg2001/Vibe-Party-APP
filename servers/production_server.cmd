@echo off

echo Production Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Activating Environment
call conda activate OneEnv
echo    OneEnv Environment Activated

echo 3. Running migrations
python manage.py migrate

echo 4. Launching the WebApp 
start "" chrome http://192.168.29.135:8000

echo 5. Starting the server
python manage.py runserver 192.168.29.135:8000
