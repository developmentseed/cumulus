terraform {
  required_providers {
    aws = ">= 2.31.0"
  }
}

locals {
  lambda_security_group_ids = compact([
    length(var.lambda_subnet_ids) == 0 ? null : aws_security_group.no_ingress_all_egress[0].id,
    var.elasticsearch_security_group_id
  ])
}
