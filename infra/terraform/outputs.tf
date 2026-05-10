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
