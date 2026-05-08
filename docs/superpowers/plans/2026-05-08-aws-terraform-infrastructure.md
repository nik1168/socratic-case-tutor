# AWS + Terraform Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the full stack to AWS (App Runner for backend, Amplify for Next.js frontend, RDS for PostgreSQL) managed by Terraform, running in parallel with the existing Railway + Vercel deployment.

**Architecture:** A single VPC with two public subnets hosts an App Runner VPC connector (for RDS access) and an RDS PostgreSQL instance; the App Runner service pulls a Docker image from ECR and auto-redeploys on image push. Amplify Hosting (SSR mode) builds and serves the Next.js app directly from the GitHub repo. GitHub Actions uses OIDC (no long-lived credentials) to push Docker images to ECR on every merge to main.

**Tech Stack:** Terraform ≥ 1.9, AWS provider ≥ 5.0, Python 3.12 / uv (Docker), AWS App Runner, AWS RDS PostgreSQL 16, AWS Amplify Hosting (WEB_COMPUTE), AWS ECR, AWS Secrets Manager, GitHub Actions OIDC.

---

## Pre-requisites (manual, one-time)

These must be done by a human before running `terraform init`.

1. **AWS account** with an IAM user that has `AdministratorAccess`. Configure the CLI:
   ```bash
   aws configure
   # AWS Access Key ID: <your key>
   # AWS Secret Access Key: <your secret>
   # Default region: us-east-1
   # Default output format: json
   ```

2. **Terraform state S3 bucket** (bucket names must be globally unique — replace `<YOUR_ACCOUNT_ID>`):
   ```bash
   aws s3 mb s3://case-tutor-tfstate-<YOUR_ACCOUNT_ID> --region us-east-1
   aws s3api put-bucket-versioning \
     --bucket case-tutor-tfstate-<YOUR_ACCOUNT_ID> \
     --versioning-configuration Status=Enabled
   aws s3api put-bucket-encryption \
     --bucket case-tutor-tfstate-<YOUR_ACCOUNT_ID> \
     --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   ```

3. **DynamoDB lock table:**
   ```bash
   aws dynamodb create-table \
     --table-name case-tutor-terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region us-east-1
   ```

4. **GitHub personal access token** with `repo` scope — needed for Amplify to pull your repo.
   Go to: GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate new token.

5. **Install Terraform:** `brew install terraform`

---

## File Structure

```
backend/
  Dockerfile            # NEW — containerises the FastAPI app
  .dockerignore         # NEW — excludes dev artifacts from image

infra/
  terraform/
    main.tf             # Provider config + S3 backend
    variables.tf        # All input variables (region, secrets, repo name…)
    outputs.tf          # Service URLs, ECR URI, IAM role ARN
    vpc.tf              # VPC, subnets, IGW, route tables, security groups
    ecr.tf              # ECR repository + lifecycle policy
    rds.tf              # RDS PostgreSQL, DB subnet group
    app_runner.tf       # App Runner service, VPC connector, IAM role
    amplify.tf          # Amplify app, branch, IAM role
    iam.tf              # GitHub Actions OIDC provider + role + policies
    secrets.tf          # Secrets Manager secrets for API keys

amplify.yml             # NEW (repo root) — Amplify build spec for Next.js SSR

.github/workflows/
  ci.yml                # MODIFY — remove stale `frontend` job, add `deploy-aws` job
```

---

## Task 1: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src/ src/

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Write .dockerignore**

```
.venv/
__pycache__/
*.py[oc]
.git/
tests/
htmlcov/
.coverage
chroma/
uploads/
*.env
```

- [ ] **Step 3: Build the image locally to verify it compiles**

```bash
cd /path/to/repo
docker build -t case-tutor-backend:local ./backend
```

Expected: image builds successfully, final layer runs uvicorn.

- [ ] **Step 4: Smoke-test the container**

```bash
docker run --rm \
  -e DATABASE_URL=postgresql://case_tutor:case_tutor@host.docker.internal:5433/case_tutor \
  -e ANTHROPIC_API_KEY=test \
  -e OPENAI_API_KEY=test \
  -p 8000:8000 \
  case-tutor-backend:local
```

