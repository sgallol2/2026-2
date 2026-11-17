# Recreación de Infraestructura Base vía AWS CLI (CMD Windows)

**Propósito:** Reconstruir desde cero los 3 recursos previos que exige la sección **2.1** del Laboratorio Sidecar-Kinesis-S3, usando comandos compatibles con **CMD de Windows**.

> [!IMPORTANT]
> **Todos los comandos de esta guía se ejecutan en CMD (cmd.exe).** No uses PowerShell ni Git Bash.

---

## Paso 0: Verificar Credenciales AWS CLI

```cmd
aws sts get-caller-identity
```

Si ves `InvalidClientTokenId`, actualiza tus credenciales de AWS Academy en `C:\Users\ASUS\.aws\credentials`.

---

## Variables Globales

Configura estas variables al inicio de tu sesión de CMD. **Si cierras la terminal, debes ejecutarlas de nuevo.**

```cmd
set ACCOUNT_ID=683090163663
set REGION=us-east-1
set REGISTRY=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com
set IMAGE_TAG=8.1.0
set DB_ADMIN_PASSWORD=AdminMasterPassw0rd!
set APP_DB_PASSWORD=AppSecurePassword2026!
set INGEST_DB_PASSWORD=IngestSecurePassword2026!
```

---

## RECURSO 1: VPC y Subredes Multi-AZ

### 1.1 Crear la VPC

```cmd
aws ec2 create-vpc --cidr-block 172.16.0.0/16 --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=bookstore-vpc}]" --query "Vpc.VpcId" --output text
```

Copia el valor devuelto (ej. `vpc-0abc123def456`) y asígnalo:

```cmd
set VPC_ID=<PEGA_AQUI_EL_VPC_ID>
```

Habilitar DNS:

```cmd
aws ec2 modify-vpc-attribute --vpc-id %VPC_ID% --enable-dns-hostnames "{\"Value\":true}"
aws ec2 modify-vpc-attribute --vpc-id %VPC_ID% --enable-dns-support "{\"Value\":true}"
```

### 1.2 Crear las 8 Subredes

**Subredes Públicas:**

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.4.0/24 --availability-zone %REGION%a --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=public-subnet-1a},{Key=kubernetes.io/role/elb,Value=1}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PUB_1A=<PEGA_AQUI>
```

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.1.0/24 --availability-zone %REGION%b --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=public-subnet-1b},{Key=kubernetes.io/role/elb,Value=1}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PUB_1B=<PEGA_AQUI>
```

**Subredes Privadas Frontend:**

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.5.0/24 --availability-zone %REGION%a --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=private-frontend-subnet-1a}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PRIV_FE_1A=<PEGA_AQUI>
```

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.2.0/24 --availability-zone %REGION%b --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=private-frontend-subnet-1b}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PRIV_FE_1B=<PEGA_AQUI>
```

**Subredes Privadas Backend:**

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.6.0/24 --availability-zone %REGION%a --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=private-backend-subnet-1a},{Key=kubernetes.io/role/internal-elb,Value=1}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PRIV_BE_1A=<PEGA_AQUI>
```

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.3.0/24 --availability-zone %REGION%b --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=private-backend-subnet-1b},{Key=kubernetes.io/role/internal-elb,Value=1}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PRIV_BE_1B=<PEGA_AQUI>
```

