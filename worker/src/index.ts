import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

export class MpcApi extends Container {
  defaultPort = 3001;
  sleepAfter = "10m";
  enableInternet = true;
}

export { ContainerProxy };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const container = getContainer(env.API, "default");
      return container.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
