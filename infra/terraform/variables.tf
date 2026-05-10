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