**Subredes de Base de Datos:**

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.7.0/24 --availability-zone %REGION%a --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=private-db-subnet-1a}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PRIV_DB_1A=<PEGA_AQUI>
```

```cmd
aws ec2 create-subnet --vpc-id %VPC_ID% --cidr-block 172.16.8.0/24 --availability-zone %REGION%b --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=private-db-subnet-1b}]" --query "Subnet.SubnetId" --output text
```

```cmd
set PRIV_DB_1B=<PEGA_AQUI>
```

### 1.3 Internet Gateway

```cmd
aws ec2 create-internet-gateway --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=bookstore-igw}]" --query "InternetGateway.InternetGatewayId" --output text
```

```cmd
set IGW_ID=<PEGA_AQUI>
```

```cmd
aws ec2 attach-internet-gateway --internet-gateway-id %IGW_ID% --vpc-id %VPC_ID%
```

### 1.4 NAT Gateways

**Elastic IPs:**

```cmd
aws ec2 allocate-address --domain vpc --query "AllocationId" --output text
```

```cmd
set EIP_A=<PEGA_AQUI>
```

```cmd
aws ec2 allocate-address --domain vpc --query "AllocationId" --output text
```

```cmd
set EIP_B=<PEGA_AQUI>
```

**NAT Gateway AZ-a:**

```cmd
aws ec2 create-nat-gateway --subnet-id %PUB_1A% --allocation-id %EIP_A% --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=bookstore-nat-gw-a}]" --query "NatGateway.NatGatewayId" --output text
```

```cmd
set NAT_A=<PEGA_AQUI>
```

**NAT Gateway AZ-b:**

```cmd
aws ec2 create-nat-gateway --subnet-id %PUB_1B% --allocation-id %EIP_B% --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=bookstore-nat-gw-b}]" --query "NatGateway.NatGatewayId" --output text
```

```cmd
set NAT_B=<PEGA_AQUI>
```

**Esperar a que estén disponibles (~2 min):**

```cmd
aws ec2 wait nat-gateway-available --nat-gateway-ids %NAT_A% %NAT_B%
echo NAT Gateways listos.
```

### 1.5 Route Tables

**Tabla Pública:**

```cmd
aws ec2 create-route-table --vpc-id %VPC_ID% --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=rt-public}]" --query "RouteTable.RouteTableId" --output text
```

```cmd
set RT_PUB=<PEGA_AQUI>
```

```cmd
aws ec2 create-route --route-table-id %RT_PUB% --destination-cidr-block 0.0.0.0/0 --gateway-id %IGW_ID%
aws ec2 associate-route-table --route-table-id %RT_PUB% --subnet-id %PUB_1A%
aws ec2 associate-route-table --route-table-id %RT_PUB% --subnet-id %PUB_1B%
aws ec2 modify-subnet-attribute --subnet-id %PUB_1A% --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id %PUB_1B% --map-public-ip-on-launch
```

**Tabla Privada AZ-a:**

```cmd
aws ec2 create-route-table --vpc-id %VPC_ID% --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=rt-private-a}]" --query "RouteTable.RouteTableId" --output text
```

```cmd
set RT_PRIV_A=<PEGA_AQUI>
```

```cmd
aws ec2 create-route --route-table-id %RT_PRIV_A% --destination-cidr-block 0.0.0.0/0 --nat-gateway-id %NAT_A%
aws ec2 associate-route-table --route-table-id %RT_PRIV_A% --subnet-id %PRIV_FE_1A%
aws ec2 associate-route-table --route-table-id %RT_PRIV_A% --subnet-id %PRIV_BE_1A%
```

**Tabla Privada AZ-b:**

```cmd
aws ec2 create-route-table --vpc-id %VPC_ID% --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=rt-private-b}]" --query "RouteTable.RouteTableId" --output text
```

```cmd
set RT_PRIV_B=<PEGA_AQUI>
```

```cmd
aws ec2 create-route --route-table-id %RT_PRIV_B% --destination-cidr-block 0.0.0.0/0 --nat-gateway-id %NAT_B%
aws ec2 associate-route-table --route-table-id %RT_PRIV_B% --subnet-id %PRIV_FE_1B%
aws ec2 associate-route-table --route-table-id %RT_PRIV_B% --subnet-id %PRIV_BE_1B%
```

**Tabla Base de Datos (solo ruta local):**

```cmd
aws ec2 create-route-table --vpc-id %VPC_ID% --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=rt-database}]" --query "RouteTable.RouteTableId" --output text
```

```cmd
set RT_DB=<PEGA_AQUI>
```

```cmd
aws ec2 associate-route-table --route-table-id %RT_DB% --subnet-id %PRIV_DB_1A%
aws ec2 associate-route-table --route-table-id %RT_DB% --subnet-id %PRIV_DB_1B%
```

---

## Security Groups (solo los necesarios para RDS + EKS)

```cmd
aws ec2 create-security-group --group-name backend-sg --description "Permite trafico al backend" --vpc-id %VPC_ID% --query "GroupId" --output text
```

```cmd
set SG_BACKEND=<PEGA_AQUI>
```

```cmd
aws ec2 create-security-group --group-name rds-sg --description "PostgreSQL solo desde backend" --vpc-id %VPC_ID% --query "GroupId" --output text
```

```cmd
set SG_RDS=<PEGA_AQUI>
```

```cmd
aws ec2 authorize-security-group-ingress --group-id %SG_RDS% --protocol tcp --port 5432 --source-group %SG_BACKEND%
```

```cmd
aws ec2 authorize-security-group-ingress --group-id %SG_RDS% --protocol tcp --port 5432 --cidr 172.16.0.0/16
```

---

## RECURSO 2: Base de Datos Amazon RDS PostgreSQL

### 2.1 Crear DB Subnet Group

```cmd
aws rds create-db-subnet-group --db-subnet-group-name bookstore-db-subnet-group --db-subnet-group-description "Subnets para BookStore RDS" --subnet-ids %PRIV_DB_1A% %PRIV_DB_1B%
```

### 2.2 Crear la Instancia RDS

> [!TIP]
> Si deseas verificar las versiones exactas de PostgreSQL 16 disponibles en tu región, ejecuta:
> `aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[?starts_with(EngineVersion, '16.')].EngineVersion" --output text`
> Generalmente están disponibles `16.1`, `16.2`, `16.3` o la versión default si omites el parámetro.

