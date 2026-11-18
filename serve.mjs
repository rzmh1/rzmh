// Compatibility entry point. v2 requires the actual API server.
import {createApp} from '../server/index.mjs';
import {config} from '../server/config.mjs';
const cfg=config();const {server}=createApp(cfg);
server.listen(cfg.port,cfg.host,()=>console.log(`رُزمة: ${cfg.origin}`));
