// Boot-time barrel for built-in skills. Importing this file once at startup
// ensures every skill module's side-effect `register()` runs exactly once.
// Call sites depend on `./skills`, not the individual files, so adding or
// retiring a skill stays a one-line edit here.
import "./getKlines";
import "./getRecentTrades";
import "./webSearch";
import "./webFetch";
import "./analyzeMarketStructure";
import "./fetchFundingRates";
