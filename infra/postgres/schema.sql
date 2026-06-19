-- migration-manifest-sha256: 5411de5d68fbdeb92af6ba638cc33e96b8aeb0e86c3c0edebfc3ca4c3b3ff10c
--
-- PostgreSQL database dump
--

\restrict junoWholesaleOpsSchemaDump

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_session (
    id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL
);


--
-- Name: auth_sso_admin_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sso_admin_rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    rule_type text NOT NULL,
    rule_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_sso_admin_rule_type_check CHECK ((rule_type = ANY (ARRAY['email_allowlist'::text, 'claim_equals'::text])))
);


--
-- Name: auth_sso_provider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sso_provider (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id text NOT NULL,
    display_name text NOT NULL,
    button_label text,
    logo_url text,
    discovery_url text,
    client_id text,
    client_secret text,
    scopes text DEFAULT 'openid email profile'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_sso_provider_id_format_check CHECK ((provider_id ~ '^[a-z0-9][a-z0-9_-]{1,62}$'::text))
);


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_user_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);


--
-- Name: auth_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_item_identity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_item_identity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    identity_key text NOT NULL,
    juno_id text,
    barcode text,
    artist_norm text,
    title_norm text,
    label_norm text,
    cat_no_norm text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_item_raw; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_item_raw (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid NOT NULL,
    row_number integer NOT NULL,
    juno_id text,
    barcode text,
    artist text,
    title text,
    label text,
    cat_no text,
    medium text,
    description text,
    genre text,
    dealer_ex_vat_text text,
    dealer_price_gbp numeric(12,2),
    stock integer,
    release_date date,
    max_order integer,
    raw jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    identity_id uuid
);


--
-- Name: catalog_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    catalog_kind text NOT NULL,
    catalog_date date,
    source_filename text NOT NULL,
    source_attachment_id uuid NOT NULL,
    content_hash text NOT NULL,
    row_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_snapshot_catalog_kind_check CHECK ((catalog_kind = ANY (ARRAY['preorder'::text, 'in_stock'::text, 'unknown'::text])))
);


--
-- Name: email_adapter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_adapter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_adapter_type_check CHECK ((type = ANY (ARRAY['logging'::text, 'smtp'::text])))
);


--
-- Name: juno_live_lookup_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.juno_live_lookup_job (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    juno_id text NOT NULL,
    catalog_item_raw_id uuid,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 2 NOT NULL,
    not_before timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT juno_live_lookup_job_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'blocked'::text, 'manual_required'::text])))
);


--
-- Name: juno_live_lookup_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.juno_live_lookup_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_source text NOT NULL,
    status text NOT NULL,
    worker_id text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    CONSTRAINT juno_live_lookup_run_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: juno_live_observation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.juno_live_observation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    run_id uuid,
    juno_id text NOT NULL,
    catalog_item_raw_id uuid,
    status text NOT NULL,
    stock_quantity integer,
    stock_text text,
    display_stock text DEFAULT 'N/A'::text NOT NULL,
    wholesale_price_gbp numeric(12,2),
    product_url text NOT NULL,
    final_url text,
    parser_version text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    identity_id uuid,
    CONSTRAINT juno_live_observation_status_check CHECK ((status = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'preorder'::text, 'coming_soon'::text, 'unknown'::text, 'failed'::text, 'blocked'::text])))
);


--
-- Name: mail_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_attachment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    byte_size integer NOT NULL,
    sha256 text NOT NULL,
    storage_uri text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_connection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    auth_type text NOT NULL,
    credential_type text NOT NULL,
    credential_secret text,
    credential_reference text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_connection_auth_type_check CHECK ((auth_type = ANY (ARRAY['google_workspace_delegation'::text, 'basic'::text, 'oauth2'::text, 'api_token'::text, 'none'::text]))),
    CONSTRAINT mail_connection_credential_type_check CHECK ((credential_type = ANY (ARRAY['google_service_account_json'::text, 'password'::text, 'oauth_client_secret'::text, 'api_token'::text, 'none'::text]))),
    CONSTRAINT mail_connection_gmail_credential_check CHECK (((provider <> 'gmail'::text) OR ((auth_type = 'google_workspace_delegation'::text) AND (credential_type = 'google_service_account_json'::text)))),
    CONSTRAINT mail_connection_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'imap'::text, 'microsoft_graph'::text, 'generic'::text]))),
    CONSTRAINT mail_connection_secret_or_reference_check CHECK (((credential_type = 'none'::text) OR (credential_secret IS NOT NULL) OR (credential_reference IS NOT NULL)))
);


