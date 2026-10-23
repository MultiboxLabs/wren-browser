// Joins class names, and where two Tailwind classes conflict keeps the later.
// Its tables are compiled at build time (`cn` in vite.config.ts), with the
// theme's names from cn.config.ts, so a page does not compile them as it
// starts.

import { createCn } from "cn/engine";
import tables from "./cn-tables";

export const cn = createCn(tables);
