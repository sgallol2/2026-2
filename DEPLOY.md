# PARTE 2: Guía Paso a Paso de Despliegue Manual en la Consola Web de AWS

---

## MÓDULO 1: Red y Topología (Amazon VPC)

### 1.1 Crear la VPC

1. Ve a **VPC** > **Your VPCs** > **Create VPC**.
2. Selecciona **VPC only**.
3. **Name tag**: `bookstore-vpc`.
4. **IPv4 CIDR block**: `172.16.0.0/16`.
5. Clic en **Create VPC**.
6. En la VPC creada, ve a **Actions** > **Edit VPC settings** > Habilita **Enable DNS hostnames** y **Enable DNS resolution** > **Save changes**.

### 1.2 Crear las 8 Subredes (4 por cada AZ)

Ve a **VPC** > **Subnets** > **Create subnet**. Selecciona `bookstore-vpc` y crea las siguientes subredes:

| Nombre                       | Zona de Disponibilidad | Bloque CIDR IPv4 | Tipo de Tráfico                     |
| ---------------------------- | ---------------------- | ---------------- | ----------------------------------- |
| `public-subnet-1a`           | `us-east-1a`           | `172.16.4.0/24`  | Pública (ALB público + NAT-GW-A)    |
| `public-subnet-1b`           | `us-east-1b`           | `172.16.1.0/24`  | Pública (ALB público + NAT-GW-B)    |
| `private-frontend-subnet-1a` | `us-east-1a`           | `172.16.5.0/24`  | Privada (Frontend ASG)              |
| `private-frontend-subnet-1b` | `us-east-1b`           | `172.16.2.0/24`  | Privada (Frontend ASG)              |
| `private-backend-subnet-1a`  | `us-east-1a`           | `172.16.6.0/24`  | Privada (Backend ASG + ALB Interno) |
| `private-backend-subnet-1b`  | `us-east-1b`           | `172.16.3.0/24`  | Privada (Backend ASG + ALB Interno) |
| `private-db-subnet-1a`       | `us-east-1a`           | `172.16.7.0/24`  | Privada (RDS PostgreSQL)            |
| `private-db-subnet-1b`       | `us-east-1b`           | `172.16.8.0/24`  | Privada (RDS PostgreSQL)            |

### 1.3 Crear y asociar Internet Gateway (IGW)

1. Ve a **VPC** > **Internet Gateways** > **Create internet gateway**.
2. Nombre: `bookstore-igw` > **Create internet gateway**.
3. Clic en **Actions** > **Attach to VPC** > Selecciona `bookstore-vpc` > **Attach**.

### 1.4 Crear los NAT Gateways (Alta Disponibilidad)

1. Ve a **VPC** > **NAT Gateways** > **Create NAT gateway**:
   - **Name**: `bookstore-nat-gw-a`.
   - **Subnet**: `public-subnet-1a`.
   - **Connectivity type**: Public.
   - Clic en **Allocate Elastic IP**.
   - Clic en **Create NAT gateway**.
2. Repite el proceso para la segunda AZ:
   - **Name**: `bookstore-nat-gw-b`.
   - **Subnet**: `public-subnet-1b`.
   - Clic en **Allocate Elastic IP** > **Create NAT gateway**.
     _(Espera ~2 minutos a que el estado pase a `Available`)_.

### 1.5 Configurar Tablas de Enrutamiento (Route Tables)

Ve a **VPC** > **Route Tables**:

1. **Tabla Pública (`rt-public`)**:
   - Crea una tabla con nombre `rt-public` en `bookstore-vpc`.
   - En **Routes** > **Edit routes** > **Add route**:
     - Destination: `0.0.0.0/0` | Target: `Internet Gateway` (`bookstore-igw`).
   - En **Subnet associations** > **Edit subnet associations**: Asocia `public-subnet-1a` y `public-subnet-1b`.

2. **Tabla Privada AZ-a (`rt-private-a`)**:
   - Crea `rt-private-a` en `bookstore-vpc`.
   - **Routes** > **Add route**:
     - Destination: `0.0.0.0/0` | Target: `NAT Gateway` (`bookstore-nat-gw-a`).
   - **Subnet associations**: Asocia `private-frontend-subnet-1a` y `private-backend-subnet-1a`.

