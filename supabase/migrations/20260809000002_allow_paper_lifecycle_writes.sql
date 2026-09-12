-- Allow authenticated owners to append and advance their own paper lifecycle.
-- Paper trades remain immutable: no update or delete policy is provided.

DROP POLICY IF EXISTS "users_insert_own_orders" ON paper_orders;
CREATE POLICY "users_insert_own_orders" ON paper_orders FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trade_decisions d WHERE d.id = decision_id AND d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "users_update_own_orders" ON paper_orders;
CREATE POLICY "users_update_own_orders" ON paper_orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));

DROP POLICY IF EXISTS "users_insert_own_positions" ON paper_positions;
CREATE POLICY "users_insert_own_positions" ON paper_positions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));

DROP POLICY IF EXISTS "users_update_own_positions" ON paper_positions;
CREATE POLICY "users_update_own_positions" ON paper_positions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));

DROP POLICY IF EXISTS "users_insert_own_trades" ON paper_trades;
CREATE POLICY "users_insert_own_trades" ON paper_trades FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trade_decisions d WHERE d.id = decision_id AND d.user_id = auth.uid())
  );