--
-- Name: mail_mailbox_ingest_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_mailbox_ingest_state (
    mailbox_source_id uuid NOT NULL,
    last_query text,
    last_query_window_from timestamp with time zone,
    last_query_window_to timestamp with time zone,
    last_query_started_at timestamp with time zone,
    last_query_finished_at timestamp with time zone,
    last_query_status text,
    last_query_error text,
    last_query_message_count integer DEFAULT 0 NOT NULL,
    last_query_attachment_count integer DEFAULT 0 NOT NULL,
    last_successful_message_received_at timestamp with time zone,
    last_ingested_snapshot_id uuid,
    last_ingested_catalog_date date,
    last_ingested_content_hash text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_mailbox_ingest_state_last_query_attachment_count_check CHECK ((last_query_attachment_count >= 0)),
    CONSTRAINT mail_mailbox_ingest_state_last_query_message_count_check CHECK ((last_query_message_count >= 0)),
    CONSTRAINT mail_mailbox_ingest_state_last_query_status_check CHECK ((last_query_status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: mail_mailbox_source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_mailbox_source (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    mailbox_address text NOT NULL,
    display_name text,
    provider_mailbox_id text,
    ingest_query text NOT NULL,
    max_results integer DEFAULT 25 NOT NULL,
    ingest_lookback_ms integer DEFAULT 604800000 NOT NULL,
    processed_label text DEFAULT 'Wholesale Processed'::text NOT NULL,
    storage_dir text DEFAULT '.data/mail-attachments'::text NOT NULL,
    attachment_pattern text DEFAULT 'New Preorders|New Releases In Stock'::text NOT NULL,
    supplier_code text DEFAULT 'juno'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_mailbox_source_ingest_lookback_ms_check CHECK ((ingest_lookback_ms > 0)),
    CONSTRAINT mail_mailbox_source_max_results_check CHECK (((max_results > 0) AND (max_results <= 500)))
);


--
-- Name: mail_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rfc822_message_id text,
    subject text,
    from_address text,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    delivered_to text[] DEFAULT '{}'::text[] NOT NULL,
    received_at timestamp with time zone,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb NOT NULL,
    provider text NOT NULL,
    mailbox_address text NOT NULL,
    mailbox_source_id uuid,
    provider_message_id text NOT NULL,
    provider_thread_id text,
    CONSTRAINT mail_message_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'imap'::text, 'microsoft_graph'::text, 'generic'::text])))
);


--
-- Name: notification_channel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_channel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    secret_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_channel_type_check CHECK ((type = ANY (ARRAY['in_app'::text, 'webhook'::text, 'logging'::text])))
);


--
-- Name: notification_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid,
    channel_id uuid,
    signal_event_id uuid,
    digest_key text,
    status text NOT NULL,
    delivery_key text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_delivery_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: notification_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    channel_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    signal_types text[] DEFAULT '{}'::text[] NOT NULL,
    severities text[] DEFAULT '{}'::text[] NOT NULL,
    min_score integer DEFAULT 0 NOT NULL,
    include_watch_hits boolean DEFAULT true NOT NULL,
    include_digest boolean DEFAULT false NOT NULL,
    cooldown_minutes integer DEFAULT 60 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_rule_cooldown_minutes_check CHECK ((cooldown_minutes >= 0)),
    CONSTRAINT notification_rule_min_score_check CHECK (((min_score >= '-100'::integer) AND (min_score <= 100)))
);


