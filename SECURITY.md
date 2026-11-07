# Security

Do not open GitHub issues containing passwords, Supabase secret/service role keys, authentication tokens, database connection strings containing credentials, or backups of private worlds. Store such values only in their intended secure locations.

The website is publicly readable, but user-generated world content must be protected by Supabase Authentication and RLS. Review `supabase/schema.sql` before production use. Keep the SQL functions and policies under version control; schema updates require a separate reviewed deployment to the database.

Do not treat a publishable Supabase key as an administrator credential. Never insert a `sb_secret_`, `service_role`, or database password into client-side source files. Report security bugs privately to the repository owner instead of submitting exploit details or credentials in public issues.
