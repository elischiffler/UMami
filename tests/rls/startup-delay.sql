-- Keep the temporary Unix-socket-only server alive during readiness checks.
select pg_sleep(2);
