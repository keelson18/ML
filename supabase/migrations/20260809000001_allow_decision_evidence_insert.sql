-- Allow authenticated users to append evidence only to their own decisions.
-- Evidence remains immutable because no update or delete policy is provided.

DROP POLICY IF EXISTS "users_insert_own_evidence" ON decision_evidence;
CREATE POLICY "users_insert_own_evidence" ON decision_evidence FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM trade_decisions d
    WHERE d.id = decision_id AND d.user_id = auth.uid()
  ));