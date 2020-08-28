module "data_migration1" {
  source = "../../lambdas/data-migration1"

  prefix = var.prefix

  permissions_boundary_arn = var.permissions_boundary_arn

  vpc_id            = var.vpc_id
  lambda_subnet_ids = var.subnet_ids

  dynamo_tables = var.dynamo_tables

  rds_security_group_id = var.rds_security_group
  rds_user_access_secret_arn = var.rds_user_access_secret_arn

  tags = var.tags
}
