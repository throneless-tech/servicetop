import { Resource } from "./Resource";

export class Subnet extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    private readonly vpcId: string,
  ) {
    super(name, region);
  }

  url() {
    return `https://ec2.${this.region}.amazonaws.com/?Action=DescribeSubnets&Filter.1.Name=vpc-id&Filter.1.Value.1=${this.vpcId}&Version=2016-11-15`;
  }
}
