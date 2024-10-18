import { error, Router } from "itty-router";
// import { CF, ServiceRequest } from "./worker";

// async function processResponse(response: Response) {

// }

export const router = Router({ base: "api/v1/restart" });

router.post("/", async (
    request,
    env,
) => {
    console.log("**** request.query =>", request.query)
    /**
     * query body currently looks like this:
     * https://servicetop.resolute-work.workers.dev/api/v1/restart?workspaces=rosy-sleek-tongue&workspaces=saucy-gamy-spot
     */
})