--
-- Name: processing_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processing_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_type text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    CONSTRAINT processing_run_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: schema_migration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migration (
    version integer NOT NULL,
    filename text NOT NULL,
    name text NOT NULL,
    sha256 text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schema_migration_sha256_check CHECK ((length(sha256) = 64)),
    CONSTRAINT schema_migration_version_check CHECK (((version >= 1) AND (version <= 9999999)))
);


--
-- Name: service_log_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_log_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    correlation_id text,
    run_id uuid,
    job_id uuid,
    component text NOT NULL,
    level text NOT NULL,
    event_name text NOT NULL,
    message text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_log_event_level_check CHECK ((level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text])))
);


--
-- Name: service_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_setting (
    id boolean DEFAULT true NOT NULL,
    juno_live_enqueue_on_ingest boolean,
    juno_login_email text,
    juno_login_password text,
    juno_browser_profile_dir text,
    juno_browser_headless boolean,
    juno_live_concurrency integer,
    juno_live_delay_min_ms integer,
    juno_live_delay_max_ms integer,
    juno_live_nav_timeout_ms integer,
    juno_live_max_attempts integer,
    juno_live_poll_interval_ms integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    juno_live_auto_enqueue_on_interval boolean,
    juno_live_auto_enqueue_limit integer,
    auth_base_url text,
    auth_trusted_origins text,
    data_mode text,
    auth_secret text,
    auth_login_logo_url text,
    auth_email_password_login_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT service_setting_auth_login_logo_url_asset_check CHECK (((auth_login_logo_url IS NULL) OR (auth_login_logo_url ~* '^https?://[^[:space:]]+\.(png|webp|svg)([?#].*)?$'::text))),
    CONSTRAINT service_setting_auth_secret_length_check CHECK (((auth_secret IS NULL) OR (length(auth_secret) >= 32))),
    CONSTRAINT service_setting_data_mode_check CHECK (((data_mode IS NULL) OR (data_mode = ANY (ARRAY['demo'::text, 'real_mailbox'::text])))),
    CONSTRAINT service_setting_id_check CHECK (id),
    CONSTRAINT service_setting_juno_live_auto_enqueue_limit_check CHECK ((juno_live_auto_enqueue_limit > 0)),
    CONSTRAINT service_setting_juno_live_concurrency_check CHECK (((juno_live_concurrency >= 1) AND (juno_live_concurrency <= 10))),
    CONSTRAINT service_setting_juno_live_delay_max_ms_check CHECK ((juno_live_delay_max_ms >= 0)),
    CONSTRAINT service_setting_juno_live_delay_min_ms_check CHECK ((juno_live_delay_min_ms >= 0)),
    CONSTRAINT service_setting_juno_live_delay_range_check CHECK (((juno_live_delay_min_ms IS NULL) OR (juno_live_delay_max_ms IS NULL) OR (juno_live_delay_min_ms <= juno_live_delay_max_ms))),
    CONSTRAINT service_setting_juno_live_max_attempts_check CHECK ((juno_live_max_attempts > 0)),
    CONSTRAINT service_setting_juno_live_nav_timeout_ms_check CHECK ((juno_live_nav_timeout_ms > 0)),
    CONSTRAINT service_setting_juno_live_poll_interval_ms_check CHECK ((juno_live_poll_interval_ms > 0))
);


--
-- Name: signal_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid,
    catalog_item_raw_id uuid,
    type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    detail text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_key text,
    CONSTRAINT signal_event_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'watch'::text, 'warning'::text, 'critical'::text]))),
    CONSTRAINT signal_event_type_check CHECK ((type = ANY (ARRAY['new_arrival'::text, 'watch_hit'::text, 'low_catalog_stock'::text, 'exclude_match'::text, 'observed_restock'::text, 'observed_stock_drop'::text, 'observed_live_low_stock'::text, 'observed_status_change'::text, 'observed_price_change'::text, 'fast_mover_candidate'::text, 'trend_spike'::text])))
);


