import { Resource } from "./Resource";

export class TargetGroup extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    private readonly vpcId: string,
  ) {
    super(name, region);
  }

  url() {
    return `https://elasticloadbalancing.${this.region}.amazonaws.com/?Action=CreateTargetGroup&Name=${this.name}&TargetType=ip&Protocol=HTTP&Port=3000&VpcId=${this.vpcId}&Version=2015-12-01`;
  }
}
