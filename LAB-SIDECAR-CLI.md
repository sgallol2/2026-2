# Laboratorio Sidecar-Kinesis-S3 — Guía CLI para CMD de Windows

**Prerrequisito:** Haber ejecutado [PREREQS-CLI.md](file:///c:/Users/ASUS/Desktop/cloud_computing/2026-2/PREREQS-CLI.md) por completo.

> [!IMPORTANT]
> **Todos los comandos se ejecutan en CMD (cmd.exe).** Si cerraste la terminal, restaura tus variables ejecutando `vars.cmd` si lo guardaste, o repite el bloque de la **Sección 0**.

---

## Sección 0: Restaurar Variables de Sesión

Si cerraste CMD, ejecuta esto para recuperar los IDs de los recursos ya creados:

```cmd
set ACCOUNT_ID=683090163663
set REGION=us-east-1
set REGISTRY=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com
set IMAGE_TAG=8.1.0
set APP_DB_PASSWORD=AppSecurePassword2026!
```

```cmd
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=bookstore-vpc" --query "Vpcs[0].VpcId" --output text
```

```cmd
set VPC_ID=<PEGA_AQUI>
```

```cmd
aws ec2 describe-subnets --filters "Name=tag:Name,Values=public-subnet-1a" "Name=vpc-id,Values=%VPC_ID%" --query "Subnets[0].SubnetId" --output text
```

```cmd
set PUB_1A=<PEGA_AQUI>
```

```cmd
aws ec2 describe-subnets --filters "Name=tag:Name,Values=public-subnet-1b" "Name=vpc-id,Values=%VPC_ID%" --query "Subnets[0].SubnetId" --output text
```

```cmd
set PUB_1B=<PEGA_AQUI>
```

```cmd
aws rds describe-db-instances --db-instance-identifier bookstore-db --query "DBInstances[0].Endpoint.Address" --output text
```

```cmd
set RDS_ENDPOINT=<PEGA_AQUI>
```

---

## Sección 5: Conexión al Clúster EKS

### 5.1 Verificar credenciales

```cmd
aws sts get-caller-identity
```

### 5.2 Configurar kubectl

```cmd
aws eks update-kubeconfig --region %REGION% --name my-cluster
```

```cmd
kubectl get nodes
```

Salida esperada:

```text
NAME                          STATUS   ROLES    AGE   VERSION
ip-172-16-6-xx.ec2.internal   Ready    <none>   2m    v1.30.x-eks
ip-172-16-3-xx.ec2.internal   Ready    <none>   2m    v1.30.x-eks
```

### 5.3 Verificar subredes públicas etiquetadas para el NLB

```cmd
aws ec2 describe-subnets --filters "Name=tag:kubernetes.io/role/elb,Values=1" "Name=vpc-id,Values=%VPC_ID%" --query "Subnets[*].SubnetId" --output text
```

Debe devolver `%PUB_1A%` y `%PUB_1B%`. Guárdalos para los manifiestos.

---

## Sección 6: Infraestructura de Datos e IAM

### 6.1 Adjuntar política de Firehose al rol de los Worker Nodes

Obtener el nombre del rol IAM del nodegroup:

```cmd
aws eks describe-nodegroup --cluster-name my-cluster --nodegroup-name standard-workers --query "nodegroup.nodeRole" --output text
```

La salida tendrá el formato `arn:aws:iam::683090163663:role/NOMBRE-DEL-ROL`. Copia **solo el nombre** (la parte después del último `/`):

```cmd
set EKS_NODE_ROLE=<PEGA_AQUI_SOLO_EL_NOMBRE_DEL_ROL>
```

Adjuntar la política:

```cmd
aws iam attach-role-policy --role-name %EKS_NODE_ROLE% --policy-arn arn:aws:iam::aws:policy/AmazonKinesisFirehoseFullAccess
```

> [!NOTE]
> Si recibes `AccessDenied`, los nodos de AWS Academy probablemente ya tienen permisos suficientes. Continúa con el siguiente paso.

### 6.2 Crear el Bucket S3

```cmd
aws s3 mb s3://bookstore-clickstream-datalake-%ACCOUNT_ID% --region %REGION%
```

Salida esperada:

```text
make_bucket: bookstore-clickstream-datalake-683090163663
```

### 6.3 Obtener el ARN del LabRole

```cmd
aws iam get-role --role-name LabRole --query "Role.Arn" --output text
```

```cmd
set LABROLE_ARN=<PEGA_AQUI>
```

### 6.4 Crear el Delivery Stream de Kinesis Firehose

```cmd
aws firehose create-delivery-stream --delivery-stream-name bookstore-clickstream-stream --delivery-stream-type DirectPut --extended-s3-destination-configuration "{\"RoleARN\":\"%LABROLE_ARN%\",\"BucketARN\":\"arn:aws:s3:::bookstore-clickstream-datalake-%ACCOUNT_ID%\",\"Prefix\":\"clickstream/year=!{timestamp:yyyy}/month=!{timestamp:MM}/\",\"ErrorOutputPrefix\":\"errors/!{firehose:error-output-type}/\",\"BufferingHints\":{\"SizeInMBs\":5,\"IntervalInSeconds\":60},\"CompressionFormat\":\"GZIP\"}"
```

Verificar que quedó activo:

```cmd
aws firehose describe-delivery-stream --delivery-stream-name bookstore-clickstream-stream --query "DeliveryStreamDescription.DeliveryStreamStatus" --output text
```

Debe mostrar `ACTIVE`.

---

## Sección 7: Construcción y Publicación de Imágenes en ECR

### 7.1 Crear repositorios ECR

```cmd
aws ecr create-repository --repository-name bookstore-frontend --region %REGION%
```

```cmd
aws ecr create-repository --repository-name bookstore-backend --region %REGION%
```

> [!NOTE]
> Si ya existen, el comando devuelve un error `RepositoryAlreadyExistsException`. Es normal, continúa.

### 7.2 Login de Docker a ECR

```cmd
aws ecr get-login-password --region %REGION% > %TEMP%\ecr_pass.txt
```

```cmd
type %TEMP%\ecr_pass.txt | docker login --username AWS --password-stdin %REGISTRY%
```

### 7.3 Construir y publicar la imagen del Backend

```cmd
cd backend
```

```cmd
docker build --build-arg NODE_IMAGE=node:24-alpine -t %REGISTRY%/bookstore-backend:v1.0 .
```

```cmd
docker push %REGISTRY%/bookstore-backend:v1.0
```

```cmd
cd ..
```

### 7.4 Construir y publicar la imagen del Frontend

```cmd
cd frontend
```

```cmd
docker build --build-arg NODE_IMAGE=node:24-alpine --build-arg NGINX_IMAGE=nginx:1.27-alpine --build-arg VITE_API_BASE_URL=/ --build-arg VITE_API_PREFIX=/api --build-arg VITE_CURRENCY_LOCALE=es-CO --build-arg VITE_CURRENCY_CODE=COP -t %REGISTRY%/bookstore-frontend:v1.0 .
```

```cmd
docker push %REGISTRY%/bookstore-frontend:v1.0
```

```cmd
cd ..
```

---

## Sección 8: Crear los Manifiestos de Kubernetes

### 8.1 Crear el directorio

```cmd
mkdir kubernetes
```

### 8.2 Crear `kubernetes\deployment.yaml`

Crea el archivo con tu editor de texto (Notepad, VS Code, etc.) y pega el siguiente contenido.

**Antes de guardar, reemplaza los 3 placeholders:**

- `REEMPLAZA_ACCOUNT_ID` → `683090163663`
- `REEMPLAZA_RDS_ENDPOINT` → el valor de `%RDS_ENDPOINT%` (ejecútalo en CMD para verlo: `echo %RDS_ENDPOINT%`)
- `REEMPLAZA_PASSWORD_RDS` → `AppSecurePassword2026!`

```cmd
echo %RDS_ENDPOINT%
```

Abre el archivo con:

```cmd
notepad kubernetes\deployment.yaml
```

Pega este contenido completo:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  labels:
    app: bookstore-backend
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         1
        Log_Level     info
        Daemon        off
        Parsers_File  parsers.conf

    [INPUT]
        Name              tail
        Tag               clickstream.*
        Path              /usr/src/app/logs/clickstream.log
        Parser            json
        DB                /usr/src/app/logs/fluent-bit.db
        Mem_Buf_Limit     5MB
        Skip_Long_Lines   On
        Refresh_Interval  1

    [OUTPUT]
        Name              kinesis_firehose
        Match             clickstream.*
        region            us-east-1
        delivery_stream   bookstore-clickstream-stream
  parsers.conf: |
    [PARSER]
        Name        json
        Format      json
        Time_Key    timestamp
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bookstore-frontend
  labels:
    app: bookstore-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bookstore-frontend
  template:
    metadata:
      labels:
        app: bookstore-frontend
    spec:
      containers:
        - name: frontend
          image: REEMPLAZA_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/bookstore-frontend:v1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
          env:
            - name: NGINX_PORT
              value: "80"
            - name: API_PROXY_PREFIX
              value: "/api"
            - name: PROXY_PASS
              value: "http://bookstore-backend-service:5001"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bookstore-backend
  labels:
    app: bookstore-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bookstore-backend
  template:
    metadata:
      labels:
        app: bookstore-backend
    spec:
      securityContext:
        fsGroup: 1000
      volumes:
        - name: shared-logs
          emptyDir: {}
        - name: fluent-bit-config-volume
          configMap:
            name: fluent-bit-config
      containers:
        - name: backend
          image: REEMPLAZA_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/bookstore-backend:v1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5001
          volumeMounts:
            - name: shared-logs
              mountPath: /usr/src/app/logs
          env:
            - name: SERVICE_NAME
              value: "bookstore-api"
            - name: PORT
              value: "5001"
            - name: NODE_ENV
              value: "production"
            - name: CLICKSTREAM_FILE_ENABLED
              value: "true"
            - name: CLICKSTREAM_FILE_PATH
              value: "/usr/src/app/logs/clickstream.log"
            - name: DB_HOST
              value: "REEMPLAZA_RDS_ENDPOINT"
            - name: DB_PORT
              value: "5432"
            - name: DB_NAME
              value: "bookstore"
            - name: DB_USER
              value: "bookstore_app"
            - name: DB_PASSWORD
              value: "REEMPLAZA_PASSWORD_RDS"
            - name: DB_SSL
              value: "true"
            - name: DB_SSL_REJECT_UNAUTHORIZED
              value: "false"
            - name: DB_POOL_MAX
              value: "10"
            - name: DB_IDLE_TIMEOUT_MS
              value: "30000"
            - name: DB_CONNECTION_TIMEOUT_MS
              value: "5000"
            - name: ORDERS_MAX_DISTINCT_ITEMS
              value: "100"
            - name: ORDERS_MAX_QUANTITY_PER_ITEM
              value: "1000"
            - name: HTTP_TRUST_PROXY_HOPS
              value: "1"
            - name: HTTP_JSON_BODY_LIMIT
              value: "32kb"
            - name: AUTH_JWT_SECRET
              value: "4voFHxYerDe9+xENq1vgmNucC8c6iCJGNt48EJgnxlw="
            - name: AUTH_JWT_ALGORITHM
              value: "HS256"
            - name: AUTH_JWT_ISSUER
              value: "bookstore-api"
            - name: AUTH_JWT_AUDIENCE
              value: "bookstore-web"
            - name: AUTH_TOKEN_TTL_SECONDS
              value: "28800"
            - name: AUTH_COOKIE_NAME
              value: "bookstore_session"
            - name: AUTH_COOKIE_SECURE
              value: "false"
            - name: AUTH_COOKIE_SAME_SITE
              value: "lax"
            - name: AUTH_COOKIE_PATH
              value: "/api"
            - name: API_BASE_PATH
              value: "/api"
            - name: CORS_ORIGINS
              value: "http://REEMPLAZA_NLB_URL,http://localhost:3000"
            - name: BOOKS_DEFAULT_LIMIT
              value: "24"
            - name: BOOKS_MAX_LIMIT
              value: "100"
            - name: ACCESS_LOG_ENABLED
              value: "true"
            - name: ACCESS_LOG_EXCLUDE_PATHS
              value: "/health"
            - name: ACCESS_LOG_MAX_FIELD_LENGTH
              value: "2048"
            - name: ACCESS_LOG_REQUEST_ID_HEADER
              value: "X-Request-Id"
        - name: fluent-bit-sidecar
          image: amazon/aws-for-fluent-bit:latest
          imagePullPolicy: IfNotPresent
          volumeMounts:
            - name: shared-logs
              mountPath: /usr/src/app/logs
            - name: fluent-bit-config-volume
              mountPath: /fluent-bit/etc/
          resources:
            limits:
              memory: 64Mi
              cpu: 100m
            requests:
              memory: 32Mi
              cpu: 50m
```

### 8.3 Crear `kubernetes\service.yaml`

```cmd
echo %PUB_1A%
echo %PUB_1B%
```

Abre con notepad:

```cmd
notepad kubernetes\service.yaml
```

Pega el siguiente contenido. **Reemplaza `REEMPLAZA_SUBNET_1` y `REEMPLAZA_SUBNET_2`** con los valores de `%PUB_1A%` y `%PUB_1B%`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: bookstore-frontend-service
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
    service.beta.kubernetes.io/aws-load-balancer-subnets: REEMPLAZA_SUBNET_1,REEMPLAZA_SUBNET_2
spec:
  type: LoadBalancer
  selector:
    app: bookstore-frontend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: bookstore-backend-service
spec:
  type: ClusterIP
  selector:
    app: bookstore-backend
  ports:
    - protocol: TCP
      port: 5001
      targetPort: 5001
```

---

## Sección 9: Despliegue en EKS

### 9.1 Aplicar los manifiestos

```cmd
kubectl apply -f kubernetes\deployment.yaml
```

```cmd
kubectl apply -f kubernetes\service.yaml
```

Salida esperada:

```text
configmap/fluent-bit-config created
deployment.apps/bookstore-frontend created
deployment.apps/bookstore-backend created
service/bookstore-frontend-service created
service/bookstore-backend-service created
```

---

## Sección 10: Verificación

### 10.1 Estado de los Pods

```cmd
kubectl get pods -o wide
```

Espera hasta que todos estén `Running`. El backend debe mostrar **`2/2`**:

```text
NAME                                  READY   STATUS    RESTARTS   AGE
bookstore-frontend-xxxx               1/1     Running   0          45s
bookstore-frontend-yyyy               1/1     Running   0          45s
bookstore-backend-xxxx                2/2     Running   0          45s
bookstore-backend-yyyy                2/2     Running   0          45s
```

> [!WARNING]
> Si un pod queda en `ImagePullBackOff`, el nodo EKS no puede acceder a ECR. Verifica permisos:
>
> ```cmd
> aws iam list-attached-role-policies --role-name %EKS_NODE_ROLE%
> ```
>
> Debe incluir `AmazonEC2ContainerRegistryReadOnly`.

### 10.2 Obtener la URL del NLB

```cmd
kubectl get svc bookstore-frontend-service
```

Espera ~2-3 min hasta que `EXTERNAL-IP` deje de mostrar `<pending>`:

```text
NAME                         TYPE           CLUSTER-IP    EXTERNAL-IP                              PORT(S)
bookstore-frontend-service   LoadBalancer   172.20.x.x    k8s-default-bookstor-xxx.elb.us-east-1.amazonaws.com   80:3xxxx/TCP
```

Abre esa URL en el navegador y navega por la tienda para generar eventos de clickstream.

### 10.3 Ver logs del Sidecar en tiempo real

```cmd
kubectl logs -f deployment/bookstore-backend -c fluent-bit-sidecar
```

Debes ver líneas como:

```text
[info] [output:kinesis_firehose:kinesis_firehose.0] Sent 4 records to delivery stream 'bookstore-clickstream-stream'
```

Presiona `Ctrl+C` para salir.

### 10.4 Verificar datos en S3

Espera ~60 segundos después de generar tráfico:

```cmd
aws s3 ls s3://bookstore-clickstream-datalake-%ACCOUNT_ID%/clickstream/ --recursive
```

Deberías ver archivos `.gz` particionados:

```text
2026-11-07 22:45:12   18452 clickstream/year=2026/month=11/bookstore-clickstream-stream-1-2026-11-07-22-44-10-xxxx.gz
```

Descargar y verificar el contenido:

```cmd
aws s3 cp s3://bookstore-clickstream-datalake-%ACCOUNT_ID%/clickstream/ . --recursive --exclude "*" --include "*.gz"
```

```cmd
"C:\Program Files\Git\usr\bin\gzip.exe" -d bookstore-clickstream-stream-*.gz
```

```cmd
more bookstore-clickstream-stream-*
```

---

## Troubleshooting Rápido

| Problema                            | Comando de diagnóstico                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Pod en `ImagePullBackOff`           | `kubectl describe pod <nombre-pod>`                                                         |
| Sidecar en `CrashLoopBackOff`       | `kubectl logs <nombre-pod> -c fluent-bit-sidecar`                                           |
| NLB en `<pending>` por más de 5 min | `kubectl describe svc bookstore-frontend-service`                                           |
| Backend no conecta a RDS            | `kubectl logs <nombre-pod> -c backend`                                                      |
| Sin datos en S3 tras 2+ minutos     | `aws firehose describe-delivery-stream --delivery-stream-name bookstore-clickstream-stream` |

### Reiniciar un deployment si algo falla

```cmd
kubectl rollout restart deployment/bookstore-backend
kubectl rollout restart deployment/bookstore-frontend
```

### Ver todos los recursos del laboratorio

```cmd
kubectl get all
```
