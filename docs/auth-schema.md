# Supabase auth schema

Supabase's own `auth` schema — GoTrue's tables, not yours. You do not migrate
them and you should not write to them; they are drawn here because everything in
[`database-schema.md`](./database-schema.md) hangs off `auth.users`, and that
diagram carries it as a one-column stub.

Twenty-seven tables. Too many for one picture, so: a map first, then each
cluster with its columns.

**Where this came from.** Columns, types and nullability are from the schema
dump. The foreign keys are not — the dump carries none, so they were read from
the live database (`pg_constraint`, project `alined-3d-sketch`) with
[the query at the bottom](#the-query-that-produced-the-edges). All twenty-four
are drawn solid. Dashed lines are links that exist in name only: a column that
points at another table with nothing enforcing it.

## The whole schema

```mermaid
erDiagram
    users ||--o{ identities : "user_id"
    users ||--o{ sessions : "user_id"
    users ||--o{ one_time_tokens : "user_id"
    users ||--o{ mfa_factors : "user_id"
    users ||--o| mfa_recovery_code_sets : "user_id"
    users ||--o{ webauthn_credentials : "user_id"
    users ||--o{ webauthn_challenges : "user_id"
    users ||--o{ oauth_authorizations : "user_id"
    users ||--o{ oauth_consents : "user_id"
    users ||--o{ scim_users : "user_id, SET NULL"

    sessions ||--o{ refresh_tokens : "session_id"
    sessions ||--o{ mfa_amr_claims : "session_id"

    mfa_factors ||--o{ mfa_challenges : "factor_id"
    mfa_factors ||--o| mfa_recovery_code_sets : "mfa_factor_id"
    mfa_recovery_code_sets ||--o{ mfa_recovery_codes : "set_id"

    oauth_clients ||--o{ oauth_authorizations : "client_id"
    oauth_clients ||--o{ oauth_consents : "client_id"
    oauth_clients ||--o{ sessions : "oauth_client_id"

    sso_providers ||--o{ sso_domains : "sso_provider_id"
    sso_providers ||--o{ saml_providers : "sso_provider_id"
    sso_providers ||--o{ saml_relay_states : "sso_provider_id"
    sso_providers ||--o{ scim_users : "sso_provider_id"
    sso_providers ||--o{ scim_tokens : "sso_provider_id"
    flow_state ||--o{ saml_relay_states : "flow_state_id"

    users ||..o{ refresh_tokens : "user_id is varchar, no FK"
    users ||..o{ flow_state : "user_id, no FK"
    oauth_client_states ||..o{ flow_state : "oauth_client_state_id, no FK"
    instances ||..o{ users : "instance_id, no FK"
    instances ||..o{ audit_log_entries : "instance_id, no FK"

    custom_oauth_providers {
        uuid id PK "standalone, no FK either way"
    }
    schema_migrations {
        varchar version PK "standalone"
    }
```

## Identity and session

```mermaid
erDiagram
    users {
        uuid instance_id "nullable, no FK"
        uuid id PK
        varchar aud "nullable"
        varchar role "nullable"
        varchar email "nullable"
        varchar encrypted_password "nullable"
        timestamptz email_confirmed_at "nullable"
        timestamptz invited_at "nullable"
        varchar confirmation_token "nullable"
        timestamptz confirmation_sent_at "nullable"
        varchar recovery_token "nullable"
        timestamptz recovery_sent_at "nullable"
        varchar email_change_token_new "nullable"
        varchar email_change "nullable"
        timestamptz email_change_sent_at "nullable"
        timestamptz last_sign_in_at "nullable"
        jsonb raw_app_meta_data "nullable, server-writable only"
        jsonb raw_user_meta_data "nullable, user-writable"
        bool is_super_admin "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        text phone UK "nullable"
        timestamptz phone_confirmed_at "nullable"
        text phone_change "nullable"
        varchar phone_change_token "nullable"
        timestamptz phone_change_sent_at "nullable"
        timestamptz confirmed_at "generated, LEAST of email and phone confirmed_at"
        varchar email_change_token_current "nullable"
        int2 email_change_confirm_status "nullable"
        timestamptz banned_until "nullable"
        varchar reauthentication_token "nullable"
        timestamptz reauthentication_sent_at "nullable"
        bool is_sso_user "not null"
        timestamptz deleted_at "nullable, soft delete"
        bool is_anonymous "not null"
    }

    identities {
        uuid id PK
        text provider_id
        uuid user_id FK
        jsonb identity_data
        text provider
        timestamptz last_sign_in_at "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        text email "nullable, generated from identity_data"
    }

    sessions {
        uuid id PK
        uuid user_id FK
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        uuid factor_id "nullable, no FK"
        aal_level aal "nullable"
        timestamptz not_after "nullable"
        timestamp refreshed_at "nullable, NO time zone"
        text user_agent "nullable"
        inet ip "nullable"
        text tag "nullable"
        uuid oauth_client_id FK "nullable"
        text refresh_token_hmac_key "nullable"
        int8 refresh_token_counter "nullable"
        text scopes "nullable"
    }

    refresh_tokens {
        int8 id PK "bigint, not uuid"
        uuid instance_id "nullable, no FK"
        varchar token UK "nullable"
        varchar user_id "nullable, VARCHAR 255, no FK"
        bool revoked "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        varchar parent "nullable, previous token in the chain"
        uuid session_id FK "nullable"
    }

    one_time_tokens {
        uuid id PK
        uuid user_id FK
        one_time_token_type token_type
        text token_hash
        text relates_to
        timestamp created_at "NO time zone"
        timestamp updated_at "NO time zone"
        timestamptz expires_at "nullable"
    }

    users ||--o{ identities : "cascade"
    users ||--o{ sessions : "cascade"
    users ||--o{ one_time_tokens : "cascade"
    sessions ||--o{ refresh_tokens : "cascade"
    users ||..o{ refresh_tokens : "user_id is varchar, no FK"
```

## Multi-factor

```mermaid
erDiagram
    mfa_factors {
        uuid id PK
        uuid user_id FK
        text friendly_name "nullable"
        factor_type factor_type
        factor_status status
        timestamptz created_at
        timestamptz updated_at
        text secret "nullable, TOTP seed"
        text phone "nullable"
        timestamptz last_challenged_at UK "nullable, unique"
        jsonb web_authn_credential "nullable, superseded"
        uuid web_authn_aaguid "nullable, superseded"
        jsonb last_webauthn_challenge_data "nullable, superseded"
    }

    mfa_challenges {
        uuid id PK
        uuid factor_id FK
        timestamptz created_at
        timestamptz verified_at "nullable"
        inet ip_address
        text otp_code "nullable"
        jsonb web_authn_session_data "nullable"
    }

    mfa_amr_claims {
        uuid id PK
        uuid session_id FK
        timestamptz created_at
        timestamptz updated_at
        text authentication_method
    }

    mfa_recovery_code_sets {
        uuid id PK
        uuid user_id FK,UK
        uuid mfa_factor_id FK,UK
        int4 failed_verification_count
        timestamptz verification_locked_until "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    mfa_recovery_codes {
        uuid id PK
        uuid mfa_recovery_code_set_id FK
        text code_hash
        timestamptz consumed_at "nullable"
        timestamptz created_at
    }

    webauthn_credentials {
        uuid id PK
        uuid user_id FK
        bytea credential_id
        bytea public_key
        text attestation_type
        uuid aaguid "nullable"
        int8 sign_count
        jsonb transports
        bool backup_eligible
        bool backed_up
        text friendly_name
        timestamptz created_at
        timestamptz updated_at
        timestamptz last_used_at "nullable"
    }

    webauthn_challenges {
        uuid id PK
        uuid user_id FK "nullable"
        text challenge_type
        jsonb session_data
        timestamptz created_at
        timestamptz expires_at
    }

    sessions {
        uuid id PK
    }
    users {
        uuid id PK
    }

    users ||--o{ mfa_factors : "cascade"
    mfa_factors ||--o{ mfa_challenges : "cascade"
    users ||--o| mfa_recovery_code_sets : "cascade, one per user"
    mfa_factors ||--o| mfa_recovery_code_sets : "cascade, one per factor"
    mfa_recovery_code_sets ||--o{ mfa_recovery_codes : "cascade"
    users ||--o{ webauthn_credentials : "cascade"
    users ||--o{ webauthn_challenges : "cascade"
    sessions ||--o{ mfa_amr_claims : "cascade"
```

## Login flows and OAuth

```mermaid
erDiagram
    flow_state {
        uuid id PK
        uuid user_id "nullable, NO FK"
        text auth_code "nullable"
        code_challenge_method code_challenge_method "nullable"
        text code_challenge "nullable"
        text provider_type
        text provider_access_token "nullable"
        text provider_refresh_token "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        text authentication_method
        timestamptz auth_code_issued_at "nullable"
        text invite_token "nullable"
        text referrer "nullable"
        uuid oauth_client_state_id "nullable, NO FK"
        uuid linking_target_id "nullable, NO FK"
        bool email_optional
    }

    oauth_clients {
        uuid id PK
        text client_secret_hash "nullable"
        oauth_registration_type registration_type
        text redirect_uris
        text grant_types
        text client_name "nullable"
        text client_uri "nullable"
        text logo_uri "nullable"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "nullable, soft delete"
        oauth_client_type client_type
        text token_endpoint_auth_method
    }

    oauth_authorizations {
        uuid id PK
        text authorization_id UK
        uuid client_id FK
        uuid user_id FK "nullable"
        text redirect_uri
        text scope
        text state "nullable"
        text resource "nullable"
        text code_challenge "nullable"
        code_challenge_method code_challenge_method "nullable"
        oauth_response_type response_type
        oauth_authorization_status status
        text authorization_code UK "nullable"
        timestamptz created_at
        timestamptz expires_at
        timestamptz approved_at "nullable"
        text nonce "nullable"
    }

    oauth_consents {
        uuid id PK
        uuid user_id FK
        uuid client_id FK
        text scopes
        timestamptz granted_at
        timestamptz revoked_at "nullable"
    }

    oauth_client_states {
        uuid id PK
        text provider_type
        text code_verifier "nullable"
        timestamptz created_at
    }

    custom_oauth_providers {
        uuid id PK
        text provider_type
        text identifier UK
        text name
        text client_id
        text client_secret
        text[] acceptable_client_ids
        text[] scopes
        bool pkce_enabled
        jsonb attribute_mapping
        jsonb authorization_params
        bool enabled
        bool email_optional
        text issuer "nullable"
        text discovery_url "nullable"
        bool skip_nonce_check
        jsonb cached_discovery "nullable"
        timestamptz discovery_cached_at "nullable"
        text authorization_url "nullable"
        text token_url "nullable"
        text userinfo_url "nullable"
        text jwks_uri "nullable"
        timestamptz created_at
        timestamptz updated_at
        text[] custom_claims_allowlist
    }

    users {
        uuid id PK
    }
    sessions {
        uuid id PK
    }

    oauth_clients ||--o{ oauth_authorizations : "cascade"
    oauth_clients ||--o{ oauth_consents : "cascade"
    oauth_clients ||--o{ sessions : "cascade"
    users ||--o{ oauth_authorizations : "cascade"
    users ||--o{ oauth_consents : "cascade"
    users ||..o{ flow_state : "user_id, linking_target_id, no FK"
    oauth_client_states ||..o{ flow_state : "no FK"
```

## Enterprise SSO and SCIM

```mermaid
erDiagram
    sso_providers {
        uuid id PK
        text resource_id "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        bool disabled "nullable"
    }

    sso_domains {
        uuid id PK
        uuid sso_provider_id FK
        text domain
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
    }

    saml_providers {
        uuid id PK
        uuid sso_provider_id FK
        text entity_id UK
        text metadata_xml
        text metadata_url "nullable"
        jsonb attribute_mapping "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        text name_id_format "nullable"
    }

    saml_relay_states {
        uuid id PK
        uuid sso_provider_id FK
        text request_id
        text for_email "nullable"
        text redirect_to "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
        uuid flow_state_id FK "nullable"
    }

    scim_users {
        uuid id PK
        uuid sso_provider_id FK
        uuid user_id FK "nullable, SET NULL on user delete"
        jsonb resource
        text user_name
        text external_id "nullable"
        bool active
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "nullable, soft delete"
    }

    scim_tokens {
        uuid id PK
        uuid sso_provider_id FK
        text token_hash
        text prefix
        timestamptz created_at
        timestamptz expires_at "nullable"
        timestamptz revoked_at "nullable"
        timestamptz last_used_at "nullable"
    }

    flow_state {
        uuid id PK
    }
    users {
        uuid id PK
    }

    sso_providers ||--o{ sso_domains : "cascade"
    sso_providers ||--o{ saml_providers : "cascade"
    sso_providers ||--o{ saml_relay_states : "cascade"
    sso_providers ||--o{ scim_users : "cascade"
    sso_providers ||--o{ scim_tokens : "cascade"
    flow_state ||--o{ saml_relay_states : "cascade"
    users ||--o{ scim_users : "SET NULL"
```

## Bookkeeping

Three tables with no foreign keys in either direction.

```mermaid
erDiagram
    instances {
        uuid id PK
        uuid uuid "nullable"
        text raw_base_config "nullable"
        timestamptz created_at "nullable"
        timestamptz updated_at "nullable"
    }

    audit_log_entries {
        uuid id PK
        uuid instance_id "nullable, no FK"
        json payload "nullable, json not jsonb"
        timestamptz created_at "nullable"
        varchar ip_address
    }

    schema_migrations {
        varchar version PK "GoTrue's own migration ledger"
    }
```

## Enums

| Type | Values |
|---|---|
| `aal_level` | `aal1`, `aal2`, `aal3` |
| `factor_type` | `totp`, `webauthn`, `phone`, `recovery_code` |
| `factor_status` | `unverified`, `verified` |
| `code_challenge_method` | `s256`, `plain` |
| `one_time_token_type` | `confirmation_token`, `reauthentication_token`, `recovery_token`, `email_change_token_new`, `email_change_token_current`, `phone_change_token` |
| `oauth_registration_type` | `dynamic`, `manual` |
| `oauth_authorization_status` | `pending`, `approved`, `denied`, `expired` |
| `oauth_response_type` | `code` |
| `oauth_client_type` | `public`, `confidential` |

## What the diagram cannot say

- **Deleting a user empties almost everything.** Twenty-three of the twenty-four
  foreign keys are `ON DELETE CASCADE`. The exception is `scim_users.user_id`,
  which is `SET NULL` — delete a user and their SCIM record stays, deactivated
  from the identity provider's side but still on the table with a null
  `user_id`. It is the only row in the schema that outlives its user by design.
- **`refresh_tokens.user_id` is `varchar(255)`, not `uuid`.** It holds the user id as
  text, so no foreign key is possible and none exists. Refresh tokens are still
  torn down with the user, but indirectly: `sessions` cascades from `users`, and
  `refresh_tokens` cascades from `sessions`. A token whose `session_id` is null
  is not reachable by that chain.
- **Three columns that look like foreign keys are not.** `flow_state.user_id`,
  `flow_state.oauth_client_state_id` and `flow_state.linking_target_id` all name
  another table and none is constrained — confirmed by their absence from
  `pg_constraint`. `sessions.factor_id` is the same. `flow_state` rows are
  short-lived and swept on a timer, so nothing cascades into them.
- **`instance_id` is a vestige.** It appears on `users`, `refresh_tokens` and
  `audit_log_entries`, always nullable and never constrained. It is left from
  GoTrue's multi-tenant days; on a single Supabase project `instances` is empty
  and the column stays null.
- **Two generations of WebAuthn.** `mfa_factors` still carries
  `web_authn_credential`, `web_authn_aaguid` and `last_webauthn_challenge_data`,
  while `webauthn_credentials` and `webauthn_challenges` hold the same thing
  properly. New passkeys land in the tables; the `mfa_factors` columns are
  legacy.
- **Timestamps are not uniformly timestamptz.** `sessions.refreshed_at` and both
  `one_time_tokens` timestamps are bare `timestamp`, with no time zone, in a
  schema that is otherwise `timestamptz` throughout.
- **`users.confirmed_at` is generated** — `LEAST(email_confirmed_at,
  phone_confirmed_at)`. Writes to it fail.
- **`users.deleted_at` and the soft deletes.** `users`, `oauth_clients` and
  `scim_users` each carry a `deleted_at`. A soft-deleted user is still a row, so
  the cascades above have not fired and their sessions may still exist.
- **`mfa_factors.last_challenged_at` is unique** — a unique constraint on a
  timestamp, which means no two factors anywhere in the project may record the
  exact same challenge instant.
- **`raw_app_meta_data` vs `raw_user_meta_data`.** The first is writable only
  server-side and is the safe place for roles or claims; the second is writable
  by the user through the client SDK and must never be trusted for
  authorization.

## The query that produced the edges

```sql
select
  c.conrelid::regclass::text as child,
  (select string_agg(a.attname, ',' order by k.ord)
     from unnest(c.conkey) with ordinality k(attnum, ord)
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as child_cols,
  c.confrelid::regclass::text as parent,
  (select string_agg(a.attname, ',' order by k.ord)
     from unnest(c.confkey) with ordinality k(attnum, ord)
     join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as parent_cols,
  case c.confdeltype
    when 'a' then 'no action' when 'c' then 'cascade' when 'n' then 'set null'
    when 'r' then 'restrict'  when 'd' then 'set default' end as on_delete
from pg_constraint c
where c.contype = 'f'
  and c.connamespace = 'auth'::regnamespace
order by parent, child;
```

Supabase upgrades this schema without asking. Re-run the query after an upgrade
and the edges above can be checked in one pass.
