@REM For manual building of the backend and frontend containers,
@REM no need to use it unless you want to manually rebuild the containers, most cases will use the docker-compose file(docker-compose up --build)

@echo off

echo Checking if backend container exists...
docker ps -a --filter "name=backend" --format "{{.Names}}" | findstr backend >nul
if %errorlevel%==0 (
    echo Removing existing backend container...
    docker rm -f backend
)

echo Building backend...
docker build -t backend-container -f Dockerfile.server .
docker run -d -p 5000:5000 --name backend backend-container

echo Checking if frontend container exists...
docker ps -a --filter "name=frontend" --format "{{.Names}}" | findstr frontend >nul
if %errorlevel%==0 (
    echo Removing existing frontend container...
    docker rm -f frontend
)

echo Building frontend...
docker build -t frontend-container -f Dockerfile.client .
docker run -d -p 3000:3000 --name frontend frontend-container

echo Done!