In another terminal:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat: add production Dockerfile for FastAPI backend"
```

---

## Task 2: Terraform provider + state backend

**Files:**
- Create: `infra/terraform/main.tf`
- Create: `infra/terraform/variables.tf`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p infra/terraform
```

- [ ] **Step 2: Write variables.tf**

Replace `<YOUR_ACCOUNT_ID>` with your actual AWS account ID in `backend.bucket` below (or make it a variable — but Terraform backend blocks don't support variable interpolation, so hard-code the bucket name).

```hcl
variable "aws_region" {
  default = "us-east-1"
}

variable "project" {
  default = "case-tutor"
}

variable "db_username" {
  default = "case_tutor"
}

variable "db_password" {
  description = "RDS master password"
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for the backend"
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for the backend"
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repo in owner/name format, e.g. nik1168/socratic-case-tutor"
}

variable "github_access_token" {
  description = "GitHub personal access token with repo scope (for Amplify)"
  sensitive   = true
}

variable "github_org" {
  description = "GitHub org or user that owns the repo, e.g. nik1168"
}

variable "cors_allowed_origins" {
  description = "Comma-separated CORS origins for the backend. After first apply, add the Amplify URL here and re-apply."
  default     = "http://localhost:3000"
}
```

- [ ] **Step 3: Write main.tf**

Replace `case-tutor-tfstate-<YOUR_ACCOUNT_ID>` with the bucket you created in the pre-requisites.

```hcl
terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  backend "s3" {
    bucket         = "case-tutor-tfstate-<YOUR_ACCOUNT_ID>"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "case-tutor-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = var.project
    }
  }
}
```

- [ ] **Step 4: Initialise Terraform**

```bash
cd infra/terraform
terraform init
```

Expected: "Terraform has been successfully initialized!"

- [ ] **Step 5: Commit**

```bash
git add infra/terraform/main.tf infra/terraform/variables.tf
git commit -m "feat: add Terraform provider config with S3 state backend"
```

---

## Task 3: VPC + networking

**Files:**
- Create: `infra/terraform/vpc.tf`

Architecture: one VPC, two public subnets across two AZs, one internet gateway. Both the App Runner VPC connector and RDS live in these subnets. Two security groups: one for the App Runner connector (egress-only), one for RDS (allows 5432 only from the App Runner SG).

- [ ] **Step 1: Write vpc.tf**

```hcl
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet("10.0.0.0/16", 8, count.index + 1)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app_runner" {
  name   = "${var.project}-app-runner"
  vpc_id = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name   = "${var.project}-rds"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_runner.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

- [ ] **Step 2: Plan to verify no errors**

```bash
cd infra/terraform
terraform plan -var="db_password=dummy" \
               -var="anthropic_api_key=dummy" \
               -var="openai_api_key=dummy" \
               -var="github_repo=nik1168/socratic-case-tutor" \
               -var="github_access_token=dummy" \
               -var="github_org=nik1168"
```

Expected: plan shows VPC, subnets, IGW, route tables, security groups — no errors.

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/vpc.tf
git commit -m "feat: add VPC with public subnets and security groups"
```

---

## Task 4: ECR repository

**Files:**
- Create: `infra/terraform/ecr.tf`

- [ ] **Step 1: Write ecr.tf**

```hcl
resource "aws_ecr_repository" "backend" {
  name                 = "${var.project}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
```

- [ ] **Step 2: Plan**

```bash
terraform plan -var="db_password=dummy" \
               -var="anthropic_api_key=dummy" \
               -var="openai_api_key=dummy" \
               -var="github_repo=nik1168/socratic-case-tutor" \
               -var="github_access_token=dummy" \
               -var="github_org=nik1168"
```

Expected: 2 new resources — `aws_ecr_repository.backend`, `aws_ecr_lifecycle_policy.backend`.

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/ecr.tf
git commit -m "feat: add ECR repository for backend Docker images"
```

---

## Task 5: Secrets Manager

**Files:**
- Create: `infra/terraform/secrets.tf`

- [ ] **Step 1: Write secrets.tf**

```hcl
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "${var.project}/anthropic-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = var.anthropic_api_key
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name                    = "${var.project}/openai-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = var.openai_api_key
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/secrets.tf
git commit -m "feat: add Secrets Manager resources for API keys"
```

---

## Task 6: RDS PostgreSQL

**Files:**
- Create: `infra/terraform/rds.tf`

- [ ] **Step 1: Write rds.tf**

```hcl
resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db-subnet-group"
  subnet_ids = aws_subnet.public[*].id
}

