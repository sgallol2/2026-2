# Laboratorio N4

**Curso:** ST3016 – Computación en Nube.  
**Título:** Ingesta y Persistencia de Logs Clickstream en Kubernetes: Patrón Sidecar, Amazon Kinesis Firehose y Amazon S3.  
**SubTítulo:** Del contenedor efímero al Data Lake empresarial...  
**Objetivo:** Desplegar una arquitectura cloud native integral en Amazon EKS que resuelva la persistencia e ingesta en streaming de archivos de clickstream generados por un backend contenerizado, implementando el patrón arquitectónico Sidecar con Fluent Bit, un volumen temporal compartido (`emptyDir`), Amazon Kinesis Data Firehose y Amazon S3.  
**Duración:** 60 mins

---

## Tabla de Contenido

1. Introducción.
2. Recursos y Prerrequisitos.
   - 2.1 Contexto y Recursos Previos de Laboratorios Anteriores.
   - 2.2 Herramientas Requeridas en la Estación de Trabajo.
3. Fundamentos del Entorno de Ejecución.
   - 3.1 El Ciclo de Vida Efímero en Kubernetes.
   - 3.2 El Patrón Arquitectónico Sidecar.
   - 3.3 Streaming e Ingesta con Amazon Kinesis Data Firehose y S3.
4. Arquitectura de la Solución: Bookstore Co.
   - 4.1 Diagrama de Flujo y Persistencia de Datos.
   - 4.2 Anatomía del Pod Multi-Contenedor (Backend + Shipper).
5. Preparación del Entorno Local y Conexión a AWS EKS.
   - 5.1 Configuración de Credenciales AWS CLI.
   - 5.2 Conexión de `kubectl` al Clúster EKS.
   - 5.3 Obtención de Subredes Públicas para el Balanceador.
6. Aprovisionamiento de Infraestructura de Datos e IAM en AWS.
   - 6.1 Permisos de IAM para los Worker Nodes (Acceso a Firehose).
   - 6.2 Creación del Bucket de Amazon S3.
   - 6.3 Creación del Stream de Amazon Kinesis Data Firehose.
7. Construcción y Publicación de Imágenes en Amazon ECR.
   - 7.1 Creación de Repositorios en ECR.
   - 7.2 Construcción y Push de Frontend y Backend.
8. Declaración de Artefactos de Kubernetes (Directorio `kubernetes/`).
   - 8.1 Manifiesto `kubernetes/deployment.yaml` (ConfigMap + Deployments).
   - 8.2 Manifiesto `kubernetes/service.yaml` (Frontend NLB + Backend ClusterIP).
9. Despliegue de la Aplicación en Amazon EKS.
   - 9.1 Ajuste de Variables en los Manifiestos.
   - 9.2 Aplicando los Manifiestos Declarativos.
10. Verificando Funcionalidad e Ingesta en Streaming.
    - 10.1 Inspección de Pods y Contenedores en Ejecución.
    - 10.2 Acceso Público a la Aplicación Frontend.
    - 10.3 Inspección de Logs en Tiempo Real del Contenedor Sidecar.
    - 10.4 Verificación de Objetos Almacenados en Amazon S3.
11. Instrucciones del archivo `kubernetes/deployment.yaml`.
12. Instrucciones del archivo `fluent-bit-config`.

---

## 1 Introducción.

En los laboratorios anteriores, se abordó la contenerización de la aplicación Bookstore Co mediante Docker y la orquestación inicial de sus servicios empleando Kubernetes sobre Amazon EKS. Sin embargo, en un entorno de producción surge un desafío crítico relacionado con el ciclo de vida de los contenedores: **los contenedores son inmutables y efímeros**.

La aplicación de backend (desarrollada en Node.js con Express) cuenta con un módulo de logging (`accessLogger.js` y `clickstreamFileWriter.js`) encargado de registrar cada interacción del usuario (búsqueda de libros, adición al carrito, compras y autenticación) en un archivo local denominado `clickstream.log`. Esta información es el insumo fundamental para las áreas de analítica e ingeniería de datos.

Si el pod del backend se reinicia por una falla o si el Horizontal Pod Autoscaler (HPA) destruye réplicas al disminuir la demanda, el sistema de archivos del contenedor se destruye con él, provocando la pérdida irremediable del historial de navegación.

