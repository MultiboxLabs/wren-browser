// The calls a page of Wren's own in a tab (wren://migrate) makes, and the
// messages the app sends it. A tab has no `wren`, as the app's web views
// have: Wren Components relays the page to the app instead
// (extensions/wren-components/bridge/, src/main/extensions/bridge.rs), and
// `tabPage` reads as `wren.invoke` and `wren.on` do.
//
// The page posts { wren: "connect" } to itself, and Wren Components' script
// in it answers with a port, once, on the first call. Calls made before then
// wait for it.

/** What answers a tab page's calls: the app, through Wren Components, or a stand-in. */
export type TabPageLink = {
  invoke<Answer>(call: string, args?: unknown): Promise<Answer>;
  on<Value>(event: string, listener: (value: Value) => void): () => void;
};

/**
 * How long the page waits for Wren Components to answer its first call.
 * Its script is in the page from before the page's own, and answers at once,
 * so a little longer than a frame or two means it is not there.
 */
const CONNECT_TIMEOUT = 150;

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

type Message = { id: number; value?: unknown; error?: string } | { event: string; value: unknown };

function relayed(): TabPageLink & { connect: () => Promise<MessagePort> } {
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  let nextId = 1;
  let port: Promise<MessagePort> | undefined;

  const receive = (message: Message) => {
    if ("event" in message) {
      listeners.get(message.event)?.forEach((listener) => listener(message.value));
      return;
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error !== undefined) call.reject(new Error(message.error));
    else call.resolve(message.value ?? null);
  };

  const connect = () =>
    (port ??= new Promise<MessagePort>((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", answered);
        reject(new Error("Wren Components did not answer."));
      }, CONNECT_TIMEOUT);
      function answered(event: MessageEvent) {
        if (event.source !== window || event.origin !== location.origin) return;
        if (event.data?.wren !== "port" || !event.ports[0]) return;
        clearTimeout(timer);
        window.removeEventListener("message", answered);
        const [given] = event.ports;
        given.onmessage = ({ data }) => receive(data as Message);
        resolve(given);
      }
      window.addEventListener("message", answered);
      window.postMessage({ wren: "connect" }, location.origin);
    }));

  return {
    connect,
    async invoke<Answer>(call: string, args?: unknown) {
      const given = await connect();
      const id = nextId++;
      return new Promise<Answer>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        given.postMessage({ id, call, args: args ?? null });
      });
    },
    on<Value>(event: string, listener: (value: Value) => void) {
      void connect().catch(() => {});
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      const each = listener as (value: unknown) => void;
      set.add(each);
      return () => set.delete(each);
    }
  };
}

const app = relayed();
let standIn: TabPageLink | undefined;

// Whether the app answers: Wren Components gave the page a port.
const reachesApp = () =>
  app.connect().then(
    () => true,
    () => false
  );

/** The page's link to the app. */
export const tabPage: TabPageLink = {
  async invoke<Answer>(call: string, args?: unknown) {
    if (!standIn || (await reachesApp())) return app.invoke<Answer>(call, args);
    return standIn.invoke<Answer>(call, args);
  },
  on<Value>(event: string, listener: (value: Value) => void) {
    const offs = [app.on(event, listener), standIn?.on(event, listener)];
    return () => offs.forEach((off) => off?.());
  }
};

/**
 * Answers the page's calls with `link` where Wren Components does not answer
 * them. For now it never does: Wren Runtime refuses to let an extension
 * script the app's own scheme ("Invalid url pattern: wren://migrate/*"), so
 * no port comes. Remove the stand-in once it does.
 */
export function standInForApp(link: TabPageLink) {
  standIn = link;
}
