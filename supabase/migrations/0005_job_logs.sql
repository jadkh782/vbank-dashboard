-- Robot logs for faulted runs. REFramework processes end with a generic summary
-- ("All transaction items failed", "Initialization failed 3 times …") and the
-- real cause is only in the robot log. The worker stores the Error/Fatal lines
-- of a faulted job and the first specific one as `cause`; info_norm/family_key
-- are then derived from the cause instead of the summary.
alter table public.jobs
  add column if not exists log_lines jsonb,
  add column if not exists cause text,
  add column if not exists log_fetched_at timestamptz;

comment on column public.jobs.log_lines is 'Error/Fatal robot log lines [{t, level, message}], capped; [] = nothing left in Orchestrator';
comment on column public.jobs.cause is 'First specific Error/Fatal log message; null when the job Info is already specific';
