interface Env {
  ASSETS: Fetcher;
  API: DurableObjectNamespace<import("./src/index").MpcApi>;
}
