-- pg_net is non-relocatable on this hosted project, so harden its actual net
-- schema instead of dropping and recreating the extension during rollout.
revoke all on schema net from public, anon, authenticated;
revoke execute on all functions in schema net from public, anon, authenticated;

