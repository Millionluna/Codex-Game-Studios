-- Owned LOCAL PG16 guard before exercising the unchanged migration candidate.
-- No remote installation: guard requires the private Unix-only test cluster.
-- Permanent metadata within the disposable cluster proves cross-connection
-- tombstones; neither a password nor its SCRAM verifier is stored in this table.
begin;
do $guard$
begin
  if current_user <> 'status_test_bootstrap' or session_user <> 'status_test_bootstrap'
    or current_database() <> 'postgres'
    or current_setting('server_version_num')::int / 10000 <> 16
    or current_setting('cluster_name') <> 'careslink-job-status-local-pg16'
    or current_setting('listen_addresses') <> '' or inet_server_addr() is not null
    or current_setting('unix_socket_permissions') <> '0700'
    or current_setting('unix_socket_directories') !~ '^/private/tmp/cl-job-status-[a-zA-Z0-9]{6}/socket$'
  then raise exception 'LOCAL_ISSUER_TARGET_DENIED'; end if;
end $guard$;
commit;
