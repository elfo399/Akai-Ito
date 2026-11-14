ALTER TABLE memory_media ADD COLUMN latitude REAL CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE memory_media ADD COLUMN longitude REAL CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180);
ALTER TABLE memory_media ADD COLUMN captured_on TEXT;
ALTER TABLE memory_media ADD COLUMN location_source TEXT CHECK(location_source IS NULL OR location_source IN ('exif', 'manual'));