resource "aws_db_instance" "main" {
  identifier              = "${var.project}-postgres"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t3.micro"
  allocated_storage       = 20
  db_name                 = "case_tutor"
  username                = var.db_username
  password                = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  publicly_accessible     = false
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 1
  storage_encrypted       = true
}
```

- [ ] **Step 2: Plan**

```bash
terraform plan -var="db_password=MySecurePass123!" \
               -var="anthropic_api_key=dummy" \
               -var="openai_api_key=dummy" \
               -var="github_repo=nik1168/socratic-case-tutor" \
               -var="github_access_token=dummy" \
               -var="github_org=nik1168"
```

Expected: 2 new resources — `aws_db_subnet_group.main`, `aws_db_instance.main`.

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/rds.tf
git commit -m "feat: add RDS PostgreSQL instance in VPC"
```

---

## Task 7: App Runner service

**Files:**
- Create: `infra/terraform/app_runner.tf`

App Runner pulls the `latest` tag from ECR and auto-redeploys when the image changes. The VPC connector routes all egress through the public subnets so the service can reach both RDS (private) and external APIs (Anthropic, OpenAI) via the internet gateway.

- [ ] **Step 1: Write app_runner.tf**

```hcl
resource "aws_iam_role" "app_runner_ecr" {
  name = "${var.project}-app-runner-ecr"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "app_runner_ecr" {
  role       = aws_iam_role.app_runner_ecr.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_iam_role" "app_runner_instance" {
  name = "${var.project}-app-runner-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "app_runner_secrets" {
  name = "${var.project}-app-runner-secrets"
  role = aws_iam_role.app_runner_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.anthropic_api_key.arn,
        aws_secretsmanager_secret.openai_api_key.arn,
      ]
    }]
  })
}

resource "aws_apprunner_vpc_connector" "main" {
  vpc_connector_name = "${var.project}-connector"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.app_runner.id]
}

resource "aws_apprunner_service" "backend" {
  service_name = "${var.project}-backend"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.app_runner_ecr.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.backend.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "8000"

        runtime_environment_variables = {
          DATABASE_URL    = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/case_tutor"
          ALLOWED_ORIGINS = var.cors_allowed_origins
        }

        runtime_environment_secrets = {
          ANTHROPIC_API_KEY = aws_secretsmanager_secret_version.anthropic_api_key.arn
          OPENAI_API_KEY    = aws_secretsmanager_secret_version.openai_api_key.arn
        }
      }
    }

    auto_deployments_enabled = true
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  instance_configuration {
    cpu               = "1024"
    memory            = "2048"
    instance_role_arn = aws_iam_role.app_runner_instance.arn
  }

  health_check_configuration {
    path     = "/health"
    protocol = "HTTP"
  }

  depends_on = [aws_iam_role_policy_attachment.app_runner_ecr]
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/app_runner.tf
git commit -m "feat: add App Runner service with VPC connector and ECR auto-deploy"
```

---

## Task 8: Amplify frontend

**Files:**
- Create: `infra/terraform/amplify.tf`
- Create: `amplify.yml` (repo root)

- [ ] **Step 1: Write amplify.yml in the repo root**

This file tells Amplify how to build the Next.js app. The `baseDirectory` must point to `.next` for SSR mode.

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd nextjs
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: nextjs/.next
    files:
      - '**/*'
  cache:
    paths:
      - nextjs/node_modules/**/*
      - nextjs/.next/cache/**/*
