import { Resource } from './Resource';

export class RestartService extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    private readonly cluster: string,
  ) {
    super(name, region);
  }
  url() {
    return `https://ecs.${this.region}.amazonaws.com/?Action=UpdateService&Version=2014-11-13`;
  }

  headers(): Headers {
    return new Headers({
      'X-Amz-Target': 'AmazonEC2ContainerServiceV20141113.UpdateService',
      'Content-Type': 'application/x-amz-json-1.1',
    });
  }

  toJSON() {
    return JSON.stringify({
      service: this.name,
      cluster: this.cluster,
      taskDefinition: this.name,
      forceNewDeployment: true,
    });
  }
}
