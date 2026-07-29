-- Durable agent loop — goal-level task model (Phase 1, the data foundation).
--
-- Sits ALONGSIDE agent_chats/agent_messages (a conversation) and the existing
-- skill_runs/primitive_runs (the money/run source of truth). A "task" is a
-- goal the durable agentTaskWorkflow (Phase 2) decomposes into steps; each
-- skill step POINTS at the existing skill_runs/primitive_runs row (no run-state
-- denormalization — those stay the single source of truth). These tables are
-- DORMANT until Phase 2 turns on the Temporal loop (flag off); nothing writes
-- them yet. RLS mirrors public.agent_chats EXACTLY (4 owner policies on
-- auth.uid()=user_id + a service_role FOR ALL so the workflow's service-role
-- client can write). updated_at via the existing set_updated_at() trigger.

-- 1) Tasks — one row per goal.
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  chat_id            uuid REFERENCES public.agent_chats(id) ON DELETE SET NULL,  -- chat-bound or standalone batch
  goal               text NOT NULL,
  status             text NOT NULL DEFAULT 'planning'
                       CHECK (status IN ('planning','pending_confirmation','running','paused','succeeded','failed','cancelled')),
  plan               jsonb,                                    -- propose_plan output: {steps:[{action,estimated_credits}], total_credits}
  spent_credits      integer NOT NULL DEFAULT 0,               -- UI mirror; credit_transactions is the truth
  ceiling_credits    integer NOT NULL DEFAULT 0,               -- hard per-task spend cap (carried into workflow input)
  auto_confirm_under integer NOT NULL DEFAULT 0,               -- Act+checkpoint: auto-confirm steps cheaper than this
  step_count         integer NOT NULL DEFAULT 0,
  workflow_id        text,                                     -- so api-v2 can getHandle() to signal
  active_session_id  text,                                     -- soft single-active-device lock
  error_message      text,
  archived_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_user
  ON public.agent_tasks (user_id, updated_at DESC) WHERE archived_at IS NULL;
-- "is a task live?" reattach lookup.
CREATE INDEX IF NOT EXISTS idx_agent_tasks_live
  ON public.agent_tasks (user_id, updated_at DESC) WHERE status IN ('running','paused','pending_confirmation');
CREATE INDEX IF NOT EXISTS idx_agent_tasks_chat
  ON public.agent_tasks (chat_id) WHERE chat_id IS NOT NULL;

-- 2) Task steps — one row per think/ask_user/skill step; points at the run rows.
CREATE TABLE IF NOT EXISTS public.agent_task_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,                              -- denormalized for RLS + index (no join)
  ordinal          integer NOT NULL,
  title            text,
  kind             text CHECK (kind IN ('think','ask_user','skill')),
  skill_name       text,                                       -- the tool_use.name
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','awaiting_confirm','succeeded','failed','skipped')),
  skill_run_id     uuid REFERENCES public.skill_runs(id) ON DELETE SET NULL,
  primitive_run_id uuid REFERENCES public.primitive_runs(id) ON DELETE SET NULL,
  run_kind         text CHECK (run_kind IN ('skill','primitive')),
  cost_credits     integer,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_task_steps_task_ordinal
  ON public.agent_task_steps (task_id, ordinal);

-- updated_at trigger (tasks).
DROP TRIGGER IF EXISTS trg_agent_tasks_updated ON public.agent_tasks;
CREATE TRIGGER trg_agent_tasks_updated BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS — mirror public.agent_chats (owner policies + service_role FOR ALL).
ALTER TABLE public.agent_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_tasks_owner_select ON public.agent_tasks;
DROP POLICY IF EXISTS agent_tasks_owner_insert ON public.agent_tasks;
DROP POLICY IF EXISTS agent_tasks_owner_update ON public.agent_tasks;
DROP POLICY IF EXISTS agent_tasks_owner_delete ON public.agent_tasks;
DROP POLICY IF EXISTS agent_tasks_service_all  ON public.agent_tasks;
CREATE POLICY agent_tasks_owner_select ON public.agent_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY agent_tasks_owner_insert ON public.agent_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_tasks_owner_update ON public.agent_tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_tasks_owner_delete ON public.agent_tasks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY agent_tasks_service_all  ON public.agent_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_task_steps_owner_select ON public.agent_task_steps;
DROP POLICY IF EXISTS agent_task_steps_owner_insert ON public.agent_task_steps;
DROP POLICY IF EXISTS agent_task_steps_owner_update ON public.agent_task_steps;
DROP POLICY IF EXISTS agent_task_steps_owner_delete ON public.agent_task_steps;
DROP POLICY IF EXISTS agent_task_steps_service_all  ON public.agent_task_steps;
CREATE POLICY agent_task_steps_owner_select ON public.agent_task_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY agent_task_steps_owner_insert ON public.agent_task_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_task_steps_owner_update ON public.agent_task_steps FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_task_steps_owner_delete ON public.agent_task_steps FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY agent_task_steps_service_all  ON public.agent_task_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
