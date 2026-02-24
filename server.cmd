@echo off

echo 1.localhost
echo 2.production
set /p server=


CHDIR /d E:\project\Party_connect_hub_redefine
echo 1. Directory Changed

echo 2. Activating Environment
call conda activate OneEnv
echo    OneEnv Environment Activated

echo 3. Running migrations
python manage.py migrate


if "%server%" == "1" (
    echo 4. Launching the WebApp 
    start "" chrome http://127.0.0.1:8000

    echo 5. Starting the server
    python manage.py runserver 127.0.0.1:8000
)

if "%server%" == "2" (
    echo 4. starting tunnelling 
    wt -w 0 nt -p "Command Prompt" cmd /c "ngrok http 192.168.29.135:8000"

    echo 5. Launching the WebApp 
    start "" chrome https://georgie-scapulohumeral-kyle.ngrok-free.dev

    echo 6. Starting the server
    python manage.py runserver 192.168.29.135:8000
)