3. **Tabla Privada AZ-b (`rt-private-b`)**:
   - Crea `rt-private-b` en `bookstore-vpc`.
   - **Routes** > **Add route**:
     - Destination: `0.0.0.0/0` | Target: `NAT Gateway` (`bookstore-nat-gw-b`).
   - **Subnet associations**: Asocia `private-frontend-subnet-1b` y `private-backend-subnet-1b`.

4. **Tabla Base de Datos (`rt-database`)**:
   - Crea `rt-database` en `bookstore-vpc`.
   - Deja solo la ruta local `172.16.0.0/16 -> local` (sin salida a internet).
   - **Subnet associations**: Asocia `private-db-subnet-1a` y `private-db-subnet-1b`.

---

## MÓDULO 2: Grupos de Seguridad (Security Groups)

Ve a **EC2** > **Security Groups** > **Create security group** y crea en `bookstore-vpc`:

### 2.1 `sg-public-alb`

- **Descripción**: Permite tráfico HTTP público desde internet.
- **Inbound Rules**:
  - Type: `HTTP` (80) | Source: `Anywhere-IPv4` (`0.0.0.0/0`).
- **Outbound Rules**: Todo el tráfico habilitado.

### 2.2 `sg-frontend-asg`

- **Descripción**: Permite tráfico únicamente desde el Public ALB.
- **Inbound Rules**:
  - Type: `Custom TCP` (Puerto `80`) | Source: `Custom` > selecciona `sg-public-alb`.
- **Outbound Rules**: Todo el tráfico (para llegar al ALB interno y descargar de ECR vía NAT-GW).

### 2.3 `sg-internal-alb`

- **Descripción**: Permite tráfico interno desde las instancias frontend.
- **Inbound Rules**:
  - Type: `Custom TCP` (Puerto `80`) | Source: `Custom` > selecciona `sg-frontend-asg`.
- **Outbound Rules**: Todo el tráfico habilitado.

### 2.4 `sg-backend-asg`

- **Descripción**: Permite tráfico únicamente desde el ALB interno.
- **Inbound Rules**:
  - Type: `Custom TCP` (Puerto `5001`) | Source: `Custom` > selecciona `sg-internal-alb`.
- **Outbound Rules**: Todo el tráfico habilitado.

### 2.5 `sg-rds-postgres`

- **Descripción**: Permite conexiones PostgreSQL únicamente desde el backend.
- **Inbound Rules**:
  - Type: `PostgreSQL` (Puerto `5432`) | Source: `Custom` > selecciona `sg-backend-asg`.
- **Outbound Rules**: Todo el tráfico.

---

## MÓDULO 3: Rol IAM para las Instancias EC2

> [!IMPORTANT]
> **Si estás utilizando AWS Academy (Learner Lab):**
> En AWS Academy **NO** tienes permisos para crear roles de IAM (`iam:CreateRole` dará error de `AccessDenied`).
> **Debes omitir este módulo**. AWS Academy ya incluye un rol preconfigurado llamado **`LabRole`** (o `LabInstanceProfile`), el cual ya tiene todos los permisos necesarios para autenticarse en Amazon ECR (`AmazonEC2ContainerRegistryReadOnly`) y conectarse mediante Systems Manager (`AmazonSSMManagedInstanceCore`).
> En los pasos 6.3 y 7.3, simplemente selecciona **`LabRole`** en el menú desplegable.

#### (Solo para cuentas estándar de AWS - Omitir en AWS Academy)

Si estás en una cuenta propia de AWS que permite administración de IAM:

1. Ve a **IAM** > **Roles** > **Create role**.
2. **Trusted entity type**: `AWS service`.
3. **Use case**: `EC2` > Clic en **Next**.
4. Añade las siguientes políticas gestionadas:
   - `AmazonEC2ContainerRegistryReadOnly`
   - `AmazonSSMManagedInstanceCore`
5. **Role name**: `bookstore-ec2-role` > **Create role**.

---

## MÓDULO 4: Repositorios en Amazon ECR y Publicación de Imágenes

### 4.1 Crear Repositorios en ECR

1. Ve a **Amazon ECR** > **Repositories** > **Create repository**.
2. Repositorio 1:
   - Visibility: `Private`.
   - Name: `bookstore-backend` > **Create repository**.
3. Repositorio 2:
   - Visibility: `Private`.
   - Name: `bookstore-frontend` > **Create repository**.

### 4.2 Construir y Publicar Imágenes Multiplataforma

