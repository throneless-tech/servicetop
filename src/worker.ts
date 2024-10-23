/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { error, html, IRequest, json, Router, withParams } from 'itty-router';
import { router as instancesRouter } from './instances';

type Env = {
  AWS_ACCESS_ID: string;
  AWS_ACCESS_SECRET: string;
  AWS_ECS_CLUSTER_NAME: string;
  AWS_ECS_EXECUTION_ROLE_ARN: string;
  AWS_ELB_LISTENER_ARN: string;
  AWS_ELB_SECURITY_GROUP_ID: string;
  AWS_ELB_TOKEN: string;
  AWS_ELB_VPC_ID: string;
  AWS_REGION: string;
  CF_TARGET: string;
  CF_KEY: string;
  CF_EMAIL: string;
  CF_ZONE_ID: string;
  OXYLABS_USER: string;
  OXYLABS_PASS: string;
  PARENT_DOMAIN: string;
  WORKER_AUTH_KEY: string;
  WORKER_AUTH_VALUE: string;
  state: any;
};

export type ServiceRequest = {
  query: {
    exit: string;
  };
} & IRequest;

export type CF = [env: Env, context: ExecutionContext];

const withValidAuth = (request: ServiceRequest, env: Env) => {
  const psk = request.headers.get(env.WORKER_AUTH_KEY);

  if (psk !== env.WORKER_AUTH_VALUE) {
    // Incorrect key supplied. Reject the request.
    return error(401, 'Sorry, you have supplied an invalid key.');
  }
};

const router = Router(); // Export a default object containing event handlers

router
  .all<ServiceRequest, CF>('*', withValidAuth)
  .all('*', withParams)
  .all('/api/v1/*', instancesRouter.handle)
  .get('/', () => {
    return html(`<a href="https://github.com/linuxserver/docker-webtop">Webtop</a> as a service.`);
  })
  .all('*', () => error(404));

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => router.handle(request, env, ctx).then(json).catch(error),
};