--
-- Name: supplier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watch_match; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watch_match (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    watch_rule_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    catalog_item_raw_id uuid,
    matched_field text NOT NULL,
    score integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watch_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watch_rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    pattern text NOT NULL,
    pattern_norm text NOT NULL,
    weight integer DEFAULT 10 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT watch_rule_pattern_norm_check CHECK ((length(pattern_norm) > 0)),
    CONSTRAINT watch_rule_type_check CHECK ((type = ANY (ARRAY['artist'::text, 'label'::text, 'genre'::text, 'keyword'::text, 'exclude_keyword'::text]))),
    CONSTRAINT watch_rule_weight_check CHECK (((weight >= '-100'::integer) AND (weight <= 100)))
);


--
-- Name: auth_account auth_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT auth_account_pkey PRIMARY KEY (id);


--
-- Name: auth_account auth_account_provider_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT auth_account_provider_id_account_id_key UNIQUE (provider_id, account_id);


--
-- Name: auth_session auth_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_pkey PRIMARY KEY (id);


--
-- Name: auth_session auth_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_token_key UNIQUE (token);


--
-- Name: auth_sso_admin_rule auth_sso_admin_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sso_admin_rule
    ADD CONSTRAINT auth_sso_admin_rule_pkey PRIMARY KEY (id);


--
-- Name: auth_sso_admin_rule auth_sso_admin_rule_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sso_admin_rule
    ADD CONSTRAINT auth_sso_admin_rule_unique UNIQUE (provider_id, rule_type, rule_value);


--
-- Name: auth_sso_provider auth_sso_provider_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sso_provider
    ADD CONSTRAINT auth_sso_provider_pkey PRIMARY KEY (id);


--
-- Name: auth_sso_provider auth_sso_provider_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sso_provider
    ADD CONSTRAINT auth_sso_provider_provider_id_key UNIQUE (provider_id);


--
-- Name: auth_user auth_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_email_key UNIQUE (email);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: auth_verification auth_verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_verification
    ADD CONSTRAINT auth_verification_pkey PRIMARY KEY (id);


--
-- Name: catalog_item_identity catalog_item_identity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_identity
    ADD CONSTRAINT catalog_item_identity_pkey PRIMARY KEY (id);


--
-- Name: catalog_item_identity catalog_item_identity_supplier_id_identity_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_identity
    ADD CONSTRAINT catalog_item_identity_supplier_id_identity_key_key UNIQUE (supplier_id, identity_key);


--
-- Name: catalog_item_raw catalog_item_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_raw
    ADD CONSTRAINT catalog_item_raw_pkey PRIMARY KEY (id);


--
-- Name: catalog_item_raw catalog_item_raw_snapshot_id_row_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_raw
    ADD CONSTRAINT catalog_item_raw_snapshot_id_row_number_key UNIQUE (snapshot_id, row_number);


--
-- Name: catalog_snapshot catalog_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_snapshot
    ADD CONSTRAINT catalog_snapshot_pkey PRIMARY KEY (id);


--
-- Name: catalog_snapshot catalog_snapshot_supplier_id_catalog_kind_catalog_date_cont_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_snapshot
    ADD CONSTRAINT catalog_snapshot_supplier_id_catalog_kind_catalog_date_cont_key UNIQUE (supplier_id, catalog_kind, catalog_date, content_hash);


--
-- Name: email_adapter email_adapter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_adapter
    ADD CONSTRAINT email_adapter_pkey PRIMARY KEY (id);


--
-- Name: juno_live_lookup_job juno_live_lookup_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_lookup_job
    ADD CONSTRAINT juno_live_lookup_job_pkey PRIMARY KEY (id);


--
-- Name: juno_live_lookup_run juno_live_lookup_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_lookup_run
    ADD CONSTRAINT juno_live_lookup_run_pkey PRIMARY KEY (id);


