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
    NEXT_PUBLIC_API_URL       = "https://${aws_apprunner_service.backend.service_url}"
    AMPLIFY_MONOREPO_APP_ROOT = "nextjs"
    _LIVE_UPDATES             = jsonencode([{ pkg = "next-server", type = "internal", version = "latest" }])
  }
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.frontend.id
  branch_name       = "main"
  framework         = "Next.js - SSR"
  stage             = "PRODUCTION"
  enable_auto_build = true
}
