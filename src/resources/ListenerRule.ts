import { Resource } from "./Resource";

export class ListenerRule extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    private readonly listenerArn: string,
    private readonly targetGroupArn: string,
    private readonly awsToken: string,
  ) {
    super(name, region);
  }

  url(priority: number) {
    return `https://elasticloadbalancing.${this.region}.amazonaws.com/?Action=CreateRule&ListenerArn=${this.listenerArn}&Priority=${priority}&Conditions.member.1.Field=host-header&Conditions.member.1.Values.member.1=${this.name}&Conditions.member.2.Field=http-header&Conditions.member.2.HttpHeaderConfig.HttpHeaderName=x-st-auth&Conditions.member.2.HttpHeaderConfig.Values.member.1=${this.awsToken}&Actions.member.1.Type=forward&Actions.member.1.TargetGroupArn=${this.targetGroupArn}&Version=2015-12-01`;
  }

  toJSON(priority: number) {
    return JSON.stringify({
      ListenerArn: this.listenerArn,
      Priority: priority,
      Conditions: [
        {
          Field: "host-header",
          HostHeaderConfig: {
            Values: [
              this.name,
            ],
          },
        },
        {
          Field: "http-header",
          HttpHeaderConfig: {
            HttpHeaderName: "x-st-auth",
            Values: [
              this.awsToken,
            ],
          },
        },
      ],
      Actions: [
        {
          Type: "forward",
          TargetGroupArn: this.targetGroupArn,
        },
      ],
      Tags: [
        {
          Key: "deployed-by",
          Value: "servicetop",
        },
      ],
    });
  }
}
