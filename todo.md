# Crypto Trading Journal - Project TODO

## Database & Schema

- [x] Create transactions table with all 12 fields
- [x] Add user relationship for data isolation

## Backend API (tRPC)

- [x] Create transaction procedure
- [x] List transactions procedure with filtering/sorting
- [x] Get single transaction procedure
- [x] Update transaction procedure (for reviews)
- [x] Delete transaction procedure
- [x] Statistics calculation procedure
- [x] Auto-calculate consecutive losses
- [x] Auto-calculate account balance

## Transaction Recording

- [x] Form with all 12 required fields
- [x] Account balance auto-calculation
- [x] Consecutive losses auto-calculation
- [x] Trading pair input (e.g., BTCUSDT)
- [x] Time frame selection
- [x] Start/End time pickers (YYYY-MM-DD HH:MM)
- [x] Long/Short direction toggle
- [x] Trading logic text area
- [x] Win/Loss/BE status selector
- [x] Risk-reward ratio input
- [x] Return amount input (positive/negative)
- [x] Optional TradingView URL field

## Transaction Review System

- [x] Select existing trade to review
- [x] Add feedback text field
- [x] Attach TradingView chart link post-review

## Transaction List View

- [x] Display all transactions
- [x] Sorting capabilities
- [x] Filtering capabilities
- [x] Easy navigation to review

## Statistics Dashboard

- [x] Number of winning trades
- [x] Number of losing trades
- [x] Number of breakeven trades
- [x] Win rate percentage
- [x] Total number of trades
- [x] Average profit
- [x] Average loss
- [x] Total profit
- [x] Total reward
- [x] Losing streak (max consecutive losses)
- [x] Original balance
- [x] Latest balance

## Authentication & Security

- [x] Protected routes for authenticated users
- [x] User data isolation (each trader sees only their data)

## UI/UX Design

- [x] Scandinavian minimalist aesthetic
- [x] Pale cool gray background
- [x] Generous negative space
- [x] Bold black sans-serif primary text
- [x] Delicate thin subtitles
- [x] Abstract geometric shapes (pastel blue, blush pink)
- [x] Clean, uncluttered composition
- [x] Dashboard layout with sidebar navigation

## Trading Elements (Tags)

- [x] Create trading elements table in database
- [x] CRUD API for trading elements
- [x] Trading elements management UI (create, edit, delete)
- [x] Elements: Gap, Double Top/Bottom, CVD divergence, etc.

## Trading Systems

- [x] Create trading systems table in database
- [x] Create junction table for system-element relationships
- [x] CRUD API for trading systems
- [x] Trading systems management UI
- [x] Multi-select trading elements when creating/editing system
- [x] Activate/deactivate trading system
- [x] Show active system indicator

## Transaction-System Binding

- [x] Add tradingSystemId to transactions table
- [x] Auto-bind new transactions to active system
- [x] Display trading system in transaction list
- [x] Display trading system in transaction detail

## Per-System Statistics

- [x] Calculate win rate per trading system
- [x] Display system statistics on dashboard
- [x] Show which elements are associated with each system

## Confidence Level Feature

- [x] Add confidenceLevel field (0-100) to trading elements table
- [x] Create transaction-element junction table
- [x] Update trading elements UI with confidence level input
- [x] Add element selection in transaction form (multi-select from active system)
- [x] Calculate overall confidence level from selected elements
- [x] Display confidence level in transaction list
- [x] Display confidence level and selected elements in transaction detail
