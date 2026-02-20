-- Drop removed accounting modules from existing databases.

begin;

drop table if exists public.journal_entry_lines cascade;
drop table if exists public.journal_entries cascade;
drop table if exists public.purchases_records cascade;
drop table if exists public.expenses_records cascade;
drop table if exists public.salary_records cascade;
drop table if exists public.advance_records cascade;
drop table if exists public.subcategories cascade;
drop table if exists public.chart_of_accounts cascade;

commit;
