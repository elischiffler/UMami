# UMami database and photo recovery rehearsal

Status: **PROPOSED**. No live bytes have been exported, no target project or
bucket has been created, and the weekly AWS scraper scheduler remains stopped.
This procedure needs owner approval of the exact data copy and destination.

## Source inventory and why a database snapshot is incomplete

Read-only inspection of managed Supabase project `yxuclucskxbqrgjhbzou` on
2026-09-27 found public `profile-photos` (12 object records, 18,399,045 metadata
bytes) and `review-photos` (64 records, 63,912,880 metadata bytes): 76 objects
and 82,311,925 metadata bytes total. Metadata size is not a byte checksum.
Supabase database backups include `storage.buckets` and `storage.objects`
metadata but exclude the object bytes. A restore that recreates only database
rows leaves broken photo URLs. The source project is active and not disposable.

## Concrete one-time rehearsal proposal

- Export one protected logical database copy and all actual bytes from the two
  named Storage buckets, with a manifest of bucket, object path, size, SHA-256,
  and content type. Verify the manifest has exactly the inventory observed at
  export time; the historical 76 count is only a drift indicator. Never log
  object paths or user data in public CI/logs.
- Destination: private S3 Standard bucket
  `s3://elischiffler-umami-backups-us-west-1/rehearsal-2026-09/` in the host
  AWS account/region, if the name is available. Block all public access, use
  default SSE-S3, TLS-only policy, and a scoped IAM role without public URLs.
  Retain the one-time rehearsal set for 30 days, then expire it by lifecycle.
  At the current ~82.3 MB photo size, even a conservative $0.05/GB-month
  allowance is under $0.01 for a single 30-day copy; requests and Supabase
  egress can add cost. Confirm the live provider quotes and quotas before
  creation/export; ask again if the expected total exceeds $1. No hard usage
  cap is implied.
- Restore to a newly approved isolated Supabase target, never the source. The
  two buckets must exist with reviewed public/private flags and policies. Copy
  database schema/data and Storage bytes in the provider-supported sequence;
  reconcile metadata/object keys without overwriting source. Download each
  target object and compare SHA-256 with the exported manifest, then check the
  76-at-snapshot keys/bytes and app photo URLs. Count matching alone is not
  sufficient. Keep source and restore identities distinct in evidence.

Supabase CLI 2.118.0 exposes `storage cp --recursive` for project-scoped object
downloads/uploads and `db dump` for logical database export. Inspect current
`--help` before execution. Use protected service credentials and an external
private staging directory; never pass a database password in a command line or
commit copied bytes. The exact copy/restore commands must be reviewed against
the approved target and current CLI before the live export begins.

## Acceptance after restore

1. In the isolated target, create or designate two test Auth users. Test owner
   vs other-user reads and writes through the real app/API for reviews, follows,
   notifications, helpful votes, and profile/review photo upload and delete.
   Record RLS/policy state. The AWS API ownership work in fork PR #8 is still a
   separate draft and must be included in the tested app/API revision before
   claiming those API checks pass; it does not resolve direct Supabase Data API
   access. The four-table RLS-disabled public-role exposure described in issue
   #7 is temporarily accepted only through 2026-10-04. That exception does not
   prove ownership or Storage security, and these gates remain blocked until
   the isolated-target checks pass.
2. Run the real restaurant and menu scraper against the approved isolated
   destination, then rerun both. Assert stable restaurant/menu keys and counts,
   no duplicate rows, worker success state, and recovery after an interrupted
   run. Fixtures alone do not meet this gate. Keep the live AWS Monday worker
   scheduler stopped until this passes and the actual destination is reviewed.
3. Verify database plus Storage restoration in a fresh app process, including
   byte hashes and public/private URL behavior. Record source/target refs,
   commit SHA, object manifest hash, exact counts, and any failed objects.

The smallest owner decisions are the named S3 destination/access/30-day
retention and explicit permission to read/export the active project's object
bytes, plus the isolated Supabase target and two test users. This document does
not authorize a live export or a scraper write.

References: [Supabase database backups](https://supabase.com/docs/guides/platform/backups),
[Storage object downloads](https://supabase.com/docs/guides/storage/management/download-objects),
[AWS S3 pricing](https://aws.amazon.com/s3/pricing/).
