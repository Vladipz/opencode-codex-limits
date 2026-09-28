import { Plugin } from "@opencode/plugin";

// The feature is terminal-only; this entrypoint lets V2 load the package on the server.
// V1 (1.18.29+) uses the separate, legacy TUI entrypoint below.
export default {
  ...Plugin.define({
    id: "local.codex-limits",
    setup() {},
  }),
  async server() {
    return {};
  },
};
