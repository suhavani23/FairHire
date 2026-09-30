# PowerShell launcher for Fairhire FastAPI Backend
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Starting Fairhire Backend on http://localhost:8000" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
