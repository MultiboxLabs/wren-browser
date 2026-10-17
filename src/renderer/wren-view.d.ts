// <wren-view>, the element Wren shows a tab or a side panel in, for JSX.
// The DOM's type for it is in .wren/runtime/page/wren.d.ts.

import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wren-view": DetailedHTMLProps<HTMLAttributes<HTMLWrenViewElement>, HTMLWrenViewElement>;
    }
  }
}
