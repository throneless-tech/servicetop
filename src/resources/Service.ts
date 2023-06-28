import { Resource } from "./Resource";

export class Service extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    private readonly cluster: string,
    private readonly taskDefinition: string,
    private readonly targetGroupArn: string,
    private readonly subnetIds: string[],
    private readonly securityGroup: string,
  ) {
    super(name, region);
  }
  url() {
    return `https://ecs.${this.region}.amazonaws.com/?Action=CreateService&Version=2014-11-13`;
  }

  headers(): Headers {
    return new Headers({
      "X-Amz-Target": "AmazonEC2ContainerServiceV20141113.CreateService",
      "Content-Type": "application/x-amz-json-1.1",
    });
  }

  toJSON() {
    return JSON.stringify({
      serviceName: this.name,
      taskDefinition: this.taskDefinition,
      cluster: this.cluster,
      desiredCount: 1,
      healthCheckGracePeriodSeconds: 300,
      launchType: "FARGATE",
      loadBalancers: [{
        containerName: "webtop",
        containerPort: 3000,
        targetGroupArn: this.targetGroupArn,
      }],
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: this.subnetIds,
          securityGroups: [this.securityGroup],
        },
      },
    });
  }
}
