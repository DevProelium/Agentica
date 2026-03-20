# start-agentica.ps1 - Script para levantar la suite Agentica Inventory (POS + Inventory)
# Ejecutar como administrador si Docker requiere privilegios

Write-Host "=== AGENTICA INVENTORY - START SCRIPT ===" -ForegroundColor Cyan
Write-Host "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# 1. Verificar que Docker Desktop está corriendo
Write-Host "[1] Verificando Docker Desktop..." -ForegroundColor Yellow
try {
    $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
    if (-not $dockerVersion) {
        Write-Host "  ERROR: Docker Desktop no está corriendo o no está accesible." -ForegroundColor Red
        Write-Host "  Por favor, inicia Docker Desktop manualmente y vuelve a ejecutar este script." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  OK - Docker Desktop v$dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: No se pudo verificar Docker." -ForegroundColor Red
    exit 1
}

# 2. Navegar al directorio del proyecto (asumiendo que el script está en la raíz)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 3. Detener contenedores previos (si existen)
Write-Host "[2] Deteniendo contenedores previos..." -ForegroundColor Yellow
docker-compose down 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - Contenedores detenidos." -ForegroundColor Green
} else {
    Write-Host "  INFO: No había contenedores corriendo o ya estaban detenidos." -ForegroundColor Gray
}

# 4. Limpiar recursos no utilizados (opcional)
Write-Host "[3] Limpiando recursos Docker no utilizados..." -ForegroundColor Yellow
docker system prune -f 2>$null
Write-Host "  OK - Recursos limpiados." -ForegroundColor Green

# 5. Levantar los contenedores
Write-Host "[4] Levantando Agentica Inventory..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Falló docker-compose up." -ForegroundColor Red
    exit 1
}

# 6. Esperar a que los servicios estén saludables
Write-Host "[5] Esperando a que los servicios estén listos..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$healthy = $false

while ($attempt -lt $maxAttempts -and -not $healthy) {
    $attempt++
    Write-Host "  Intento $attempt/$maxAttempts..." -ForegroundColor Gray
    
    # Verificar salud de la API
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3011/api/health" -TimeoutSec 5 -ErrorAction Stop
        if ($response.status -eq 'ok') {
            $healthy = $true
            Write-Host "  OK - API respondiendo correctamente." -ForegroundColor Green
            break
        }
    } catch {
        Start-Sleep -Seconds 2
        if ($attempt -eq $maxAttempts) {
            Write-Host "  ADVERTENCIA: La API no respondió después de $maxAttempts intentos." -ForegroundColor Red
            Write-Host "  Pero los contenedores están levantados. Revisa los logs con: docker-compose logs api" -ForegroundColor Yellow
        }
    }
}

# 7. Mostrar información de los contenedores
Write-Host "[6] Estado de los contenedores:" -ForegroundColor Yellow
docker-compose ps

# 8. URLs de acceso
Write-Host ""
Write-Host "=== URLs DE ACCESO ===" -ForegroundColor Cyan
Write-Host "🔹 Agentica (POS + Inventory): http://localhost:3015/" -ForegroundColor White
Write-Host "🔹 API Health:                 http://localhost:3015/api/health" -ForegroundColor White
Write-Host "🔹 MinIO Console:              http://localhost:9101" -ForegroundColor White
Write-Host "   Usuario: minio_admin / Contraseña: minio_secret123" -ForegroundColor Gray
Write-Host ""
Write-Host "=== COMANDOS ÚTILES ===" -ForegroundColor Cyan
Write-Host "🔸 Ver logs en tiempo real:    docker-compose logs -f api" -ForegroundColor Gray
Write-Host "🔸 Detener todos:              docker-compose down" -ForegroundColor Gray
Write-Host "🔸 Reiniciar solo la API:      docker-compose restart api" -ForegroundColor Gray
Write-Host ""
Write-Host "=== NOTAS ===" -ForegroundColor Cyan
Write-Host "• Los contenedores están configurados con 'restart: unless-stopped'." -ForegroundColor Gray
Write-Host "  Se levantarán automáticamente si Docker se reinicia." -ForegroundColor Gray
Write-Host "• Embeddings: usando Qwen text‑embedding‑v3 (DashScope) via MuleRouter (cloud)." -ForegroundColor Gray
Write-Host "• Ollama local NO está corriendo (ahorro de recursos)." -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Agentica Inventory está levantado." -ForegroundColor Green
Write-Host "   Puedes cerrar esta ventana." -ForegroundColor Gray