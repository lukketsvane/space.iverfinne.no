-- This function recursively fetches the path from a given folder up to the root.
CREATE OR REPLACE FUNCTION get_folder_path(start_folder_id UUID)
RETURNS TABLE(id UUID, name TEXT, "level" BIGINT) AS $$
BEGIN
  RETURN QUERY
    WITH RECURSIVE folder_path_cte AS (
      SELECT f.id, f.name, f.parent_id, 1 AS level
      FROM folders f
      WHERE f.id = start_folder_id
      UNION ALL
      SELECT f.id, f.name, f.parent_id, p.level + 1
      FROM folders f
      JOIN folder_path_cte p ON f.id = p.parent_id
    )
    SELECT fp.id, fp.name, CAST(fp.level AS BIGINT)
    FROM folder_path_cte fp
    ORDER BY fp.level DESC;
END;
$$ LANGUAGE plpgsql;
