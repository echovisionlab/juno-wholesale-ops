BEGIN;

CREATE TABLE dashboard_saved_view (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_saved_view_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT dashboard_saved_view_filters_object CHECK (jsonb_typeof(filters) = 'object')
);

CREATE INDEX dashboard_saved_view_sort_order_idx
  ON dashboard_saved_view (sort_order, name);

COMMIT;
