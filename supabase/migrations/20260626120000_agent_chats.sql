-- Agent chat + project persistence (Phase 1).
--
-- Keep the in-app agent's older sessions as reopenable CHATS, groupable into
-- PROJECTS (Cowork-style). Three owner-scoped tables; RLS mirrors
-- public.user_characters EXACTLY (four owner policies on auth.uid()=user_id +
-- a service_role FOR ALL so api-v2's service-role client can write).
--
-- Persistence is ADDITIVE: the stateless brain (POST /v1/agent) and the
-- execution+credit path (/v1/skills/<slug>/run) are untouched. The web client
-- (which already holds the full ordered transcript) appends each message to an
-- idempotent endpoint; one row per message; each tool message carries the
-- skill_run_id so reopening a chat re-shows media + re-attaches a live render.

-- updated_at helper (idempotent).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 1) Projects — left-rail groups; a chat belongs to 0 or 1 project.
CREATE TABLE IF NOT EXISTS public.agent_projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  name         text NOT NULL,
  instructions text,                       -- free-text pinned context, injected into the brain SYSTEM
  emoji        text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_projects_user
  ON public.agent_projects (user_id, updated_at DESC) WHERE archived_at IS NULL;

-- 2) Chats — one row per conversation.
CREATE TABLE IF NOT EXISTS public.agent_chats (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  project_id        uuid REFERENCES public.agent_projects(id) ON DELETE SET NULL,  -- NULL = loose
  title             text,                  -- null until auto-titled
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  pinned            boolean NOT NULL DEFAULT false,
  last_skill_run_id uuid REFERENCES public.skill_runs(id) ON DELETE SET NULL,      -- O(1) "is a render live?"
  message_count     integer NOT NULL DEFAULT 0,
  last_message_at   timestamptz NOT NULL DEFAULT now(),                            -- rail sort key
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_chats_user_recent
  ON public.agent_chats (user_id, last_message_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_chats_pinned
  ON public.agent_chats (user_id, last_message_at DESC) WHERE pinned AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_chats_project
  ON public.agent_chats (project_id, last_message_at DESC) WHERE archived_at IS NULL AND project_id IS NOT NULL;

-- 3) Messages — ONE ROW PER MESSAGE (not a jsonb transcript blob).
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id          uuid NOT NULL REFERENCES public.agent_chats(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,                                                  -- denormalized for RLS + index (no join)
  seq              integer NOT NULL,                                               -- per-chat order, server-assigned MAX+1
  role             text NOT NULL CHECK (role IN ('user','assistant')),
  content          jsonb NOT NULL,                                                 -- client Msg.content verbatim (string | Block[])
  skill_run_id     uuid REFERENCES public.skill_runs(id) ON DELETE SET NULL,
  primitive_run_id uuid REFERENCES public.primitive_runs(id) ON DELETE SET NULL,
  run_kind         text CHECK (run_kind IN ('skill','primitive')),
  client_msg_id    text,                                                           -- idempotency key (tool_use.id or a uuid)
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_messages_chat_seq
  ON public.agent_messages (chat_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_messages_chat_clientid
  ON public.agent_messages (chat_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

-- updated_at triggers (projects + chats).
DROP TRIGGER IF EXISTS trg_agent_projects_updated ON public.agent_projects;
CREATE TRIGGER trg_agent_projects_updated BEFORE UPDATE ON public.agent_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_agent_chats_updated ON public.agent_chats;
CREATE TRIGGER trg_agent_chats_updated BEFORE UPDATE ON public.agent_chats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS — mirror public.user_characters (owner policies + service_role FOR ALL).
ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_projects_owner_select ON public.agent_projects;
DROP POLICY IF EXISTS agent_projects_owner_insert ON public.agent_projects;
DROP POLICY IF EXISTS agent_projects_owner_update ON public.agent_projects;
DROP POLICY IF EXISTS agent_projects_owner_delete ON public.agent_projects;
DROP POLICY IF EXISTS agent_projects_service_all  ON public.agent_projects;
CREATE POLICY agent_projects_owner_select ON public.agent_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY agent_projects_owner_insert ON public.agent_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_projects_owner_update ON public.agent_projects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_projects_owner_delete ON public.agent_projects FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY agent_projects_service_all  ON public.agent_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_chats_owner_select ON public.agent_chats;
DROP POLICY IF EXISTS agent_chats_owner_insert ON public.agent_chats;
DROP POLICY IF EXISTS agent_chats_owner_update ON public.agent_chats;
DROP POLICY IF EXISTS agent_chats_owner_delete ON public.agent_chats;
DROP POLICY IF EXISTS agent_chats_service_all  ON public.agent_chats;
CREATE POLICY agent_chats_owner_select ON public.agent_chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY agent_chats_owner_insert ON public.agent_chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_chats_owner_update ON public.agent_chats FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_chats_owner_delete ON public.agent_chats FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY agent_chats_service_all  ON public.agent_chats FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_messages_owner_select ON public.agent_messages;
DROP POLICY IF EXISTS agent_messages_owner_insert ON public.agent_messages;
DROP POLICY IF EXISTS agent_messages_owner_update ON public.agent_messages;
DROP POLICY IF EXISTS agent_messages_owner_delete ON public.agent_messages;
DROP POLICY IF EXISTS agent_messages_service_all  ON public.agent_messages;
CREATE POLICY agent_messages_owner_select ON public.agent_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY agent_messages_owner_insert ON public.agent_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_messages_owner_update ON public.agent_messages FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_messages_owner_delete ON public.agent_messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY agent_messages_service_all  ON public.agent_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
