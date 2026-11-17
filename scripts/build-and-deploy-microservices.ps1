# build-and-deploy-microservices.ps1
# Compila las 4 imágenes Docker de microservicios, las sube a Amazon ECR y aplica los manifiestos en EKS

param (
    [string]$AccountId = "463834454386",
    [string]$Region = "us-east-1",
    [string]$Tag = "8.1.0"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Compilando y Desplegando Microservicios en Amazon EKS    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$EcrRegistry = "${AccountId}.dkr.ecr.${Region}.amazonaws.com"
$RootPath = Resolve-Path "$PSScriptRoot\.."

# 1. Login en Amazon ECR
Write-Host "`n[1/4] Autenticando en Amazon ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $EcrRegistry

# 2. Definición de Microservicios
$Services = @(
    @{ Name = "bookstore-auth-service";      Path = "microservices/auth-service" },
    @{ Name = "bookstore-catalog-service";   Path = "microservices/catalog-service" },
    @{ Name = "bookstore-orders-service";    Path = "microservices/orders-service" },
    @{ Name = "bookstore-analytics-service"; Path = "microservices/analytics-service" }
)

# 3. Compilación y subida de imágenes Docker
Write-Host "`n[2/4] Construyendo y subiendo imágenes a ECR..." -ForegroundColor Yellow
foreach ($svc in $Services) {
    $repoName = $svc.Name
    $dockerfile = "$RootPath\$($svc.Path)\Dockerfile"
    $imageUri = "$EcrRegistry/${repoName}:$Tag"

    # Asegurar que el repositorio ECR existe
    try {
        aws ecr describe-repositories --repository-names $repoName --region $Region 2>&1 | Out-Null
    } catch {
        Write-Host "Creando repositorio ECR $repoName..." -ForegroundColor Gray
        aws ecr create-repository --repository-name $repoName --region $Region | Out-Null
    }

    Write-Host "--> Docker build: $repoName ($imageUri)" -ForegroundColor Cyan
    docker build -t $imageUri -f $dockerfile $RootPath

    Write-Host "--> Docker push: $imageUri" -ForegroundColor Cyan
    docker push $imageUri
}

# 4. Despliegue en Kubernetes (EKS)
Write-Host "`n[3/4] Aplicando manifiestos en Amazon EKS..." -ForegroundColor Yellow
kubectl apply -f "$RootPath\kubernetes\microservices\auth-deployment.yaml"
kubectl apply -f "$RootPath\kubernetes\microservices\catalog-deployment.yaml"
kubectl apply -f "$RootPath\kubernetes\microservices\orders-deployment.yaml"
kubectl apply -f "$RootPath\kubernetes\microservices\analytics-deployment.yaml"
kubectl apply -f "$RootPath\kubernetes\microservices\ingress.yaml"

Write-Host "`n[4/4] Verificando estado de los Pods en EKS..." -ForegroundColor Yellow
kubectl get pods -l "app in (auth-service, catalog-service, orders-service, analytics-service)"

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " ¡Microservicios y Patrón Saga desplegados con éxito en EKS! " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

