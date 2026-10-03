// The YAML language server, run as a web worker. ui's build bundles it into one
// file, with Node's path and url swapped for their browser ports and the one
// process.env value the server reads filled in (vite.config.ts).
import 'yaml-language-server/lib/esm/webworker/yamlServerMain'
