// The release channels. Each has its own manifest, but every channel bundles
// the same app, so a person can move between them.
import { parseArgs } from "util";

export const channels = ["stable", "beta", "dev"] as const;
export type Channel = (typeof channels)[number];

/** What `wren bundle` makes, and the executable inside it. */
export const app = "Wren.app";
export const executable = "Wren";

export function manifestOf(channel: Channel) {
  return channel === "stable" ? "wren-app.json" : `wren-app.${channel}.json`;
}

/** The channel `--channel` names; dev when it is left out. */
export function channelOf(args: string[]) {
  const { values } = parseArgs({ args, options: { channel: { type: "string", default: "dev" } }, strict: false });
  const channel = channels.find((known) => known === values.channel);
  if (!channel) throw new Error(`Unknown channel "${values.channel}": use ${channels.join(", ")}.`);
  return channel;
}
