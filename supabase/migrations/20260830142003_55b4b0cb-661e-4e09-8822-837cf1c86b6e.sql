CREATE POLICY "nexdrive own files select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'nexdrive' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "nexdrive own files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nexdrive' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "nexdrive own files update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nexdrive' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'nexdrive' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "nexdrive own files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'nexdrive' AND (storage.foldername(name))[1] = auth.uid()::text);