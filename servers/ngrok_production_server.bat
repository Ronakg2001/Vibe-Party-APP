@echo off

echo ngrok Production Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Activating Environment
call conda activate OneEnv
echo    OneEnv Environment Activated

echo 3. Running migrations
python manage.py migrate

echo 4. starting tunnelling 
wt -w 0 nt -p "Command Prompt" cmd /c "ngrok http 192.168.29.135:8000"

echo 5. Launching the WebApp 
start "" chrome https://georgie-scapulohumeral-kyle.ngrok-free.dev

echo 6. Starting the server
python manage.py runserver 192.168.29.135:8000
