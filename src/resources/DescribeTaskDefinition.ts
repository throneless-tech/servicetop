import { Resource } from './Resource';

export class DescribeTaskDefinition extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
  ) {
    super(name, region);
  }

  url() {
    return `https://ecs.${this.region}.amazonaws.com/?Action=DescribeTaskDefinition&Version=2014-11-13`;
  }

  headers(): Headers {
    return new Headers({
      'X-Amz-Target': 'AmazonEC2ContainerServiceV20141113.DescribeTaskDefinition',
      'Content-Type': 'application/x-amz-json-1.1',
    });
  }

  toJSON() {
    return JSON.stringify({
      taskDefinition: this.name,
    });
  }
}
