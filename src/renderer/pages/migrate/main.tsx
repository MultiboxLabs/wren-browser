import { boot } from "@/boot";
import "./migrate.css";
import { standInForApp } from "@/ipc";
import { Migrate } from "./migrate";
import { standIn } from "./stand-in";

// Until Wren Components can reach this page (ipc/tab-page.ts), what the app
// would answer is made up here, so the page can be seen and worked on.
standInForApp(standIn);

boot(Migrate);