--
-- Name: juno_live_observation juno_live_observation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_observation
    ADD CONSTRAINT juno_live_observation_pkey PRIMARY KEY (id);


--
-- Name: mail_attachment mail_attachment_message_id_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_attachment
    ADD CONSTRAINT mail_attachment_message_id_sha256_key UNIQUE (message_id, sha256);


--
-- Name: mail_attachment mail_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_attachment
    ADD CONSTRAINT mail_attachment_pkey PRIMARY KEY (id);


--
-- Name: mail_connection mail_connection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_connection
    ADD CONSTRAINT mail_connection_pkey PRIMARY KEY (id);


--
-- Name: mail_mailbox_ingest_state mail_mailbox_ingest_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_mailbox_ingest_state
    ADD CONSTRAINT mail_mailbox_ingest_state_pkey PRIMARY KEY (mailbox_source_id);


--
-- Name: mail_mailbox_source mail_mailbox_source_connection_id_mailbox_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_mailbox_source
    ADD CONSTRAINT mail_mailbox_source_connection_id_mailbox_address_key UNIQUE (connection_id, mailbox_address);


--
-- Name: mail_mailbox_source mail_mailbox_source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_mailbox_source
    ADD CONSTRAINT mail_mailbox_source_pkey PRIMARY KEY (id);


--
-- Name: mail_message mail_message_mailbox_provider_message_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_message
    ADD CONSTRAINT mail_message_mailbox_provider_message_unique UNIQUE (provider, mailbox_address, provider_message_id);


--
-- Name: mail_message mail_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_message
    ADD CONSTRAINT mail_message_pkey PRIMARY KEY (id);


--
-- Name: notification_channel notification_channel_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel
    ADD CONSTRAINT notification_channel_name_key UNIQUE (name);


--
-- Name: notification_channel notification_channel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel
    ADD CONSTRAINT notification_channel_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery notification_delivery_delivery_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_delivery_key_key UNIQUE (delivery_key);


--
-- Name: notification_delivery notification_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_pkey PRIMARY KEY (id);


--
-- Name: notification_rule notification_rule_name_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rule
    ADD CONSTRAINT notification_rule_name_channel_id_key UNIQUE (name, channel_id);


--
-- Name: notification_rule notification_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rule
    ADD CONSTRAINT notification_rule_pkey PRIMARY KEY (id);


--
-- Name: processing_run processing_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_run
    ADD CONSTRAINT processing_run_pkey PRIMARY KEY (id);


--
-- Name: schema_migration schema_migration_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migration
    ADD CONSTRAINT schema_migration_filename_key UNIQUE (filename);


--
-- Name: schema_migration schema_migration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migration
    ADD CONSTRAINT schema_migration_pkey PRIMARY KEY (version);


--
-- Name: service_log_event service_log_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_log_event
    ADD CONSTRAINT service_log_event_pkey PRIMARY KEY (id);


--
-- Name: service_setting service_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_setting
    ADD CONSTRAINT service_setting_pkey PRIMARY KEY (id);


--
-- Name: signal_event signal_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_event
    ADD CONSTRAINT signal_event_pkey PRIMARY KEY (id);


--
-- Name: supplier supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier
    ADD CONSTRAINT supplier_code_key UNIQUE (code);


--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (id);


--
-- Name: watch_match watch_match_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_match
    ADD CONSTRAINT watch_match_pkey PRIMARY KEY (id);


--
-- Name: watch_rule watch_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_rule
    ADD CONSTRAINT watch_rule_pkey PRIMARY KEY (id);


--
-- Name: watch_rule watch_rule_type_pattern_norm_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_rule
    ADD CONSTRAINT watch_rule_type_pattern_norm_key UNIQUE (type, pattern_norm);


--
-- Name: idx_auth_account_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_account_user_id ON public.auth_account USING btree (user_id);


--
-- Name: idx_auth_session_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_session_user_id ON public.auth_session USING btree (user_id);


