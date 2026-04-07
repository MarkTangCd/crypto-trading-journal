1. 2026-04-07: The new filter selects need to use the shared `MarketCycle` and `TransactionType` unions, not plain `string`, or the tRPC query input types fail strict typechecking.
2. 2026-04-07: `transaction.create()` lifecycle tests now need explicit `marketCycle` and `transactionType` values in every create input, including invalid-input cases.
3. 2026-04-07: `server/sqlite.integration.test.ts` has a hardcoded CREATE TABLE string that must be manually kept in sync with schema changes.
