import { Resource } from "./Resource";

export class MountTarget extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    private readonly fsid: string,
    private readonly subnetId: string,
    private readonly securityGroup: string,
  ) {
    super(name, region);
  }

  url() {
    return `https://elasticfilesystem.${this.region}.amazonaws.com/2015-02-01/mount-targets`;
  }

  toJSON() {
    return JSON.stringify({
      SubnetId: this.subnetId,
      FileSystemId: this.fsid,
      SecurityGroups: [this.securityGroup]
    });
  }
}
