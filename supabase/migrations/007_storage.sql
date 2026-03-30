-- =============================================================
-- 007_storage.sql — Reborn Labs Admin: Storage 버킷 + 정책
-- 6개 버킷, 모두 10MB 파일 크기 제한
--
-- 폴더 구조 규칙:
--   vehicles/   → {vehicle_id}/{filename}
--   checklists/ → {dealer_id}/{filename}
--   contracts/  → {sale_id}/{filename}
--   signatures/ → {sale_id}/{filename} (1회만, 덮어쓰기 차단)
--   receipts/   → {expense_id}/{filename}
--   documents/  → {category}/{filename}
-- =============================================================

BEGIN;

-- =============================================================
-- 버킷 생성
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('vehicles',    'vehicles',    false, 10485760),
  ('checklists',  'checklists',  false, 10485760),
  ('contracts',   'contracts',   false, 10485760),
  ('signatures',  'signatures',  false, 10485760),
  ('receipts',    'receipts',    false, 10485760),
  ('documents',   'documents',   false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 1. vehicles 버킷
-- admin/staff: 업로드 + 삭제
-- authenticated: 읽기
-- =============================================================

CREATE POLICY vehicles_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicles'
    AND public.user_role() IN ('admin', 'staff', 'dealer')
  );

CREATE POLICY vehicles_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicles'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY vehicles_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'vehicles'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY vehicles_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vehicles'
    AND public.user_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'vehicles'
    AND public.user_role() IN ('admin', 'staff')
  );

-- =============================================================
-- 2. checklists 버킷
-- dealer: 본인 폴더(dealer_id/) 업로드
-- admin/staff: 읽기
-- =============================================================

CREATE POLICY checklists_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'checklists'
    AND public.user_role() IN ('admin', 'staff', 'dealer')
  );

CREATE POLICY checklists_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'checklists'
    AND (
      (public.user_role() = 'dealer' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
      OR public.user_role() IN ('admin', 'staff')
    )
  );

CREATE POLICY checklists_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'checklists'
    AND (
      (public.user_role() = 'dealer' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
      OR public.user_role() IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    bucket_id = 'checklists'
    AND (
      (public.user_role() = 'dealer' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
      OR public.user_role() IN ('admin', 'staff')
    )
  );

CREATE POLICY checklists_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'checklists'
    AND public.user_role() IN ('admin', 'staff')
  );

-- =============================================================
-- 3. contracts 버킷
-- dealer: 본인 sale 폴더 업로드
-- admin/staff: 읽기
-- =============================================================

CREATE POLICY contracts_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts'
    AND public.user_role() IN ('admin', 'staff', 'dealer')
  );

CREATE POLICY contracts_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND (
      (public.user_role() = 'dealer'
       AND (storage.foldername(name))[1] IN (
         SELECT id::TEXT FROM sales WHERE dealer_id = auth.uid()
       ))
      OR public.user_role() IN ('admin', 'staff')
    )
  );

CREATE POLICY contracts_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contracts'
    AND public.user_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'contracts'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY contracts_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contracts'
    AND public.user_role() IN ('admin', 'staff')
  );

-- =============================================================
-- 4. signatures 버킷
-- dealer: 본인 sale 폴더 1회 업로드 (덮어쓰기 차단)
-- admin/staff: 읽기
-- =============================================================

CREATE POLICY signatures_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND public.user_role() IN ('admin', 'staff', 'dealer')
  );

CREATE POLICY signatures_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signatures'
    AND (
      (public.user_role() = 'dealer'
       AND (storage.foldername(name))[1] IN (
         SELECT id::TEXT FROM sales WHERE dealer_id = auth.uid()
       ))
      OR public.user_role() IN ('admin', 'staff')
    )
  );

-- UPDATE 차단: 딜러는 서명 파일을 덮어쓸 수 없음 (1회만 업로드)
CREATE POLICY signatures_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'signatures'
    AND public.user_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY signatures_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'signatures'
    AND public.user_role() IN ('admin', 'staff')
  );

-- =============================================================
-- 5. receipts 버킷
-- 본인 expense 폴더 업로드
-- admin/staff: 읽기
-- =============================================================

CREATE POLICY receipts_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.user_role() IN ('admin', 'staff', 'dealer')
  );

CREATE POLICY receipts_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY receipts_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.user_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY receipts_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.user_role() IN ('admin', 'staff')
  );

-- =============================================================
-- 6. documents 버킷
-- admin/staff: 업로드
-- authenticated: 읽기
-- 삭제: admin만
-- =============================================================

CREATE POLICY documents_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_role() IN ('admin', 'staff', 'dealer')
  );

CREATE POLICY documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY documents_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND public.user_role() IN ('admin', 'staff')
  );

CREATE POLICY documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_role() = 'admin'
  );

COMMIT;