```

- [ ] **Step 2: Write amplify.tf**

```hcl
resource "aws_iam_role" "amplify" {
  name = "${var.project}-amplify"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "amplify.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "amplify" {
  role       = aws_iam_role.amplify.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess-Amplify"
}

resource "aws_amplify_app" "frontend" {
  name         = "${var.project}-frontend"
  repository   = "https://github.com/${var.github_repo}"
  access_token = var.github_access_token
  platform     = "WEB_COMPUTE"
  iam_service_role_arn = aws_iam_role.amplify.arn

  build_spec = file("${path.module}/../../amplify.yml")

  environment_variables = {
    NEXT_PUBLIC_API_URL     = "https://${aws_apprunner_service.backend.service_url}"
    AMPLIFY_MONOREPO_APP_ROOT = "nextjs"
    _LIVE_UPDATES            = jsonencode([{ pkg = "next-server", type = "internal", version = "latest" }])
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"
  framework   = "Next.js - SSR"
  stage       = "PRODUCTION"
  enable_auto_build = true
}
```

- [ ] **Step 3: Commit**

```bash
git add amplify.yml infra/terraform/amplify.tf
git commit -m "feat: add Amplify SSR hosting for Next.js frontend"
```

---

## Task 9: GitHub Actions OIDC + IAM role

**Files:**
- Create: `infra/terraform/iam.tf`

This gives GitHub Actions permission to push images to ECR without long-lived AWS credentials.

- [ ] **Step 1: Write iam.tf**

```hcl
data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name = "${var.project}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "${var.project}-github-actions-ecr"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = aws_ecr_repository.backend.arn
      }
    ]
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/iam.tf
git commit -m "feat: add GitHub Actions OIDC role for ECR push"
```

---

## Task 10: Terraform outputs

**Files:**
- Create: `infra/terraform/outputs.tf`

- [ ] **Step 1: Write outputs.tf**

```hcl
output "app_runner_url" {
  value       = "https://${aws_apprunner_service.backend.service_url}"
  description = "Backend API URL"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.backend.repository_url
  description = "ECR repository URL — use this in the GitHub secret ECR_REGISTRY"
}

output "github_actions_role_arn" {
  value       = aws_iam_role.github_actions.arn
  description = "IAM role ARN — store this as AWS_ROLE_ARN in GitHub secrets"
}

output "amplify_app_url" {
  value       = "https://main.${aws_amplify_app.frontend.default_domain}"
  description = "Amplify frontend URL"
}