Para solventar esta problemática sin alterar el código fuente de la aplicación, en este laboratorio implementaremos el **patrón Sidecar**. Este patrón desacopla la responsabilidad de la recolección de datos del contenedor de negocio, empleando un contenedor auxiliar (**Fluent Bit**) que comparte el volumen de almacenamiento del pod y transmite los registros en tiempo real hacia un servicio de ingestión administrado (**Amazon Kinesis Data Firehose**), el cual finalmente almacena los datos de forma permanente y particionada en un Data Lake sobre **Amazon S3**.

---

## 2 Recursos y Prerrequisitos.

### 2.1 Contexto y Recursos Previos de Laboratorios Anteriores

Este laboratorio es la **continuación directa de los laboratorios de Infraestructura y Kubernetes (Semana 15 y Lab N2/N3)**. Por tanto, se asume que los siguientes componentes de infraestructura base ya fueron aprovisionados en AWS:

1. **VPC y Subredes Multi-AZ**: Creadas en los laboratorios anteriores con subredes públicas (etiquetadas para balanceadores de carga) y subredes privadas.
2. **Base de Datos Relacional (Amazon RDS)**: Instancia de PostgreSQL en subred privada creada en el Laboratorio N2, con las credenciales de aplicación inicializadas mediante el proceso de bootstrap.
3. **Clúster de Kubernetes en Amazon EKS (`my-cluster`)**: El clúster gestionado de EKS en estado `ACTIVE` con su grupo de nodos de trabajo (mínimo 2 Worker Nodes EC2).

> **Nota de contingencia:** Si el clúster de EKS fue destruido o detenido para ahorrar créditos de laboratorio, puede recrearse rápidamente ejecutando el siguiente comando con `eksctl` antes de iniciar:
>
> ```bash
> $ eksctl create cluster \
>     --name my-cluster \
>     --region us-east-1 \
>     --nodegroup-name standard-workers \
>     --node-type t3.medium \
>     --nodes 2 \
>     --nodes-min 2 \
>     --nodes-max 3 \
>     --managed
> ```

### 2.2 Herramientas Requeridas en la Estación de Trabajo

Para la ejecución de las actividades se requiere disponer localmente de:

- Estación de trabajo (Linux, macOS o Windows con WSL2/PowerShell) con Git instalado.
- AWS CLI v2 instalado y autenticado con una cuenta activa de Amazon Web Services.
- Herramienta de línea de comandos `kubectl` (v1.28 o superior) instalada.
- Docker Desktop o Docker Engine local para la compilación y publicación de imágenes.
- Repositorio del proyecto Bookstore Co clonado localmente.

---

## 3 Fundamentos del Entorno de Ejecución.

En esta sección se presentan los fundamentos conceptuales de la persistencia desacoplada y la recolección de eventos en clústeres gestionados.

### 3.1 El Ciclo de Vida Efímero en Kubernetes

Un Pod es la unidad básica de ejecución en Kubernetes. A diferencia de las máquinas virtuales tradicionales, un contenedor dentro de un pod no debe ser utilizado como un sistema de almacenamiento de largo plazo. Cuando un contenedor finaliza o se recrea:

- Los archivos modificados o creados durante la ejecución desaparecen.
- El estado del disco se reestablece a la imagen original proveniente del registro de contenedores (Amazon ECR).

En escenarios donde se requiere persistencia para datos transaccionales, se emplean volúmenes persistentes (`PersistentVolume`). No obstante, en escenarios de **Clickstream y Streaming**, almacenar archivos directamente en volúmenes compartidos como Amazon EFS introduce cuellos de botella por contención de lectura/escritura (`file locking`) y saturación del ancho de banda NFS cuando escalan decenas de pods concurrentes.

### 3.2 El Patrón Arquitectónico Sidecar

El patrón Sidecar extiende o complementa la funcionalidad del contenedor principal sin modificar su código. En Kubernetes, esto se implementa ejecutando **dos contenedores dentro del mismo Pod**:

