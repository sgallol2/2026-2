# Despliegue de Microservicios en Amazon EKS y Frontend en CloudFront + S3 (Guía CLI)

**Propósito:** Desplegar la nueva arquitectura desacoplada de BookStore Co.:

- 4 Microservicios contenerizados en **Amazon EKS** (`auth`, `catalog`, `orders`, `analytics`).
- Comunicación inter-servicio mediante **gRPC** en el puerto `50052`.
- Transacciones distribuidas gestionadas con el **Patrón Saga por Orquestación**.
- Telemetría en tiempo real con el contenedor **Sidecar Fluent Bit** hacia Amazon Kinesis.
- Frontend desacoplado servido globalmente con **Amazon CloudFront** y **Amazon S3**.

> [!IMPORTANT]
> **Prerrequisitos obligatorios:**
>
> 1. Haber ejecutado [PREREQS-CLI.md](PREREQS-CLI.md) (VPC, Subredes, RDS PostgreSQL y Clúster EKS `my-cluster`).
> 2. Haber ejecutado la **Sección 6** de [LAB-SIDECAR-CLI.md](LAB-SIDECAR-CLI.md) (Bucket S3 Data Lake y Kinesis Firehose Stream `bookstore-clickstream-stream`).

---

## Paso 0: Cargar Variables de Sesión (CMD de Windows)

Si guardaste tu archivo `vars.cmd`, ejecútalo directamente:

```cmd
vars.cmd
```

O define manualmente las variables de tu cuenta:

```cmd
set ACCOUNT_ID=683090163663
set REGION=us-east-1
set REGISTRY=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com
set IMAGE_TAG=8.1.0
set APP_DB_PASSWORD=AppSecurePassword2026!
```

Recupera el endpoint de tu RDS creado en los prerrequisitos:

```cmd
aws rds describe-db-instances --db-instance-identifier bookstore-db --query "DBInstances[0].Endpoint.Address" --output text
```

```cmd
set RDS_ENDPOINT=<PEGA_AQUI_EL_ENDPOINT>
```

---

## Paso 1: Crear los 4 Repositorios en Amazon ECR

```cmd
aws ecr create-repository --repository-name bookstore-auth-service --region %REGION%
aws ecr create-repository --repository-name bookstore-catalog-service --region %REGION%
aws ecr create-repository --repository-name bookstore-orders-service --region %REGION%
aws ecr create-repository --repository-name bookstore-analytics-service --region %REGION%
```

> [!NOTE]
> Si alguno ya existe, puedes ignorar el mensaje de `RepositoryAlreadyExistsException`.

---

## Paso 2: Compilar y Publicar las Imágenes Docker en ECR

### 2.1 Autenticar Docker con Amazon ECR

```cmd
aws ecr get-login-password --region %REGION% > %TEMP%\ecr_pass.txt
type %TEMP%\ecr_pass.txt | docker login --username AWS --password-stdin %REGISTRY%
del %TEMP%\ecr_pass.txt
```

### 2.2 Compilar y Subir Microservicio 1: Auth Service

```cmd
docker build -t %REGISTRY%/bookstore-auth-service:%IMAGE_TAG% -f microservices/auth-service/Dockerfile .
docker push %REGISTRY%/bookstore-auth-service:%IMAGE_TAG%
```

### 2.3 Compilar y Subir Microservicio 2: Catalog Service (Con Servidor gRPC)

```cmd
docker build -t %REGISTRY%/bookstore-catalog-service:%IMAGE_TAG% -f microservices/catalog-service/Dockerfile .
docker push %REGISTRY%/bookstore-catalog-service:%IMAGE_TAG%
```

### 2.4 Compilar y Subir Microservicio 3: Orders Service (Orquestador Saga + Cliente gRPC)

```cmd
docker build -t %REGISTRY%/bookstore-orders-service:%IMAGE_TAG% -f microservices/orders-service/Dockerfile .
docker push %REGISTRY%/bookstore-orders-service:%IMAGE_TAG%
```

### 2.5 Compilar y Subir Microservicio 4: Analytics Service (Con Sidecar)

```cmd
docker build -t %REGISTRY%/bookstore-analytics-service:%IMAGE_TAG% -f microservices/analytics-service/Dockerfile .
docker push %REGISTRY%/bookstore-analytics-service:%IMAGE_TAG%
```

---

## Paso 3: Configurar Kubernetes (ConfigMap y Secret)

