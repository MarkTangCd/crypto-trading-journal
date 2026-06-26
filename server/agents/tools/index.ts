// Boot-time barrel for internal tools. Importing this file once at startup
// ensures every tool calls `register()` exactly once via its side-effect
// load. Call sites depend on `./tools`, not the individual files, so adding
// or retiring a tool stays a one-line edit here.
import "./getKlines";
import "./getRecentTrades";
import "./webSearch";
import "./webFetch";
