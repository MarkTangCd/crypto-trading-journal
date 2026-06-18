export function LegacyWarning() {
  return (
    <div className="border-l-2 border-foreground pl-3 py-1 status-loss">
      <p className="text-sm">this trade predates the plan fields.</p>
      <p className="text-label mt-1">
        entry price, position size, or planned stop loss is missing. edit the
        trade to add them, or delete and re-record it.
      </p>
    </div>
  );
}
