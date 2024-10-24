import { AwsClient } from 'aws4fetch';
import { AddDNSRecord, DNSRecord } from '@e9x/cloudflare/v4';
import Cloudflare from '@e9x/cloudflare';
import generate from 'hostname-generator';
import { error, Router } from 'itty-router';
import { parseStringPromise as parseXml } from 'xml2js';
import {
  DescribeTaskDefinition,
  FileSystem,
  ListenerRule,
  MountTarget,
  Resource,
  RestartService,
  Service,
  Subnet,
  TargetGroup,
  TaskDefinition,
} from './resources';
import { CF, ServiceRequest } from './worker';

const NAME = generate({ words: 3 }).dashed;
const VERSION = 'amd64-ubuntu-xfce-version-c419e168';

async function doFetch(client: AwsClient, resource: Resource, url: string = resource.url(), method: string = 'POST') {
  let body;
  if (method != 'POST') {
    body = undefined;
  } else {
    body = resource.toJSON();
  }
  return client.fetch(url, {
    method: method,
    body: body,
    headers: resource.headers(),
  });
}

async function processResponse(response: Response) {
  const contentType: string | null = response.headers.get('Content-Type');
  console.log('Processing Response with Content-Type:', contentType);
  if (contentType?.includes('text/xml')) {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status} ${response.statusText}: ${body}`);
    }
    return parseXml(body);
  }
  if (contentType?.includes('text/plain')) {
    const body = await response.text();
    console.log(`***HTTP Error ${response.status} ${response.statusText}: ${body}`);
    throw new Error(`HTTP Error ${response.status} ${response.statusText}: ${body}`);
  }
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status} ${response.statusText}: ${body}`);
  }
  return body;
}

async function checkExit(exit: string) {
  return (
    !!exit &&
    (`us_alabama
us_alaska
us_arizona
us_arkansas
us_california
us_colorado
us_connecticut
us_delaware
us_florida
us_georgia
us_hawaii
us_idaho
us_illinois
us_indiana
us_iowa
us_kansas
us_kentucky
us_louisiana
us_maine
us_maryland
us_massachusetts
us_michigan
us_minnesota
us_mississippi
us_missouri
us_montana
us_nebraska
us_nevada
us_new_hampshire
us_new_jersey
us_new_mexico
us_new_york
us_north_carolina
us_north_dakota
us_ohio
us_oklahoma
us_oregon
us_pennsylvania
us_rhode_island
us_south_carolina
us_south_dakota
us_tennessee
us_texas
us_utah
us_vermont
us_virginia
us_washington
us_west_virginia
us_wisconsin
us_wyoming`
      .split('\n')
      .includes(exit) ||
      exit.startsWith('cc-'))
  );
}

export const router = Router({ base: '/api/v1' });

