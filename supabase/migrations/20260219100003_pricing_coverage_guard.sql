-- Pricing coverage guard: prevent activating a model without complete pricing rows.
-- This trigger fires on INSERT/UPDATE to `models` when is_active = true.
-- It checks that every supported operation has at least one pricing row,
-- and that every allowed_duration has a matching pricing row per operation.

CREATE OR REPLACE FUNCTION check_pricing_coverage()
RETURNS TRIGGER AS $$
DECLARE
  ops TEXT[] := '{}';
  op TEXT;
  dur INT;
  durs INT[];
  missing_ops TEXT[] := '{}';
  missing_combos TEXT[] := '{}';
BEGIN
  -- Only enforce on active models
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Require allowed_durations for video models
  IF NEW.media_type = 'video' AND NEW.allowed_durations IS NULL THEN
    RAISE EXCEPTION 'Video model "%" must have allowed_durations set (not NULL) before activation.',
      NEW.slug;
  END IF;

  -- Build list of expected operations
  IF NEW.supports_text_to_video THEN ops := array_append(ops, 'text_to_video'); END IF;
  IF NEW.supports_image_to_video THEN ops := array_append(ops, 'image_to_video'); END IF;
  IF NEW.supports_text_to_image THEN ops := array_append(ops, 'text_to_image'); END IF;

  -- Check each operation has at least one pricing row
  FOREACH op IN ARRAY ops LOOP
    IF NOT EXISTS (
      SELECT 1 FROM model_pricing
      WHERE model_slug = NEW.slug AND operation = op
    ) THEN
      missing_ops := array_append(missing_ops, op);
    END IF;
  END LOOP;

  IF array_length(missing_ops, 1) > 0 THEN
    RAISE EXCEPTION 'Model "%" is missing pricing rows for operations: %. Add rows to model_pricing before activating.',
      NEW.slug, array_to_string(missing_ops, ', ');
  END IF;

  -- For video models with allowed_durations, check every duration × operation combo
  IF NEW.media_type = 'video' AND NEW.allowed_durations IS NOT NULL THEN
    SELECT array_agg(d::int) INTO durs
    FROM jsonb_array_elements_text(NEW.allowed_durations) AS d;

    IF durs IS NOT NULL THEN
      FOREACH op IN ARRAY ops LOOP
        -- Skip image operations that don't need duration rows
        IF op = 'text_to_image' THEN CONTINUE; END IF;

        FOREACH dur IN ARRAY durs LOOP
          IF NOT EXISTS (
            SELECT 1 FROM model_pricing
            WHERE model_slug = NEW.slug
              AND operation = op
              AND duration_seconds = dur
          ) THEN
            missing_combos := array_append(missing_combos, op || ' @ ' || dur || 's');
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  IF array_length(missing_combos, 1) > 0 THEN
    RAISE EXCEPTION 'Model "%" is missing pricing rows for: %. Add rows to model_pricing before activating.',
      NEW.slug, array_to_string(missing_combos, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on models table
DROP TRIGGER IF EXISTS trg_check_pricing_coverage ON models;
CREATE TRIGGER trg_check_pricing_coverage
  BEFORE INSERT OR UPDATE ON models
  FOR EACH ROW
  EXECUTE FUNCTION check_pricing_coverage();

-- Also guard against deleting pricing rows that would break coverage.
-- This trigger fires on DELETE from model_pricing and checks the parent model.
CREATE OR REPLACE FUNCTION check_pricing_not_orphaned()
RETURNS TRIGGER AS $$
DECLARE
  model_rec RECORD;
  op_count INT;
BEGIN
  -- Look up the model
  SELECT * INTO model_rec FROM models WHERE slug = OLD.model_slug AND is_active = true;

  -- If model doesn't exist or is inactive, allow the delete
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  -- Check if this delete would leave the operation with zero rows
  SELECT COUNT(*) INTO op_count FROM model_pricing
  WHERE model_slug = OLD.model_slug
    AND operation = OLD.operation
    AND id != OLD.id;

  IF op_count = 0 THEN
    RAISE EXCEPTION 'Cannot delete last pricing row for active model "%", operation "%". Deactivate the model first or add a replacement row.',
      OLD.model_slug, OLD.operation;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_pricing_not_orphaned ON model_pricing;
CREATE TRIGGER trg_check_pricing_not_orphaned
  BEFORE DELETE ON model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION check_pricing_not_orphaned();
