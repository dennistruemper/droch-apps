# Availability email notifications

Anna and Bob are admins. Charlie and Dave are team members. All G1–G5 answers
start unanswered. All players' changes form one batch for this team.

| Time  | Charlie         | Dave            |
| ----- | --------------- | --------------- |
| 14:00 | G1 → Ja         | G5 → Nein       |
| 14:01 | G3 → Ja         | —               |
| 14:02 | G2 → Nein       | G2 → Vielleicht |
| 14:03 | G5 → Vielleicht | G4 → Ja         |
| 14:04 | G4 → Ja         | G1 → Ja         |
| 14:05 | G1 → Vielleicht | —               |
| 14:06 | —               | G3 → Nein       |

At 14:10 nothing is sent: Dave's last edit at 14:06 restarted the team-wide
five-minute quiet period. At 14:11 Anna and Bob each receive one combined email:

```text
TT 4: Verfügbarkeit aktualisiert

Charlie
G1: Vielleicht · G2: Nein · G3: Ja · G4: Ja · G5: Vielleicht

Dave
G1: Ja · G2: Vielleicht · G3: Nein · G4: Ja · G5: Nein
```

Two emails total, one per admin. Each match entry includes its date/start time
and previous/final answer, followed by a link to Kunludo. Charlie's intermediate
G1 Ja does not get its own email. Any team member's actual availability change
restarts the timer, but changes in another team do not postpone this digest.

If Anna changes Charlie's response herself, Bob receives it with Anna identified
as the person who changed the answer. Anna receives no email for her own edit.
Repeated identical answers and replayed commands neither create notifications nor
reset the quiet period. Reverted edits disappear from an unsent summary.

## Persistence and delivery

`mail_queue` in `kunludo.sqlite` holds app-owned per-team/admin deliveries.
Answer changes and queue updates commit together. No Mailtrap request runs inside
the command transaction. Admin email addresses are resolved only on the server via
shared auth, never copied into snapshots or the queue.

A 15-second worker poll processes batches due five minutes after the latest actual
availability change by anyone in the team. Entries are grouped by player in the email. Pending groups coalesce; claimed groups use a one-minute recoverable lease.
A successful delivery deletes only its claimed row, preserving later edits. Failed
and newer pending summaries coalesce before another attempt and honor the later
quiet period/backoff. Retries use exponential delays from one minute up to one hour;
eight failed attempts leave a `failed` row for operator inspection. Successful
recipients are not retried because another recipient failed.

Before sending, recheck current admin/member access, current game revision, final
answer, cancellation and future start. Removed/demoted admins, removed players,
cancelled/rescheduled matches and superseded changes are suppressed. Membership
and account data are read through their owning modules; no auth database attachment.

Startup resumes overdue rows; expired sending leases recover interrupted deliveries.
Graceful shutdown cancels and awaits in-flight mail before databases close. Local
auth mode uses the existing no-op mail sender even with a token; preview/production
use the same configured Mailtrap sender as auth.

Delivery is at least once: a crash after the provider accepts a mail but before the
success is recorded can cause a duplicate. The current transport has no provider
idempotency key or delivery acknowledgement reconciliation. The queue guarantees
persistent intent and safe ordinary command/worker retries, not exactly-once delivery.