```text
+-------------------------------------- POD (Backend) --------------------------------------+
|                                                                                            |
|   +-----------------------------+                    +---------------------------------+   |
|   |    Contenedor Principal     |                    |       Contenedor Sidecar        |   |
|   |       (Node.js / API)       |                    |          (Fluent Bit)           |   |
|   |                             |                    |                                 |   |
|   |  Escribe eventos en:        |                    |  Lee en tiempo real (tail -f):  |   |
|   |  /usr/src/app/logs/         |                    |  /usr/src/app/logs/             |   |
|   |         clickstream.log     |                    |         clickstream.log         |   |
|   +--------------+--------------+                    +----------------+----------------+   |
|                  |                                                    |                    |
|                  v                                                    v                    |
|             +--------------------------------------------------------------+               |
|             |                  Volumen Compartido emptyDir                 |               |
|             |                      (/usr/src/app/logs)                     |               |
|             +--------------------------------------------------------------+               |
|                                                                       |                    |
+-----------------------------------------------------------------------+--------------------+
                                                                        | Ingesta HTTPS
                                                                        v
                                                         [ Amazon Kinesis Firehose ]
                                                                        |
                                                                        v
                                                             [ Bucket Amazon S3 ]
```

Ambos contenedores comparten:

1. **Espacio de Red (`Network Namespace`)**: Comparten la misma dirección IP interna y pueden comunicarse por `localhost`.
2. **Volumen de Almacenamiento Local (`emptyDir`)**: Un volumen efímero montado en ambos contenedores. El contenedor principal escribe el archivo de texto y el contenedor sidecar lo lee en tiempo real.

### 3.3 Streaming e Ingesta con Amazon Kinesis Data Firehose y S3

- **Amazon Kinesis Data Firehose**: Servicio totalmente administrado para capturar, transformar y cargar flujos de datos masivos. Se encarga de recibir los registros individuales vía HTTPS, agruparlos en lotes (batching por tamaño o tiempo) y entregarlos automáticamente a su destino sin requerir administración de servidores.
- **Amazon S3**: Almacenamiento de objetos escalable y de alta durabilidad que actúa como la capa de aterrizaje (_Landing Zone_) del Data Lake.

---

## 4 Arquitectura de la Solución: Bookstore Co.

### 4.1 Diagrama de Flujo y Persistencia de Datos

1. El usuario interactúa con la tienda a través del navegador web, ingresando por el **AWS Network Load Balancer (NLB)** público en el puerto 80.
2. El servicio de Kubernetes `bookstore-frontend-service` entrega la petición a los pods de la capa de presentación (**Frontend SSR**).
3. El frontend invoca la API interna del backend mediante el nombre DNS de Kubernetes `http://bookstore-backend-service:5001`.
4. El contenedor del backend atiende la petición, consulta la base de datos **Amazon RDS PostgreSQL** por el puerto 5432 y registra la traza analítica en el archivo `/usr/src/app/logs/clickstream.log`.
5. Simultáneamente, el contenedor auxiliar **Fluent Bit** detecta la nueva línea agregada al archivo, la transforma y la transmite por la API de AWS hacia **Amazon Kinesis Data Firehose**.
6. Kinesis Firehose consolida los registros y los deposita en el bucket de **Amazon S3**.

---

## 5 Preparación del Entorno Local y Conexión a AWS EKS.

### 5.1 Configuración de Credenciales AWS CLI

Verifique que su CLI de AWS se encuentre autenticada en la cuenta de trabajo:

```bash
$ aws sts get-caller-identity
```

Debería observar una salida parecida a:

```json
{
  "UserId": "AROAXXXXXXXXXXXXXXXXX:session",
  "Account": "123456789012",
  "Arn": "arn:aws:sts::123456789012:assumed-role/voclabs/user"
}
```

Tome nota del campo `"Account"`, ya que representa su `<ACCOUNT_ID>`.

### 5.2 Conexión de `kubectl` al Clúster EKS

Actualice el archivo de configuración de Kubernetes (`kubeconfig`) para apuntar al clúster EKS existente:

```bash
$ aws eks update-kubeconfig --region us-east-1 --name my-cluster
```

Verifique la conectividad con el plano de control y el estado de los nodos:

```bash
$ kubectl get nodes
```

Salida esperada:

```text
NAME                          STATUS   ROLES    AGE   VERSION
ip-10-0-1-20.ec2.internal     Ready    <none>   3d    v1.30.2-eks
ip-10-0-2-45.ec2.internal     Ready    <none>   3d    v1.30.2-eks
```

### 5.3 Obtención de Subredes Públicas para el Balanceador

El controlador de AWS requiere las subredes públicas de la VPC del clúster para desplegar el Network Load Balancer (NLB). Ejecute el siguiente comando para listarlas:

```bash
$ aws ec2 describe-subnets \
    --filters "Name=tag:kubernetes.io/role/elb,Values=1" \
    --query "Subnets[*].SubnetId" \
    --output text
```

Copie la lista de subredes separadas por comas (por ejemplo: `subnet-0ea9f7d1f423b756d,subnet-0099f2a685f003498`), pues se utilizarán en el manifiesto `service.yaml`.

---

## 6 Aprovisionamiento de Infraestructura de Datos e IAM en AWS.

### 6.1 Permisos de IAM para los Worker Nodes (Acceso a Firehose)

Para que el contenedor Sidecar de Fluent Bit pueda ejecutar la operación `firehose:PutRecordBatch`, el rol de IAM asignado a los Worker Nodes de EKS debe tener adjunta la política de acceso a Firehose:

```bash
$ aws iam attach-role-policy \
    --role-name <EKS-Node-Instance-Role-Name> \
    --policy-arn arn:aws:iam::aws:policy/AmazonKinesisFirehoseFullAccess
```

### 6.2 Creación del Bucket de Amazon S3

Cree el bucket de S3 que servirá como destino permanente de los registros de clickstream:

```bash
$ aws s3 mb s3://bookstore-clickstream-datalake-<ACCOUNT_ID> --region us-east-1
```

Salida esperada:

```text
make_bucket: bookstore-clickstream-datalake-123456789012
```

### 6.3 Creación del Stream de Amazon Kinesis Data Firehose

Aprovisione el Delivery Stream configurando el bucket de S3 como destino final:

```bash
$ aws firehose create-delivery-stream \
    --delivery-stream-name bookstore-clickstream-stream \
    --delivery-stream-type DirectPut \
    --extended-s3-destination-configuration '{
        "RoleARN": "arn:aws:iam::<ACCOUNT_ID>:role/firehose-delivery-role",
        "BucketARN": "arn:aws:s3:::bookstore-clickstream-datalake-<ACCOUNT_ID>",
        "Prefix": "clickstream/year=!{timestamp:yyyy}/month=!{timestamp:MM}/",
        "ErrorOutputPrefix": "errors/!{firehose:error-output-type}/",
        "BufferingHints": {
            "SizeInMBs": 5,
            "IntervalInSeconds": 60
        },
        "CompressionFormat": "GZIP"
    }'
```

---

## 7 Construcción y Publicación de Imágenes en Amazon ECR.

Si las imágenes no han sido compiladas en su cuenta, ejecute los siguientes pasos:

### 7.1 Creación de Repositorios en ECR

```bash
$ aws ecr create-repository --repository-name bookstore-frontend --region us-east-1
$ aws ecr create-repository --repository-name bookstore-backend --region us-east-1
```

### 7.2 Construcción y Push de Frontend y Backend

Autentique Docker con su registro privado:

```bash
$ aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

Compile y publique la imagen del backend:

```bash
$ cd backend
$ docker build -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/bookstore-backend:v1.0 .
$ docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/bookstore-backend:v1.0
$ cd ..
```

Compile y publique la imagen del frontend:

```bash
$ cd frontend
$ docker build -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/bookstore-frontend:v1.0 .
$ docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/bookstore-frontend:v1.0
$ cd ..
```

---

## 8 Declaración de Artefactos de Kubernetes (Directorio `kubernetes/`).

Dentro de la raíz del proyecto, valide que exista el directorio `kubernetes/` con los dos manifiestos declarativos.

### 8.1 Manifiesto `kubernetes/deployment.yaml`

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
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/bookstore-frontend:v1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
          env:
            - name: BACKEND_URL
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
      volumes:
        - name: shared-logs
          emptyDir: {}
        - name: fluent-bit-config-volume
          configMap:
            name: fluent-bit-config
      containers:
        - name: backend
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/bookstore-backend:v1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5001
          volumeMounts:
            - name: shared-logs
              mountPath: /usr/src/app/logs
          env:
            - name: PORT
              value: "5001"
            - name: NODE_ENV
              value: "production"
            - name: CLICKSTREAM_FILE_ENABLED
              value: "true"
            - name: CLICKSTREAM_FILE_PATH
              value: "/usr/src/app/logs/clickstream.log"
            - name: DB_HOST
              value: "<RDS_ENDPOINT_POSTGRES>"
            - name: DB_PORT
              value: "5432"
            - name: DB_NAME
              value: "bookstore"
            - name: DB_USER
              value: "bookstore_app"
            - name: DB_PASSWORD
              value: "<PASSWORD_RDS>"
            - name: AUTH_JWT_SECRET
              value: "bookstore_production_secret_jwt_key_32_characters_minimum"
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

### 8.2 Manifiesto `kubernetes/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: bookstore-frontend-service
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
    service.beta.kubernetes.io/aws-load-balancer-subnets: <SUBNET_1>,<SUBNET_2>