output "rds_endpoint" {
  value       = aws_db_instance.main.endpoint
  description = "RDS endpoint (internal)"
  sensitive   = true
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/terraform/outputs.tf
git commit -m "feat: add Terraform outputs for URLs and ARNs"
```

---

## Task 11: Apply Terraform and capture outputs

This task applies the full infrastructure. It takes ~15 minutes (RDS provisioning is slow).

- [ ] **Step 1: Create a tfvars file (gitignored)**

```bash
cat > infra/terraform/terraform.tfvars <<'EOF'
db_password         = "YourSecurePassword123!"
anthropic_api_key   = "sk-ant-..."
openai_api_key      = "sk-..."
github_repo         = "nik1168/socratic-case-tutor"
github_org          = "nik1168"
github_access_token = "ghp_..."
EOF
echo "infra/terraform/terraform.tfvars" >> .gitignore
```

- [ ] **Step 2: Full plan review**

```bash
cd infra/terraform
terraform plan -var-file=terraform.tfvars
```

Expected: ~20 resources to create, 0 to destroy.

- [ ] **Step 3: Apply**

```bash
terraform apply -var-file=terraform.tfvars
```

Type `yes` when prompted. Takes ~15 minutes.

- [ ] **Step 4: Capture outputs**

```bash
terraform output
```

Note down:
- `app_runner_url` → backend API URL
- `ecr_repository_url` → needed for GitHub secret
- `github_actions_role_arn` → needed for GitHub secret
- `amplify_app_url` → frontend URL

- [ ] **Step 5: Second apply — wire Amplify URL into CORS**

Add the Amplify URL to tfvars and re-apply so the backend accepts requests from it:

```bash
# Append to terraform.tfvars — replace <id> with your actual Amplify domain
echo 'cors_allowed_origins = "https://main.<id>.amplifyapp.com,http://localhost:3000"' \
  >> infra/terraform/terraform.tfvars

terraform apply -var-file=terraform.tfvars
```

Expected: only `aws_apprunner_service.backend` updates (env var change).

- [ ] **Step 5: Commit .gitignore update**

```bash
git add .gitignore
git commit -m "chore: gitignore terraform.tfvars"
```

---

## Task 12: GitHub repository secrets

These secrets are read by the GitHub Actions deploy job added in Task 13.

- [ ] **Step 1: Add secrets in GitHub**

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add the following (values from `terraform output` in Task 11):

| Secret name       | Value                                               |
|-------------------|-----------------------------------------------------|
| `AWS_ROLE_ARN`    | value of `github_actions_role_arn` output           |
| `ECR_REGISTRY`    | value of `ecr_repository_url` output (without `:latest`) |

`ECR_REGISTRY` is the base URL, e.g. `123456789.dkr.ecr.us-east-1.amazonaws.com/case-tutor-backend`.

---

## Task 13: Update CI/CD pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`

Remove the `frontend` job (references the deleted `frontend/` directory). Add a `deploy-aws` job that builds and pushes the Docker image to ECR on every push to `main`. App Runner auto-redeploys when it detects a new `latest` image.

- [ ] **Step 1: Replace the entire CI file**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: case_tutor
          POSTGRES_USER: case_tutor
          POSTGRES_PASSWORD: case_tutor
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U case_tutor"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://case_tutor:case_tutor@localhost:5432/case_tutor
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --frozen
      - run: uv run pytest tests/ -v

  nextjs:
    name: Next.js unit + E2E tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: nextjs
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: nextjs/package-lock.json
      - run: npm ci
      - run: npm run test:run
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  deploy-aws:
    name: Deploy backend to AWS (ECR + App Runner)
    needs: [backend, nextjs]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Log in to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        run: |
          IMAGE_URI=${{ secrets.ECR_REGISTRY }}:latest
          docker build -t "$IMAGE_URI" ./backend
          docker push "$IMAGE_URI"
```

- [ ] **Step 2: Verify locally**

```bash
# Lint the YAML (install yamllint if needed: brew install yamllint)
yamllint .github/workflows/ci.yml
```

Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: remove stale frontend job, add deploy-aws job via OIDC"
git push origin main
```

- [ ] **Step 4: Watch the Actions run**

Go to GitHub → Actions. Verify:
- `Backend tests` passes
- `Next.js unit + E2E tests` passes
- `Deploy backend to AWS` passes (image pushed to ECR, App Runner begins redeployment)

---

## Task 14: Smoke test the AWS deployment

- [ ] **Step 1: Test the App Runner backend**

```bash
# Replace with your actual App Runner URL from terraform output
curl https://<id>.us-east-1.awsapprunner.com/health
# Expected: {"status":"ok"}
```

- [ ] **Step 2: Test the Amplify frontend**

Open the Amplify URL (`https://main.<id>.amplifyapp.com`) in a browser.

Expected: the Next.js app loads, upload page works, chat works against the App Runner backend.

- [ ] **Step 3: Verify CORS**

If the frontend returns CORS errors, update the `ALLOWED_ORIGINS` env var in `app_runner.tf` to include the Amplify URL, then `terraform apply`.

---

## Notes

- **ChromaDB is ephemeral** on App Runner (same behaviour as Railway). Uploaded PDFs must be re-uploaded after a new deploy. This is acceptable for the demo; a persistent solution would use EFS or a managed vector DB.
- **RDS takes ~10 minutes** to provision on first `terraform apply`. Subsequent applies are fast.
- **Amplify builds automatically** on every push to `main` — no GitHub Actions step needed for the frontend.
- **Cost estimate (us-east-1, idle):** RDS db.t3.micro ~$14/month, App Runner ~$5/month (1 vCPU minimum), Amplify ~$0/month (free tier for builds). Total ~$19/month for the AWS deployment.