router
  .post<ServiceRequest, CF>('/instances', async (request, env) => {
    const responses: any[] = [];
    const name = request.query.name || NAME;
    const version = request.query.version || VERSION;
    console.log(`Starting deployment of instance '${name}''`);

    if (!checkExit(request.query.exit)) {
      return error(400, `Invalid proxy exit: ${request.query.exit}`);
    }

    const aws = new AwsClient({
      accessKeyId: env.AWS_ACCESS_ID,
      secretAccessKey: env.AWS_ACCESS_SECRET,
    });

    let fileSystem;
    try {
      console.log('Deploying FileSystem');
      fileSystem = await doFetch(aws, new FileSystem(name, env.AWS_REGION)).then(processResponse);
      responses.push(fileSystem);
    } catch (err) {
      console.log('ERROR:', err);
      return error(502, err as Error);
    }

    let targetGroup;
    try {
      console.log('Deploying TargetGroup');
      targetGroup = await doFetch(aws, new TargetGroup(name, env.AWS_REGION, env.AWS_ELB_VPC_ID)).then(processResponse);
      responses.push(targetGroup);
    } catch (err) {
      console.log('ERROR:', err);
      return error(502, err as Error);
    }

    const targetGroupArn: string =
      targetGroup.CreateTargetGroupResponse.CreateTargetGroupResult[0].TargetGroups[0].member[0].TargetGroupArn[0];

    const listenerRule = new ListenerRule(
      `${name}.${env.PARENT_DOMAIN}`,
      env.AWS_REGION,
      env.AWS_ELB_LISTENER_ARN,
      targetGroupArn,
      env.AWS_ELB_TOKEN,
    );

    let lastPriority = await env.state.get('priority');
    let priority: number;
    if (lastPriority == null) {
      priority = 1;
    } else {
      priority = parseInt(lastPriority);
    }

    try {
      while (true) {
        console.log(`Deploying ListenerRule for TargetGroup ${targetGroupArn} with priority ${priority}`);
        const listenerResponse = await doFetch(aws, listenerRule, listenerRule.url(priority));
        let code: string = '';
        if (listenerResponse.status == 400) {
          const result: any = await parseXml(await listenerResponse.text());
          code = result.ErrorResponse.Error[0].Code[0];
          if (code == 'PriorityInUse') {
            console.log(`Priority ${priority} in use`);
            priority += 1;
            continue;
          }
        }
        responses.push(await processResponse(listenerResponse));
        // Temporary hack for migration
        if (env.PARENT_DOMAIN2) {
          const listenerRule2 = new ListenerRule(
            `${name}.${env.PARENT_DOMAIN2}`,
            env.AWS_REGION,
            env.AWS_ELB_LISTENER_ARN,
            targetGroupArn,
            env.AWS_ELB_TOKEN,
          );
          priority += 1;
          const listenerResponse2 = await doFetch(aws, listenerRule2, listenerRule2.url(priority));
          responses.push(await processResponse(listenerResponse2));
        }
        break;
      }
      await env.state.put('priority', priority + 1);
    } catch (err) {
      return error(502, err as Error);
    }

    try {
      console.log('Deploying TaskDefinition');
      const taskDefinition = await doFetch(
        aws,
        new TaskDefinition(
          name,
          env.AWS_REGION,
          version,
          fileSystem.FileSystemId,
          env.AWS_ECS_EXECUTION_ROLE_ARN,
          env.OXYLABS_USER,
          env.OXYLABS_PASS,
          request.query.exit,
        ),
      ).then(processResponse);
      responses.push(taskDefinition);
    } catch (err) {
      return error(502, err as Error);
    }

    let subnetIds: string[];
    try {
      console.log('Retrieving subnet IDs');
      const subnet = new Subnet(name, env.AWS_REGION, env.AWS_ELB_VPC_ID);
      const subnets = await doFetch(aws, subnet, subnet.url(), 'GET').then(processResponse);

      subnetIds = subnets.DescribeSubnetsResponse.subnetSet[0].item.map((i: any): string => i.subnetId[0]);

      responses.push(subnets);
      console.log('Retrieved subnet IDs:', subnetIds);
    } catch (err) {
      return error(502, err as Error);
    }

    try {
      const mountTarget = new MountTarget(name, env.AWS_REGION, fileSystem.FileSystemId, subnetIds[0], env.AWS_ELB_SECURITY_GROUP_ID);
      const mountTarget2 = new MountTarget(name, env.AWS_REGION, fileSystem.FileSystemId, subnetIds[1], env.AWS_ELB_SECURITY_GROUP_ID);
      console.log('Deploying MountTarget');
      let mountTargetResponse, mountTargetResponse2;
      while (true) {
        mountTargetResponse = await doFetch(aws, mountTarget);
        let code: string = '';
        const status: any = mountTargetResponse.status;
        const result: any = await mountTargetResponse.json();
        console.log('MountTarget result:', result);
        if (status == 409) {
          //const result: any = await mountTargetResponse.json();
          code = result.ErrorCode;
          if (code == 'IncorrectFileSystemLifeCycleState') {
            console.log(`Filesystem ${fileSystem.FileSystemId} not ready`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
        }
        mountTargetResponse2 = await doFetch(aws, mountTarget2);
        break;
      }

      responses.push(processResponse(mountTargetResponse));
      responses.push(processResponse(mountTargetResponse2));
    } catch (err) {
      return error(502, err as Error);
    }

    try {
      console.log('Deploying Service');
      const service = await doFetch(
        aws,
        new Service(name, env.AWS_REGION, env.AWS_ECS_CLUSTER_NAME, name, targetGroupArn, subnetIds, env.AWS_ELB_SECURITY_GROUP_ID),
      ).then(processResponse);
      responses.push(service);
    } catch (err) {
      return error(502, err as Error);
    }

    try {
      console.log(`Deploying Cloudflare record ${name}.cuckoo to zone ${env.CF_ZONE_ID} w/ target ${env.CF_TARGET}`);
      const cf = new Cloudflare({ key: env.CF_KEY, email: env.CF_EMAIL });
      const record = await cf.post<DNSRecord, AddDNSRecord>(`v4/zones/${env.CF_ZONE_ID}/dns_records`, {
        type: 'CNAME',
        name: `${name}.cuckoo`,
        content: `${env.CF_TARGET}`,
        proxied: true,
        ttl: 1,
      });

      responses.push(record);
    } catch (err) {
      console.log('Error:', err);
      return error(502, err as Error);
    }

    return { name: name, responses: responses };
  })
  .post<ServiceRequest, CF>('/restart', async (request, env) => {
    const responses: any[] = [];
    const { workspaces } = await request.json();
    if (!workspaces.length) return error(400);

    const aws = new AwsClient({
      accessKeyId: env.AWS_ACCESS_ID,
      secretAccessKey: env.AWS_ACCESS_SECRET,
    });

    try {
      for (let name of workspaces) {
        console.log(`(Re)deploying Service ${name}`);
        const service = await doFetch(aws, new RestartService(name, env.AWS_REGION, env.AWS_ECS_CLUSTER_NAME)).then(processResponse);
        responses.push(name);
      }
    } catch (err) {
      return error(502, err as Error);
    }

    return { responses: responses };
  })
  .post<ServiceRequest, CF>('/update', async (request, env) => {
    const responses: any[] = [];
    const { workspaces, version } = await request.json();
    if (!workspaces.length || !version) return error(400);

    const aws = new AwsClient({
      accessKeyId: env.AWS_ACCESS_ID,
      secretAccessKey: env.AWS_ACCESS_SECRET,
    });

    for (let name of workspaces) {
      console.log(`Updating instance '${name}' to version ${version}`);
      let taskDefinition;
      try {
        console.log('Fetching most recent TaskDefinition');
        taskDefinition = await doFetch(aws, new DescribeTaskDefinition(name, env.AWS_REGION)).then(processResponse);

        const fileSystemId = taskDefinition.taskDefinition.volumes[0].efsVolumeConfiguration.fileSystemId;
        console.log('FileSystemId:', fileSystemId);
        const [{ value: exit }] = taskDefinition.taskDefinition.containerDefinitions[0].environment.filter(
          ({ name, value }) => name === 'OXYLABS_EXIT',
        );
        console.log('OXYLABS_EXIT:', exit);

        console.log('Deploying new TaskDefinition');
        const newTaskDefinition = await doFetch(
          aws,
          new TaskDefinition(
            name,
            env.AWS_REGION,
            version,
            fileSystemId,
            env.AWS_ECS_EXECUTION_ROLE_ARN,
            env.OXYLABS_USER,
            env.OXYLABS_PASS,
            exit,
          ),
        ).then(processResponse);

        console.log('(Re)deploying Service');
        const service = await doFetch(aws, new RestartService(name, env.AWS_REGION, env.AWS_ECS_CLUSTER_NAME)).then(processResponse);
        responses.push(name);
      } catch (err) {
        console.log('Error:', err);
        return error(502, err as Error);
      }
    }
    return { responses: responses };
  })
  .all('*', () => error(404));