```cmd
aws rds create-db-instance --db-instance-identifier bookstore-db --db-instance-class db.t3.micro --engine postgres --master-username postgres --master-user-password "%DB_ADMIN_PASSWORD%" --allocated-storage 20 --storage-type gp3 --no-storage-encrypted --db-name bookstore --vpc-security-group-ids %SG_RDS% --db-subnet-group-name bookstore-db-subnet-group --no-publicly-accessible --no-multi-az --backup-retention-period 0 --no-auto-minor-version-upgrade
```

**Esperar a que esté disponible (~5-8 min):**

```cmd
echo Esperando RDS... esto tarda 5-8 minutos.
aws rds wait db-instance-available --db-instance-identifier bookstore-db
echo RDS listo.
```

**Obtener el endpoint:**

```cmd
aws rds describe-db-instances --db-instance-identifier bookstore-db --query "DBInstances[0].Endpoint.Address" --output text
```

```cmd
set RDS_ENDPOINT=<PEGA_AQUI_EL_ENDPOINT>
```

### 2.3 Bootstrap de la Base de Datos (EC2 temporal)

**Obtener AMI de Ubuntu:**

```cmd
aws ec2 describe-images --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" "Name=state,Values=available" --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" --output text
```

```cmd
set UBUNTU_AMI=<PEGA_AQUI>
```

**Obtener el Instance Profile de LabRole:**

```cmd
aws iam list-instance-profiles --query "InstanceProfiles[?contains(InstanceProfileName,'LabInstanceProfile')].Arn | [0]" --output text
```

```cmd
set LAB_PROFILE_ARN=<PEGA_AQUI>
```

**Lanzar instancia bastión:**

```cmd
aws ec2 run-instances --image-id %UBUNTU_AMI% --instance-type t3.micro --subnet-id %PUB_1A% --security-group-ids %SG_BACKEND% --iam-instance-profile Arn=%LAB_PROFILE_ARN% --associate-public-ip-address --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=bookstore-bastion-temp}]" --query "Instances[0].InstanceId" --output text
```

