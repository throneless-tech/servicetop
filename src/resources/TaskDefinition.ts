import { Resource } from './Resource';

export class TaskDefinition extends Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
    protected readonly version: string,
    private readonly fsid: string,
    private readonly execRoleArn: string,
    private readonly proxyUser: string,
    private readonly proxyPass: string,
    private readonly proxyExit: string,
  ) {
    super(name, region);
  }

  url() {
    return `https://ecs.${this.region}.amazonaws.com/?Action=RegisterTaskDefinition&Version=2014-11-13`;
  }

  headers(): Headers {
    return new Headers({
      'X-Amz-Target': 'AmazonEC2ContainerServiceV20141113.RegisterTaskDefinition',
      'Content-Type': 'application/x-amz-json-1.1',
    });
  }

  toJSON() {
    return JSON.stringify({
      family: this.name,
      executionRoleArn: this.execRoleArn,
      containerDefinitions: [
        {
          name: 'webtop',
          image: `linuxserver/webtop:${this.version}`,
          cpu: 0,
          portMappings: [
            {
              name: 'webtop-3000-tcp',
              containerPort: 3000,
              hostPort: 3000,
              protocol: 'tcp',
              appProtocol: 'http',
            },
          ],
          essential: true,
          environment: [
            {
              name: 'TITLE',
              value: 'Cuckoo',
            },
            {
              name: 'DOCKER_MODS',
              value: 'ghcr.io/throneless-tech/docker-mods:webtop-oxylabs|ghcr.io/throneless-tech/docker-mods:webtop-proot',
            },
            {
              name: 'PUID',
              value: '1000',
            },
            {
              name: 'TZ',
              value: 'America/New_York',
            },
            {
              name: 'PGID',
              value: '1000',
            },
            {
              name: 'OXYLABS_USER',
              value: this.proxyUser,
            },
            {
              name: 'OXYLABS_PASS',
              value: this.proxyPass,
            },
            {
              name: 'OXYLABS_EXIT',
              value: this.proxyExit,
            },
            {
              name: 'INSTALL_APPS',
              value: 'telegram|chromium',
            },
          ],
          mountPoints: [
            {
              sourceVolume: 'fm_home',
              containerPath: '/config',
              readOnly: false,
            },
          ],
          ulimits: [
            {
              name: 'nofile',
              softLimit: 65536,
              hardLimit: 65536,
            },
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-create-group': 'true',
              'awslogs-group': '/ecs/webtop',
              'awslogs-region': this.region,
              'awslogs-stream-prefix': 'ecs',
            },
          },
          healthCheck: {
            command: ['CMD-SHELL', 'curl http://localhost:3000 || exit 1'],
            interval: 30,
            timeout: 5,
            retries: 3,
          },
        },
      ],
      networkMode: 'awsvpc',
      volumes: [
        {
          name: 'fm_home',
          efsVolumeConfiguration: {
            fileSystemId: this.fsid,
            rootDirectory: '/',
            transitEncryption: 'ENABLED',
            // "authorizationConfig": {
            //   "accessPointId": this.apid,
            //   "iam": "DISABLED",
            // },
          },
        },
      ],
      compatibilities: ['EC2', 'FARGATE'],
      requiresCompatibilities: ['FARGATE'],
      cpu: '1024',
      memory: '8192',
      runtimePlatform: {
        cpuArchitecture: 'X86_64',
        operatingSystemFamily: 'LINUX',
      },
      tags: [
        {
          key: 'deployed-by',
          value: 'servicetop',
        },
      ],
    });
  }
}
