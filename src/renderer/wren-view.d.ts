// The elements Wren gives a page, for JSX: <wren-view>, which shows a tab or
// a side panel, and the <embed> that marks an anchor. The DOM's types for
// them are in .wren/runtime/page/wren.d.ts.

import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  // An anchor's mark is an <embed> with a name (components/ui/anchor.tsx).
  interface EmbedHTMLAttributes<T> {
    name?: string;
  }
  namespace JSX {
    interface IntrinsicElements {
      "wren-view": DetailedHTMLProps<HTMLAttributes<HTMLWrenViewElement>, HTMLWrenViewElement>;
    }
  }
}
