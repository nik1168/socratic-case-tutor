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
