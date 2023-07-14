import { AwsClient } from "aws4fetch";
import { AddDNSRecord, DNSRecord } from "@e9x/cloudflare/v4";
import Cloudflare from "@e9x/cloudflare";
import generate from "hostname-generator";
import { error, Router } from "itty-router";
import { parseStringPromise as parseXml } from "xml2js";
import {
  FileSystem,
  ListenerRule,
  MountTarget,
  Resource,
  Service,
  Subnet,
  TargetGroup,
  TaskDefinition,
} from "./resources";
import { CF, ServiceRequest } from "./worker";

const NAME = generate({ words: 3 }).dashed;

async function doFetch(
  client: AwsClient,
  resource: Resource,
  url: string = resource.url(),
  method: string = "POST",
) {
  let body;
  if (method != "POST") {
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
  const contentType: string | null = response.headers.get("Content-Type");
  console.log("Processing Response with Content-Type:", contentType);
  if (contentType?.includes("text/xml")) {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `HTTP Error ${response.status} ${response.statusText}: ${body}`,
      );
    }
    return parseXml(body);
  }
  if (!response.ok) {
    throw new Error(
      `HTTP Error ${response.status} ${response.statusText}: ${response.json()}`,
    );
  }
  return response.json();
}

export const router = Router({ base: "/api/v1/instances" });

router.post<ServiceRequest, CF>("/", async (
  request,
  env,
) => {
  const responses: any[] = [];
  console.log(`Starting deployment of instance '${NAME}''`);

  if (
    !`us_alabama
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
      .split("\n")
      .includes(request.query.exit)
  ) {
    return error(400, `Invalid proxy exit: ${request.query.exit}`);
  }

  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_ID,
    secretAccessKey: env.AWS_ACCESS_SECRET,
  });

  let fileSystem;
  try {
    console.log("Deploying FileSystem");
    fileSystem = await doFetch(
      aws,
      new FileSystem(NAME, env.AWS_REGION),
    )
      .then(
        processResponse,
      );
    responses.push(fileSystem);
  } catch (err) {
    return error(502, err as Error);
  }

  let targetGroup;
  try {
    console.log("Deploying TargetGroup");
    targetGroup = await doFetch(
      aws,
      new TargetGroup(NAME, env.AWS_REGION, env.AWS_ELB_VPC_ID),
    ).then(processResponse);
    responses.push(targetGroup);
  } catch (err) {
    return error(502, err as Error);
  }

  const targetGroupArn: string =
    targetGroup.CreateTargetGroupResponse.CreateTargetGroupResult[0]
      .TargetGroups[0].member[0].TargetGroupArn[0];

  const listenerRule = new ListenerRule(
    `${NAME}.${env.PARENT_DOMAIN}`,
    env.AWS_REGION,
    env.AWS_ELB_LISTENER_ARN,
    targetGroupArn,
    env.AWS_ELB_TOKEN,
  );

  let lastPriority = await env.state.get("priority");
  let priority: number;
  if (lastPriority == null) {
    priority = 1;
  } else {
    priority = parseInt(lastPriority);
  }

  try {
    while (true) {
      console.log(
        `Deploying ListenerRule for TargetGroup ${targetGroupArn} with priority ${priority}`,
      );
      const listenerResponse = await doFetch(
        aws,
        listenerRule,
        listenerRule.url(priority),
      );
      let code: string = "";
      if (listenerResponse.status == 400) {
        const result: any = await parseXml(await listenerResponse.text());
        code = result.ErrorResponse.Error[0].Code[0];
        if (code == "PriorityInUse") {
          console.log(`Priority ${priority} in use`);
          priority += 1;
          continue;
        }
      }
      responses.push(await processResponse(listenerResponse));
      break;
    }
    await env.state.put("priority", priority + 1);
  } catch (err) {
    return error(502, err as Error);
  }

  try {
    console.log("Deploying TaskDefinition");
    const taskDefinition = await doFetch(
      aws,
      new TaskDefinition(
        NAME,
        env.AWS_REGION,
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
    console.log("Retrieving subnet IDs");
    const subnet = new Subnet(
      NAME,
      env.AWS_REGION,
      env.AWS_ELB_VPC_ID,
    );
    const subnets = await doFetch(
      aws,
      subnet,
      subnet.url(),
      "GET",
    ).then(processResponse);

    subnetIds = subnets.DescribeSubnetsResponse.subnetSet[0].item.map(
      (i: any): string => i.subnetId[0],
    );

    responses.push(subnets);
    console.log("Retrieved subnet IDs:", subnetIds);
  } catch (err) {
    return error(502, err as Error);
  }

  try {
    const mountTarget = new MountTarget(
      NAME,
      env.AWS_REGION,
      fileSystem.FileSystemId,
      subnetIds[Math.floor(Math.random() * subnetIds.length)],
    );
    console.log("Deploying MountTarget");
    let mountTargetResponse;
    while (true) {
      mountTargetResponse = await doFetch(
        aws,
        mountTarget,
      );
      let code: string = "";
      if (mountTargetResponse.status == 409) {
        const result: any = await mountTargetResponse.json();
        code = result.ErrorCode;
        if (code == "IncorrectFileSystemLifeCycleState") {
          console.log(`Filesystem ${fileSystem.FileSystemId} not ready`);
          continue;
        }
      }
      break;
    }

    responses.push(processResponse(mountTargetResponse));
  } catch (err) {
    return error(502, err as Error);
  }

  try {
    console.log("Deploying Service");
    const service = await doFetch(
      aws,
      new Service(
        NAME,
        env.AWS_REGION,
        env.AWS_ECS_CLUSTER_NAME,
        NAME,
        targetGroupArn,
        subnetIds,
        env.AWS_ELB_SECURITY_GROUP_ID,
      ),
    ).then(processResponse);
    responses.push(service);
  } catch (err) {
    return error(502, err as Error);
  }

  try {
    console.log("Deploying Cloudflare record");
    const cf = new Cloudflare({ key: env.CF_KEY, email: env.CF_EMAIL });
    const record = await cf.post<DNSRecord, AddDNSRecord>(
      `v4/zones/${env.CF_ZONE_ID}/dns_records`,
      {
        type: "CNAME",
        name: `${NAME}.cuckoo`,
        content: `${env.CF_TARGET}`,
        proxied: true,
        ttl: 1,
      },
    );
    responses.push(record);
  } catch (err) {
    return error(502, err as Error);
  }

  return { name: NAME, responses: responses };
})
  .all("*", () => error(404));