Desde tu terminal local (siguiendo la sección _Publicar imágenes_ del [README.md](file:///c:/Users/ASUS/Desktop/cloud_computing/2026-2/README.md#L127-L189)):

```bash
# 1. Configurar variables en .env de la raíz
# IMAGE_REGISTRY=<ID_CUENTA>.dkr.ecr.<REGION>.amazonaws.com
# IMAGE_TAG=1.0.0 (según archivo VERSION)

# 2. Login a ECR
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ID_CUENTA>.dkr.ecr.<REGION>.amazonaws.com

# 3. Compilar y publicar con buildx
docker buildx bake -f compose.yaml --set "*.platform=linux/amd64,linux/arm64" --push backend frontend
```

---

## MÓDULO 5: Base de Datos (Amazon RDS PostgreSQL) y Bootstrap

### 5.1 Crear DB Subnet Group

1. Ve a **RDS** > **Subnet groups** > **Create DB Subnet Group**.
2. **Name**: `bookstore-db-subnet-group`.
3. **VPC**: `bookstore-vpc`.
4. **Add subnets**:
   - Availability Zones: Selecciona `us-east-1a` y `us-east-1b`.
   - Subnets: Selecciona `172.16.7.0/24` (`private-db-subnet-1a`) y `172.16.8.0/24` (`private-db-subnet-1b`).
5. Clic en **Create**.

### 5.2 Crear la Base de Datos RDS PostgreSQL

> [!IMPORTANT]
> **Ajuste para AWS Academy (Learner Lab):**
> En AWS Academy, las políticas del laboratorio bloquean la creación de instancias con *Multi-AZ* o clases grandes (`db.m5.*`), arrojando un error de `not authorized to perform: rds:CreateDBInstance`. Por esta razón, se debe seleccionar **Free tier** y **Single DB instance** con clase **`db.t3.micro`**. *(En una cuenta comercial de AWS sin restricciones académicas se usaría Multi-AZ con `db.m5.large`)*.

1. Ve a **RDS** > **Databases** > **Create database**.
2. **Choose a database creation method**: `Standard create`.
3. **Engine options**: `PostgreSQL` (Versión 16 o compatible con Node.js 24).
4. **Templates**: Selecciona **`Free tier`** (Capa gratuita) o **`Dev/Test`**.
5. **Deployment options**: Selecciona **`Single DB instance`** (Instancia de base de datos única).
6. **Settings**:
   - **DB instance identifier**: `bookstore-db`.
   - **Master username**: `postgres`.
   - **Master password**: Asigna una contraseña segura (ej. `AdminMasterPassw0rd!`).
7. **Instance configuration**:
   - DB instance class: **`db.t3.micro`** (o `db.t4g.micro`).
8. **Storage (Almacenamiento)**:
   - Storage type: **`General Purpose SSD (gp3)`** (o `gp2`).
   - Allocated storage: **`20 GiB`**.
   - **Enable storage autoscaling**: Desmárcalo (para no consumir créditos imprevistos).
9. **Connectivity**:
   - Compute resource: Selecciona **`Don't connect to an EC2 compute resource`** (No conectarse a un recurso informático de EC2).
   - Network type: `IPv4`.
   - Virtual private cloud (VPC): `bookstore-vpc`.
   - DB Subnet group: `bookstore-db-subnet-group`.
   - Public access: **No**.
   - VPC security group: Selecciona **Choose existing** > quita el default y selecciona únicamente **`sg-rds-postgres`**.
10. **Additional configuration**:
    - Initial database name: `bookstore`.
11. Clic en **Create database** *(Tarda de 5 a 8 minutos)*.
12. Una vez pase a estado `Available`, haz clic sobre `bookstore-db` y anota el **Endpoint** generado (ej. `bookstore-db.xxxxxx.us-east-1.rds.amazonaws.com`).


### 5.3 Ejecutar el Bootstrap de la Base de Datos (en EC2 Temporal)

Dado que RDS está en subredes privadas sin acceso público directo, el script [database/rds/bootstrap.sh](file:///c:/Users/ASUS/Desktop/cloud_computing/2026-2/database/rds/bootstrap.sh) debe ejecutarse desde dentro de la VPC. La forma más limpia y estándar es lanzar una pequeña instancia EC2 temporal (bastion host), ejecutar la inicialización y luego terminarla.

#### Paso 1: Lanzar la instancia EC2 temporal

1. Ve a **EC2** > **Instances** > **Launch instances**.
2. **Name**: `bookstore-bastion-temp`.
3. **Application and OS Images (AMI)**: `Amazon Linux 2023 AMI` (64-bit x86).
4. **Instance type**: `t3.micro`.
5. **Key pair**: _Proceed without a key pair_ (no la necesitas, nos conectaremos vía navegador).
6. **Network settings** > Clic en **Edit**:
   - **VPC**: `bookstore-vpc`.
   - **Subnet**: `public-subnet-1a`.
   - **Auto-assign public IP**: `Enable`.
   - **Firewall (security groups)**: Selecciona **Select existing security group** > Elige **`sg-backend-asg`**.
     > [!TIP]
     > Al asignarle `sg-backend-asg`, el grupo de seguridad de RDS (`sg-rds-postgres`) le permitirá conectarse automáticamente por el puerto 5432 sin tener que crear reglas adicionales.
7. **Advanced details**:
   - **IAM instance profile**: Selecciona **`LabRole`** (en AWS Academy).
8. Clic en **Launch instance**.

---

#### Paso 2: Conectarse a la instancia desde la consola web

1. En la lista de instancias EC2, espera a que `bookstore-bastion-temp` esté en estado `Running`.
2. Selecciónala y haz clic en el botón superior **Connect**.
3. Elige la pestaña **EC2 Instance Connect** (o **Session Manager**) y haz clic en **Connect**.
4. Se abrirá una terminal Linux directamente en tu navegador.

---

#### Paso 3: Instalar utilitarios y clonar el repositorio

En la terminal web que se abrió, ejecuta:

```bash
# 1. Actualizar el sistema e instalar Git y el cliente PostgreSQL 16
sudo dnf update -y
sudo dnf install -y git postgresql16

# 2. Clonar tu repositorio de BookStore y entrar a la carpeta de RDS
git clone https://github.com/sgallol2/2026-2.git bookstore
cd bookstore/database/rds
```

_(Si tu repositorio es privado o prefieres no ingresar credenciales de GitHub, puedes crear directamente la carpeta `mkdir -p bookstore/database/rds` y copiar los archivos `.sql` y el `bootstrap.sh`)_.

---

#### Paso 4: Crear el archivo `bootstrap.env` y ejecutar la inicialización

1. Crea el archivo de variables con tus credenciales de RDS:

```bash
cat << 'EOF' > bootstrap.env
DB_HOST=REPLACE_WITH_RDS_ENDPOINT
DB_PORT=5432
DB_NAME=bookstore
DB_ADMIN_USER=postgres
DB_ADMIN_PASSWORD=AdminMasterPassw0rd!
APP_DB_USER=bookstore_app
APP_DB_PASSWORD=AppSecurePassword2026!
INGEST_DB_USER=bookstore_ingest
INGEST_DB_PASSWORD=IngestSecurePassword2026!
PGSSLMODE=require
EOF
```

_(Reemplaza `REPLACE_WITH_RDS_ENDPOINT` por el Endpoint de tu RDS copiado en el paso 5.2, y ajusta las contraseñas que definiste)_.

2. Da permisos de ejecución y corre el script de inicialización:

```bash
chmod +x bootstrap.sh
./bootstrap.sh
```

3. Verifica que la salida termine con:

```text
[YYYY-MM-DD HH:MM:SS] BookStore Co. database bootstrap completed successfully
```

---

#### Paso 5: Terminar la instancia temporal (Ahorro de créditos)

Una vez completada la inicialización, la base de datos ya tiene todas las tablas, usuarios y catálogo de libros cargados. Ya no necesitas esta máquina:

1. Ve a **EC2** > **Instances**.
2. Selecciona `bookstore-bastion-temp`.
3. Clic en **Instance state** > **Terminate instance** > **Terminate**.

---

## MÓDULO 6: Capa de Backend e Internal ALB

### 6.1 Crear Target Group del Backend

1. Ve a **EC2** > **Target Groups** > **Create target group**.
2. **Target type**: `Instances`.
3. **Target group name**: `tg-backend-5001`.
4. **Protocol**: `HTTP` | **Port**: `5001`.
5. **VPC**: `bookstore-vpc`.
6. **Health checks**:
   - Health check protocol: `HTTP`.
   - Health check path: `/health`.
7. Clic en **Next** > Omite el registro manual de instancias > **Create target group**.

### 6.2 Crear el Internal Application Load Balancer

1. Ve a **EC2** > **Load Balancers** > **Create load balancer** > **Application Load Balancer** > **Create**.
2. **Basic configuration**:
   - Name: `bookstore-alb-internal`.
   - Scheme: **Internal** _(Vital: no orientado a internet)_.
   - IP address type: `IPv4`.
3. **Network mapping**:
   - VPC: `bookstore-vpc`.
   - Subnets: Selecciona `private-backend-subnet-1a` (`172.16.6.0/24`) y `private-backend-subnet-1b` (`172.16.3.0/24`).
4. **Security groups**: Selecciona `sg-internal-alb`.
5. **Listeners and routing**:
   - Protocol: `HTTP` | Port: `80`.
   - Default action: Forward to `tg-backend-5001`.
6. Clic en **Create load balancer**.
7. Copia el **DNS Name** del ALB interno (ej. `internal-bookstore-alb-internal-xxxx.us-east-1.elb.amazonaws.com`).

### 6.3 Crear Launch Template para Backend

1. Ve a **EC2** > **Launch Templates** > **Create launch template**.
2. **Launch template name**: `lt-bookstore-backend`.
3. **Application and OS Images (AMI)**: `Amazon Linux 2023 AMI` (64-bit x86).
4. **Instance type**: `t3.micro` o `t3.small`.
5. **Key pair**: _Don't include in launch template_ (se administrará vía SSM).
6. **Network settings**:
   - Firewall: Selecciona `sg-backend-asg`.
7. **Advanced details**:
   - IAM instance profile: Selecciona **`LabRole`** (en AWS Academy) o `bookstore-ec2-role` (en cuenta estándar).
   - **User data** (script de inicio):

```bash
#!/bin/bash
dnf update -y
dnf install -y docker
systemctl start docker
systemctl enable docker

# Login a ECR
REGION="us-east-1"
REGISTRY="<ID_CUENTA>.dkr.ecr.${REGION}.amazonaws.com"
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${REGISTRY}

# Iniciar contenedor Backend
docker run -d \
  --name bookstore-backend \
  --restart unless-stopped \
  -p 5001:5001 \
  -e NODE_ENV=production \
  -e SERVICE_NAME=bookstore-api \
  -e PORT=5001 \
  -e API_BASE_PATH=/api \
  -e CORS_ORIGINS="http://*" \
  -e HTTP_TRUST_PROXY_HOPS=3 \
  -e ACCESS_LOG_ENABLED=true \
  -e CLICKSTREAM_FILE_ENABLED=false \
  -e AUTH_JWT_SECRET="4voFHxYerDe9+xENq1vgmNucC8c6iCJGNt48EJgnxlw=" \
  -e AUTH_COOKIE_SECURE=false \
  -e DB_HOST="bookstore-db.xxxxxx.us-east-1.rds.amazonaws.com" \
  -e DB_PORT=5432 \
  -e DB_NAME="bookstore" \
  -e APP_DB_USER="bookstore_app" \
  -e APP_DB_PASSWORD="AppSecurePassword2026!" \
  -e DB_SSL=true \
  -e DB_SSL_REJECT_UNAUTHORIZED=false \
  ${REGISTRY}/bookstore-backend:1.0.0
```

8. Clic en **Create launch template**.

### 6.4 Crear Auto Scaling Group para Backend

1. Ve a **EC2** > **Auto Scaling Groups** > **Create Auto Scaling group**.
2. **Name**: `asg-bookstore-backend`.
3. **Launch template**: `lt-bookstore-backend` > **Next**.
4. **Network**:
   - VPC: `bookstore-vpc`.
   - Subnets: Selecciona `private-backend-subnet-1a` y `private-backend-subnet-1b` > **Next**.
5. **Load balancing**:
   - Selecciona **Attach to an existing load balancer**.
   - Selecciona **Choose from your load balancer target groups**: `tg-backend-5001`.
   - Health checks: Activa **Turn on Elastic Load Balancing health checks** > **Next**.
6. **Group size and scaling policies**:
   - Desired: `2`, Min: `2`, Max: `4` > **Next**.
7. Avanza hasta **Create Auto Scaling group**.

---

## MÓDULO 7: Capa de Frontend y Public ALB

### 7.1 Crear Target Group del Frontend

1. Ve a **EC2** > **Target Groups** > **Create target group**.
2. **Target type**: `Instances`.
3. **Target group name**: `tg-frontend-80`.
4. **Protocol**: `HTTP` | **Port**: `80`.
5. **VPC**: `bookstore-vpc`.
6. **Health checks**:
   - Health check path: `/health` (atendido por NGINX).
7. Clic en **Next** > **Create target group**.

### 7.2 Crear el Public Application Load Balancer

1. Ve a **EC2** > **Load Balancers** > **Create Application Load Balancer**.
2. **Basic configuration**:
   - Name: `bookstore-alb-public`.
   - Scheme: **Internet-facing**.
3. **Network mapping**:
   - VPC: `bookstore-vpc`.
   - Subnets: Selecciona `public-subnet-1a` (`172.16.4.0/24`) y `public-subnet-1b` (`172.16.1.0/24`).
4. **Security groups**: Selecciona `sg-public-alb`.
5. **Listeners and routing**:
   - Protocol: `HTTP` | Port: `80`.
   - Default action: Forward to `tg-frontend-80`.
6. Clic en **Create load balancer**.
7. Copia el **DNS Name** del ALB público (ej. `bookstore-alb-public-xxxx.us-east-1.elb.amazonaws.com`).

### 7.3 Crear Launch Template para Frontend

1. Ve a **EC2** > **Launch Templates** > **Create launch template**.
2. **Name**: `lt-bookstore-frontend`.
3. **AMI**: `Amazon Linux 2023 AMI` (64-bit x86).
4. **Instance type**: `t3.micro`.
5. **Security Group**: `sg-frontend-asg`.
6. **Advanced details**:
   - IAM instance profile: Selecciona **`LabRole`** (en AWS Academy) o `bookstore-ec2-role` (en cuenta estándar).
   - **User data**:
     _(Reemplaza `<INTERNAL_ALB_DNS>` con el DNS del ALB interno copiado en el paso 6.2)_

```bash
#!/bin/bash
dnf update -y
dnf install -y docker
systemctl start docker
systemctl enable docker

REGION="us-east-1"
REGISTRY="<ID_CUENTA>.dkr.ecr.${REGION}.amazonaws.com"
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${REGISTRY}

INTERNAL_ALB_URL="http://<INTERNAL_ALB_DNS>"

docker run -d \
  --name bookstore-frontend \
  --restart unless-stopped \
  -p 80:80 \
  -e NGINX_PORT=80 \
  -e API_PROXY_PREFIX=/api \
  -e PROXY_PASS="${INTERNAL_ALB_URL}" \
  ${REGISTRY}/bookstore-frontend:1.0.0
```

7. Clic en **Create launch template**.

### 7.4 Crear Auto Scaling Group para Frontend

1. Ve a **EC2** > **Auto Scaling Groups** > **Create Auto Scaling group**.
2. **Name**: `asg-bookstore-frontend`.
3. **Launch template**: `lt-bookstore-frontend` > **Next**.
4. **Network**:
   - VPC: `bookstore-vpc`.
   - Subnets: Selecciona `private-frontend-subnet-1a` (`172.16.5.0/24`) y `private-frontend-subnet-1b` (`172.16.2.0/24`) > **Next**.
5. **Load balancing**:
   - Selecciona **Attach to an existing load balancer**.
   - Target group: `tg-frontend-80`.
   - Health checks: Activa **ELB health checks** > **Next**.
6. **Group size**:
   - Desired: `2`, Min: `2`, Max: `4` > **Next**.
7. Avanza y haz clic en **Create Auto Scaling group**.

---

## MÓDULO 8: Verificación y Pruebas End-to-End

1. **Revisar Target Groups**:
   - En **EC2** > **Target Groups**, inspecciona `tg-backend-5001` y `tg-frontend-80`. Ambos deben mostrar 2 instancias en estado **Healthy**.
2. **Acceso al aplicativo**:
   - Abre el navegador e ingresa a la URL del ALB Público: `http://<DNS_PUBLIC_ALB>`.
   - Deberás ver la Single Page Application (SPA) de BookStore Co. cargando los libros desde la base de datos a través de toda la cadena de proxies y balanceadores.
3. **Prueba de Autenticación y Flujo Completo**:
   - Inicia sesión con el usuario de prueba predeterminado:
     ```text
     synthetic.customer.0008@bookstore.test
     ```
   - Agrega un libro al carrito y genera una orden de compra. La cookie de sesión `bookstore_session` debe persistir y la orden debe registrarse correctamente en Amazon RDS.