### 3.1 Actualizar el ConfigMap con tu nuevo RDS

Abre `kubernetes/configmap.yaml` y asegúrate de que el campo `DB_HOST:` coincida con tu `%RDS_ENDPOINT%`.

### 3.2 Aplicar ConfigMap y Secret en el clúster

```cmd
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secret.yaml
```

Verificar:

```cmd
kubectl get configmap bookstore-config
kubectl get secret bookstore-secrets
```

---

## Paso 4: Desplegar los Microservicios en Amazon EKS

Aplica los 4 despliegues de microservicios:

```cmd
kubectl apply -f kubernetes/microservices/auth-deployment.yaml
kubectl apply -f kubernetes/microservices/catalog-deployment.yaml
kubectl apply -f kubernetes/microservices/orders-deployment.yaml
kubectl apply -f kubernetes/microservices/analytics-deployment.yaml
```

Verificar que todos los pods alcancen el estado `Running`:

```cmd
kubectl get pods -w
```

_(Presiona `Ctrl + C` cuando todos estén `2/2` o `1/1` en Running)._

Verificar los Services internos (nota que `catalog-service` expone los puertos `5002` HTTP y `50052` gRPC):

```cmd
kubectl get svc
```

### 4.1 Desplegar el Ingress ALB para Microservicios

```cmd
kubectl apply -f kubernetes/microservices/ingress.yaml
```

Obtener la URL pública del Application Load Balancer:

```cmd
kubectl get ingress bookstore-microservices-ingress --query "status.loadBalancer.ingress[0].hostname"
```

```cmd
set ALB_HOST=<PEGA_AQUI_LA_URL_DEL_ALB>
```

---

## Paso 5: Desplegar Frontend en Amazon S3 y CloudFront

Para completar la arquitectura desacoplada y eliminar costos de contenedores Nginx en EKS:

### 5.1 Compilar la SPA del Frontend

```cmd
cd frontend
npm install
npm run build
cd ..
```

### 5.2 Crear el Bucket S3 para el Frontend

```cmd
aws s3 mb s3://bookstore-frontend-%ACCOUNT_ID% --region %REGION%
```

Subir los archivos compilados:

```cmd
aws s3 sync frontend/dist s3://bookstore-frontend-%ACCOUNT_ID%/ --delete
```

### 5.3 Crear la Distribución de CloudFront

Crea la distribución configurando el bucket S3 como origen predeterminado (`/*`) y el `%ALB_HOST%` de EKS para la ruta `/api/v1/*`.

Obtén el dominio asignado por CloudFront:

```cmd
aws cloudfront list-distributions --query "DistributionList.Items[0].DomainName" --output text
```

---

## Paso 6: Verificación de Funcionalidades

### 6.1 Probar Healthchecks de los Microservicios

```cmd
curl -i http://%ALB_HOST%/api/v1/books
```

### 6.2 Probar la Transacción Distribuida (Patrón Saga vía gRPC)

Ejecuta una orden de compra con sesión autenticada:

```cmd
curl -X POST http://%ALB_HOST%/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Cookie: bookstore_session=<TOKEN_VALIDO>" \
  -d "{\"items\": [{\"bookId\": \"00000000-0000-4000-a000-000000000101\", \"quantity\": 1}]}"
```

Revisa los logs en tiempo real para observar la llamada gRPC de la Saga:

```cmd
kubectl logs -l app=orders-service -f
kubectl logs -l app=catalog-service -f
```

Verás los registros:

- `orders-service`: `gRPC: Invoking ReserveStock on Catalog`
- `catalog-service`: `gRPC: ReserveStock received -> Stock successfully reserved`
- `orders-service`: `Saga Step 3 (T3) completed: Order marked as PLACED`

### 6.3 Verificar el Sidecar de Telemetría (Fluent Bit $\to$ Kinesis $\to$ S3)

Envía un evento de navegación:

```cmd
curl -X POST http://%ALB_HOST%/api/v1/events \
  -H "Content-Type: application/json" \
  -d "{\"event_type\": \"catalog_view\", \"resource_type\": \"catalog\"}"
```

Revisa los logs del contenedor sidecar:

```cmd
kubectl logs -l app=analytics-service -c fluent-bit --tail=30
```

Y confirma que los datos se depositan en tu Data Lake:

```cmd
aws s3 ls s3://bookstore-clickstream-datalake-%ACCOUNT_ID%/clickstream/ --recursive
```