```cmd
set BASTION_ID=<PEGA_AQUI>
```

**Esperar a que esté listo:**

```cmd
aws ec2 wait instance-status-ok --instance-ids %BASTION_ID%
echo Bastion listo.
```

**Conectarse y ejecutar el bootstrap:**

1. Ve a la **Consola Web de AWS** → **EC2** → **Instances**.
2. Selecciona `bookstore-bastion-temp` → **Connect** → **EC2 Instance Connect** → **Connect**.
3. En la terminal web que se abre, ejecuta estos comandos **(reemplaza el endpoint de RDS)**:

```bash
sudo apt update -y && sudo apt install -y git postgresql-client

git clone https://github.com/bookstore-fe-be/2026-2 /tmp/bookstore
cd /tmp/bookstore/database/rds

cat << 'EOF' > bootstrap.env
DB_HOST=<PEGA_TU_RDS_ENDPOINT>
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

chmod +x bootstrap.sh
./bootstrap.sh
```

> [!NOTE]
> Los comandos de arriba (dentro de EC2 Instance Connect) sí son **bash Linux** porque se ejecutan dentro de la instancia Ubuntu, no en tu CMD local.

**Terminar la instancia bastión (de vuelta en tu CMD local):**

```cmd
aws ec2 terminate-instances --instance-ids %BASTION_ID%
echo Bastion terminado.
```

---

## RECURSO 3: Clúster EKS (my-cluster)

### 3.1 Crear el Clúster con eksctl

> [!WARNING]
> Este comando tarda **~15-20 minutos**. No cierres la terminal.

```cmd
eksctl create cluster --name my-cluster --region %REGION% --vpc-private-subnets %PRIV_BE_1A%,%PRIV_BE_1B% --vpc-public-subnets %PUB_1A%,%PUB_1B% --nodegroup-name standard-workers --node-type t3.medium --nodes 2 --nodes-min 2 --nodes-max 3 --managed
```

### 3.2 Verificar la conexión

```cmd
aws eks update-kubeconfig --region %REGION% --name my-cluster
kubectl get nodes
```

---

## Verificación Final

```cmd
echo ===== RECURSO 1: VPC =====
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=bookstore-vpc" --query "Vpcs[*].[VpcId,CidrBlock,State]" --output table

echo ===== RECURSO 2: RDS =====
aws rds describe-db-instances --db-instance-identifier bookstore-db --query "DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]" --output table

echo ===== RECURSO 3: EKS =====
aws eks describe-cluster --name my-cluster --query "cluster.[name,status,version]" --output table
kubectl get nodes
```

---

## Resumen de Variables (copia para la siguiente guía)

Al terminar, imprime todo para tenerlo a mano:

```cmd
echo ACCOUNT_ID=%ACCOUNT_ID%
echo REGION=%REGION%
echo REGISTRY=%REGISTRY%
echo VPC_ID=%VPC_ID%
echo PUB_1A=%PUB_1A%
echo PUB_1B=%PUB_1B%
echo RDS_ENDPOINT=%RDS_ENDPOINT%
echo SG_BACKEND=%SG_BACKEND%
echo SG_RDS=%SG_RDS%
```

> [!TIP]
> Guarda esa salida en un archivo para no perderla si cierras CMD:
>
> ```cmd
> echo set ACCOUNT_ID=%ACCOUNT_ID%> vars.cmd
> echo set REGION=%REGION%>> vars.cmd
> echo set VPC_ID=%VPC_ID%>> vars.cmd
> echo set PUB_1A=%PUB_1A%>> vars.cmd
> echo set PUB_1B=%PUB_1B%>> vars.cmd
> echo set RDS_ENDPOINT=%RDS_ENDPOINT%>> vars.cmd
> echo set SG_BACKEND=%SG_BACKEND%>> vars.cmd
> echo set SG_RDS=%SG_RDS%>> vars.cmd
> ```
>
> Después solo ejecutas `vars.cmd` para recuperarlas.
