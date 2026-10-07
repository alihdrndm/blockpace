// The private network everything runs in. The NAT lets the worker reach webhook endpoints
// on the internet from private subnets; "ec2" is SST's smallest NAT option.
export const vpc = new sst.aws.Vpc("Vpc", { nat: "ec2" });
