import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("paperclip-korean-ui overlay worker ready");
  },
  async onHealth() {
    return { status: "ok", message: "korean overlay" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