--
-- Name: idx_auth_verification_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_verification_identifier ON public.auth_verification USING btree (identifier);


--
-- Name: idx_catalog_item_identity_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_item_identity_barcode ON public.catalog_item_identity USING btree (barcode) WHERE (barcode IS NOT NULL);


--
-- Name: idx_catalog_item_identity_juno_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_item_identity_juno_id ON public.catalog_item_identity USING btree (juno_id) WHERE (juno_id IS NOT NULL);


--
-- Name: idx_catalog_item_raw_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_item_raw_barcode ON public.catalog_item_raw USING btree (barcode) WHERE (barcode IS NOT NULL);


--
-- Name: idx_catalog_item_raw_genre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_item_raw_genre ON public.catalog_item_raw USING btree (genre) WHERE (genre IS NOT NULL);


--
-- Name: idx_catalog_item_raw_identity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_item_raw_identity_id ON public.catalog_item_raw USING btree (identity_id) WHERE (identity_id IS NOT NULL);


--
-- Name: idx_catalog_item_raw_juno_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_item_raw_juno_id ON public.catalog_item_raw USING btree (juno_id) WHERE (juno_id IS NOT NULL);


--
-- Name: idx_catalog_snapshot_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_snapshot_created_at ON public.catalog_snapshot USING btree (created_at DESC);


--
-- Name: idx_catalog_snapshot_kind_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_snapshot_kind_date ON public.catalog_snapshot USING btree (catalog_kind, catalog_date DESC);


--
-- Name: idx_catalog_snapshot_supplier_content_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_catalog_snapshot_supplier_content_hash_unique ON public.catalog_snapshot USING btree (supplier_id, content_hash);


--
-- Name: idx_email_adapter_active_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_adapter_active_priority ON public.email_adapter USING btree (is_active, priority, created_at);


--
-- Name: idx_juno_live_lookup_job_active_juno_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_juno_live_lookup_job_active_juno_id ON public.juno_live_lookup_job USING btree (juno_id) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: idx_juno_live_lookup_job_juno_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juno_live_lookup_job_juno_id ON public.juno_live_lookup_job USING btree (juno_id);


--
-- Name: idx_juno_live_lookup_job_status_not_before; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juno_live_lookup_job_status_not_before ON public.juno_live_lookup_job USING btree (status, not_before, priority DESC, created_at);


--
-- Name: idx_juno_live_lookup_run_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juno_live_lookup_run_started_at ON public.juno_live_lookup_run USING btree (started_at DESC);


--
-- Name: idx_juno_live_observation_identity_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juno_live_observation_identity_observed_at ON public.juno_live_observation USING btree (identity_id, observed_at DESC) WHERE (identity_id IS NOT NULL);


--
-- Name: idx_juno_live_observation_juno_observed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juno_live_observation_juno_observed ON public.juno_live_observation USING btree (juno_id, observed_at DESC);


--
-- Name: idx_juno_live_observation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juno_live_observation_status ON public.juno_live_observation USING btree (status, observed_at DESC);


--
-- Name: idx_mail_attachment_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_attachment_sha256 ON public.mail_attachment USING btree (sha256);


--
-- Name: idx_mail_connection_active_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_connection_active_provider ON public.mail_connection USING btree (is_active, provider, created_at);


--
-- Name: idx_mail_mailbox_source_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_mailbox_source_active ON public.mail_mailbox_source USING btree (is_active, connection_id, created_at);


--
-- Name: idx_mail_message_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_message_received_at ON public.mail_message USING btree (received_at DESC);


--
-- Name: idx_mail_message_rfc822; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mail_message_rfc822 ON public.mail_message USING btree (rfc822_message_id) WHERE (rfc822_message_id IS NOT NULL);


--
-- Name: idx_notification_channel_enabled_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_channel_enabled_type ON public.notification_channel USING btree (enabled, type);


--
-- Name: idx_notification_delivery_digest_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_digest_key ON public.notification_delivery USING btree (digest_key) WHERE (digest_key IS NOT NULL);