spec:
  type: LoadBalancer
  loadBalancerClass: eks.amazonaws.com/nlb
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

## 9 Despliegue de la Aplicación en Amazon EKS.

### 9.1 Ajuste de Variables en los Manifiestos

Abra los archivos en un editor de texto y sustituya los valores entre corchetes angulares por los recursos reales aprovisionados:

- `<ACCOUNT_ID>`: Su ID de 12 dígitos de AWS.
- `<RDS_ENDPOINT_POSTGRES>`: El endpoint DNS de su base de datos RDS.
- `<PASSWORD_RDS>`: La contraseña del usuario de base de datos.
- `<SUBNET_1>,<SUBNET_2>`: Los IDs de subredes públicas obtenidos en la sección 5.3.

### 9.2 Aplicando los Manifiestos Declarativos

Ejecute la creación de los recursos en el clúster:

```bash
$ kubectl apply -f kubernetes/deployment.yaml
$ kubectl apply -f kubernetes/service.yaml
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

## 10 Verificando Funcionalidad e Ingesta en Streaming.

### 10.1 Inspección de Pods y Contenedores en Ejecución

Consulte el estado detallado de los pods en el clúster:

```bash
$ kubectl get pods -o wide
```

Observe detenidamente la columna **`READY`**:

```text
NAME                                  READY   STATUS    RESTARTS   AGE   IP           NODE
bookstore-frontend-7c98f8b5b-4x2lm    1/1     Running   0          45s   10.0.1.102   ip-10-0-1-20...
bookstore-frontend-7c98f8b5b-9pl8w    1/1     Running   0          45s   10.0.2.115   ip-10-0-2-45...
bookstore-backend-56f89cdbc-k8zlw     2/2     Running   0          45s   10.0.1.108   ip-10-0-1-20...
bookstore-backend-56f89cdbc-m3n2v     2/2     Running   0          45s   10.0.2.121   ip-10-0-2-45...
```

La designación **`2/2`** en la columna `READY` del backend confirma que el contenedor de aplicación y el contenedor sidecar se encuentran ejecutándose en conjunto dentro de la misma unidad de programación.

### 10.2 Acceso Público a la Aplicación Frontend

Obtenga la dirección DNS generada por el Network Load Balancer:

```bash
$ kubectl get svc bookstore-frontend-service
```

Salida esperada:

```text
NAME                         TYPE           CLUSTER-IP      EXTERNAL-IP                                                             PORT(S)        AGE
bookstore-frontend-service   LoadBalancer   172.20.145.22   k8s-default-bookstor-xxxxxxxxxx.elb.us-east-1.amazonaws.com   80:31254/TCP   2m
```

Abra un navegador web y navegue por la URL externa de la tienda para generar eventos de navegación.

### 10.3 Inspección de Logs en Tiempo Real del Contenedor Sidecar

Para comprobar que el contenedor auxiliar está capturando las líneas de log escritas en `/usr/src/app/logs/clickstream.log`, inspeccione la salida del contenedor especificando `-c fluent-bit-sidecar`:

```bash
$ kubectl logs -f deployment/bookstore-backend -c fluent-bit-sidecar
```

Salida esperada:

```text
[2026/11/06 14:32:01] [ info] [input:tail:tail.0] inotify_fs_add(): inode=135892 watch_fd=1 /usr/src/app/logs/clickstream.log
[2026/11/06 14:32:05] [ info] [output:kinesis_firehose:kinesis_firehose.0] Sent 4 records to delivery stream 'bookstore-clickstream-stream'
```

### 10.4 Verificación de Objetos Almacenados en Amazon S3

Una vez transcurrido el tiempo de buffer (60 segundos o 5 MB), liste el contenido de su bucket en S3:

```bash
$ aws s3 ls s3://bookstore-clickstream-datalake-<ACCOUNT_ID>/clickstream/ --recursive
```

Salida esperada:

```text
2026-11-06 14:35:12     18452 clickstream/year=2026/month=11/bookstore-clickstream-stream-1-2026-11-06-14-34-10-xxxx.gz
```

Descargue y descomprima uno de los archivos para verificar que contiene la estructura JSON de eventos:

```bash
$ aws s3 cp s3://bookstore-clickstream-datalake-<ACCOUNT_ID>/clickstream/year=2026/month=11/<NOMBRE_ARCHIVO>.gz .
$ gzip -d <NOMBRE_ARCHIVO>.gz
$ head -n 5 <NOMBRE_ARCHIVO>
```

Salida esperada:

```json
{"timestamp":"2026-11-06T14:32:04.120Z","sessionId":"sess_8f3a91","event":"book_view","details":{"isbn":"9780000039361","price":169000}}
{"timestamp":"2026-11-06T14:32:15.845Z","sessionId":"sess_8f3a91","event":"add_to_cart","details":{"isbn":"9780000039361","quantity":1}}
```

¡... Listo...!

---

## 11 Instrucciones del archivo `kubernetes/deployment.yaml`

El archivo `kubernetes/deployment.yaml` define la topología de los controladores de despliegue para el frontend y el backend, así como la inyección del contenedor sidecar.

### Tabla 1. Configuración del Pod Multi-Contenedor (`bookstore-backend`)

| Instrucción                     | Valor configurado                    | Descripción                                                                                               |
| :------------------------------ | :----------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `volumes[0]`                    | `name: shared-logs` / `emptyDir: {}` | Volumen temporal creado en el nodo anfitrión y compartido en el espacio de usuario de ambos contenedores. |
| `volumes[1]`                    | `name: fluent-bit-config-volume`     | Proyecta la configuración del ConfigMap como archivo de sistema dentro del sidecar.                       |
| `containers[0].name`            | `backend`                            | Contenedor de la API Node.js/Express que atiende las peticiones y escribe el clickstream.                 |
| `containers[0].volumeMounts`    | `/usr/src/app/logs`                  | Monta el volumen compartido en el directorio donde el código fuente escribe el archivo `.log`.            |
| `containers[1].name`            | `fluent-bit-sidecar`                 | Contenedor secundario encargado exclusivamente de recolectar y transmitir registros.                      |
| `containers[1].image`           | `amazon/aws-for-fluent-bit:latest`   | Imagen optimizada de AWS que incluye el plugin nativo de Amazon Kinesis Firehose.                         |
| `containers[1].volumeMounts[0]` | `/usr/src/app/logs`                  | Accede en modo lectura/escritura al mismo directorio del backend para seguir el archivo en streaming.     |
| `containers[1].volumeMounts[1]` | `/fluent-bit/etc/`                   | Inyecta la configuración declarada en `fluent-bit.conf`.                                                  |
| `resources.limits`              | `memory: 64Mi`, `cpu: 100m`          | Asegura que el proceso de telemetría no consuma los recursos del contenedor de negocio.                   |

---

## 12 Instrucciones del archivo `fluent-bit-config`

### Tabla 2. Configuración de Ingesta y Salida en Fluent Bit

| Sección    | Parámetro         | Valor                               | Descripción                                                                                                 |
| :--------- | :---------------- | :---------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| `[INPUT]`  | `Name`            | `tail`                              | Lee continuamente los registros añadidos al final del archivo (`tail -f`).                                  |
| `[INPUT]`  | `Path`            | `/usr/src/app/logs/clickstream.log` | Ruta del archivo de logs generada por el backend en el volumen compartido.                                  |
| `[INPUT]`  | `DB`              | `/usr/src/app/logs/fluent-bit.db`   | Archivo de base de datos SQLite para registrar los offsets y evitar duplicar registros en caso de reinicio. |
| `[OUTPUT]` | `Name`            | `kinesis_firehose`                  | Plugin de destino para enviar registros a Amazon Kinesis Data Firehose.                                     |
| `[OUTPUT]` | `delivery_stream` | `bookstore-clickstream-stream`      | Nombre del recurso de entrega aprovisionado en AWS.                                                         |
| `[OUTPUT]` | `region`          | `us-east-1`                         | Región de AWS donde reside la infraestructura de datos.                                                     |
