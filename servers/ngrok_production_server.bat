@echo off

echo ngrok Production Server

CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Activating Environment
call conda activate OneEnv
echo    OneEnv Environment Activated

echo 3. Running migrations
python manage.py migrate

for /f "tokens=14" %%a in ('ipconfig ^| findstr IPv4') do set myIP=%%a
echo 4. starting tunnelling 
wt -w 0 nt -p "Command Prompt" cmd /c "ngrok http %myIP%:8000"

echo 5. Launching the WebApp 
start "" chrome https://georgie-scapulohumeral-kyle.ngrok-free.dev

echo 6. Starting the server
python manage.py runserver %myIP%:8000