--
-- Name: idx_notification_delivery_rule_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_rule_channel ON public.notification_delivery USING btree (rule_id, channel_id, queued_at DESC);


--
-- Name: idx_notification_delivery_signal_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_signal_event ON public.notification_delivery USING btree (signal_event_id) WHERE (signal_event_id IS NOT NULL);


--
-- Name: idx_notification_delivery_status_queued; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_delivery_status_queued ON public.notification_delivery USING btree (status, queued_at);


--
-- Name: idx_notification_rule_channel_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_rule_channel_enabled ON public.notification_rule USING btree (channel_id, enabled);


--
-- Name: idx_service_log_event_component; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_log_event_component ON public.service_log_event USING btree (component, occurred_at DESC);


--
-- Name: idx_service_log_event_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_log_event_correlation ON public.service_log_event USING btree (correlation_id, occurred_at DESC) WHERE (correlation_id IS NOT NULL);


--
-- Name: idx_service_log_event_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_log_event_job ON public.service_log_event USING btree (job_id, occurred_at DESC) WHERE (job_id IS NOT NULL);


--
-- Name: idx_service_log_event_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_log_event_run ON public.service_log_event USING btree (run_id, occurred_at DESC) WHERE (run_id IS NOT NULL);


--
-- Name: idx_signal_event_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signal_event_created_at ON public.signal_event USING btree (created_at DESC);


--
-- Name: idx_signal_event_event_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_signal_event_event_key ON public.signal_event USING btree (event_key) WHERE (event_key IS NOT NULL);


--
-- Name: idx_signal_event_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signal_event_identity ON public.signal_event USING btree (identity_id, created_at DESC);


--
-- Name: idx_signal_event_type_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_signal_event_type_item ON public.signal_event USING btree (type, catalog_item_raw_id) WHERE (catalog_item_raw_id IS NOT NULL);


--
-- Name: idx_watch_match_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watch_match_identity ON public.watch_match USING btree (identity_id, created_at DESC);


--
-- Name: idx_watch_match_rule_item_field; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_watch_match_rule_item_field ON public.watch_match USING btree (watch_rule_id, catalog_item_raw_id, matched_field) WHERE (catalog_item_raw_id IS NOT NULL);


--
-- Name: idx_watch_rule_enabled_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watch_rule_enabled_type ON public.watch_rule USING btree (enabled, type, pattern_norm);


--
-- Name: auth_account auth_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT auth_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: auth_session auth_session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: auth_sso_admin_rule auth_sso_admin_rule_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sso_admin_rule
    ADD CONSTRAINT auth_sso_admin_rule_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.auth_sso_provider(id) ON DELETE CASCADE;


--
-- Name: catalog_item_identity catalog_item_identity_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_identity
    ADD CONSTRAINT catalog_item_identity_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(id) ON DELETE CASCADE;


--
-- Name: catalog_item_raw catalog_item_raw_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_raw
    ADD CONSTRAINT catalog_item_raw_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.catalog_item_identity(id) ON DELETE SET NULL;


--
-- Name: catalog_item_raw catalog_item_raw_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_raw
    ADD CONSTRAINT catalog_item_raw_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.catalog_snapshot(id) ON DELETE CASCADE;


--
-- Name: catalog_snapshot catalog_snapshot_source_attachment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_snapshot
    ADD CONSTRAINT catalog_snapshot_source_attachment_id_fkey FOREIGN KEY (source_attachment_id) REFERENCES public.mail_attachment(id);


--
-- Name: catalog_snapshot catalog_snapshot_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_snapshot
    ADD CONSTRAINT catalog_snapshot_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(id);


--
-- Name: juno_live_lookup_job juno_live_lookup_job_catalog_item_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_lookup_job
    ADD CONSTRAINT juno_live_lookup_job_catalog_item_raw_id_fkey FOREIGN KEY (catalog_item_raw_id) REFERENCES public.catalog_item_raw(id) ON DELETE SET NULL;


