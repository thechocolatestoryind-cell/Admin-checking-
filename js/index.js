// Landing page: reveals nothing; just routes once Firebase has told us who is signed in.
import { watchAdmin } from "./auth.js";
import { registerServiceWorker } from "./common.js";
registerServiceWorker();
watchAdmin(res => location.replace(res.state === "allowed" ? "dashboard.html" : "login.html"));