--
-- Name: juno_live_observation juno_live_observation_catalog_item_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_observation
    ADD CONSTRAINT juno_live_observation_catalog_item_raw_id_fkey FOREIGN KEY (catalog_item_raw_id) REFERENCES public.catalog_item_raw(id) ON DELETE SET NULL;


--
-- Name: juno_live_observation juno_live_observation_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_observation
    ADD CONSTRAINT juno_live_observation_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.catalog_item_identity(id) ON DELETE SET NULL;


--
-- Name: juno_live_observation juno_live_observation_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_observation
    ADD CONSTRAINT juno_live_observation_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.juno_live_lookup_job(id) ON DELETE SET NULL;


--
-- Name: juno_live_observation juno_live_observation_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juno_live_observation
    ADD CONSTRAINT juno_live_observation_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.juno_live_lookup_run(id) ON DELETE SET NULL;


--
-- Name: mail_attachment mail_attachment_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_attachment
    ADD CONSTRAINT mail_attachment_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.mail_message(id) ON DELETE CASCADE;


--
-- Name: mail_mailbox_ingest_state mail_mailbox_ingest_state_last_ingested_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_mailbox_ingest_state
    ADD CONSTRAINT mail_mailbox_ingest_state_last_ingested_snapshot_id_fkey FOREIGN KEY (last_ingested_snapshot_id) REFERENCES public.catalog_snapshot(id) ON DELETE SET NULL;


--
-- Name: mail_mailbox_ingest_state mail_mailbox_ingest_state_mailbox_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_mailbox_ingest_state
    ADD CONSTRAINT mail_mailbox_ingest_state_mailbox_source_id_fkey FOREIGN KEY (mailbox_source_id) REFERENCES public.mail_mailbox_source(id) ON DELETE CASCADE;


--
-- Name: mail_mailbox_source mail_mailbox_source_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_mailbox_source
    ADD CONSTRAINT mail_mailbox_source_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.mail_connection(id) ON DELETE CASCADE;


--
-- Name: mail_message mail_message_mailbox_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_message
    ADD CONSTRAINT mail_message_mailbox_source_id_fkey FOREIGN KEY (mailbox_source_id) REFERENCES public.mail_mailbox_source(id) ON DELETE RESTRICT;


--
-- Name: notification_delivery notification_delivery_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.notification_channel(id) ON DELETE SET NULL;


--
-- Name: notification_delivery notification_delivery_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.notification_rule(id) ON DELETE SET NULL;


--
-- Name: notification_delivery notification_delivery_signal_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_signal_event_id_fkey FOREIGN KEY (signal_event_id) REFERENCES public.signal_event(id) ON DELETE CASCADE;


--
-- Name: notification_rule notification_rule_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rule
    ADD CONSTRAINT notification_rule_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.notification_channel(id) ON DELETE CASCADE;


--
-- Name: signal_event signal_event_catalog_item_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_event
    ADD CONSTRAINT signal_event_catalog_item_raw_id_fkey FOREIGN KEY (catalog_item_raw_id) REFERENCES public.catalog_item_raw(id) ON DELETE CASCADE;


--
-- Name: signal_event signal_event_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_event
    ADD CONSTRAINT signal_event_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.catalog_item_identity(id) ON DELETE CASCADE;


--
-- Name: watch_match watch_match_catalog_item_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_match
    ADD CONSTRAINT watch_match_catalog_item_raw_id_fkey FOREIGN KEY (catalog_item_raw_id) REFERENCES public.catalog_item_raw(id) ON DELETE CASCADE;


--
-- Name: watch_match watch_match_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_match
    ADD CONSTRAINT watch_match_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.catalog_item_identity(id) ON DELETE CASCADE;


--
-- Name: watch_match watch_match_watch_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_match
    ADD CONSTRAINT watch_match_watch_rule_id_fkey FOREIGN KEY (watch_rule_id) REFERENCES public.watch_rule(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict junoWholesaleOpsSchemaDump
