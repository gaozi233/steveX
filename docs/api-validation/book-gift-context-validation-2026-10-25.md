# Book Gift and Repeated Inventory Queries

Date: 2026-10-25. Minecraft Java 1.21.11, existing local test world,
Map-A with DeepSeek (`deepseek-v4-flash`), Web single-step execution controlled
by the human tester. This records an existing run, not a fresh model experiment.
Documentation only: no Brain, prompt, API or service changes, no new model calls.

## Task and Observed Outcome

Goal: write a personal message in a book, then drop it to the nearest player.
The task snapshot was paused with reason `single_step` after 31 model calls.
This count includes preparation and intermediate actions, not 31 successful tests.
Continue permits the next model decision; it does not instruct it to repeat a query.

| Stage | Actual evidence | Result and boundary |
| --- | --- | --- |
| Equip book | `equip slot 44 hand`; inventory snapshot confirmation | Writable book equipped |
| Initial right clicks | Two `right click hand` calls targeted the previously aimed oak button; block-state changes confirmed | Button presses, not book opening; no false book-open report |
| Open editor | `look at 22 200 115` returned no crosshair hit, then `right click hand` returned `route:book-ui`, writable, zero pages | Local book editor established; not a server container window |
| Write pages | Steps 21/22 used `book write 1 ...` and `book write 2 ...` | Draft changes only, `confirmed:false` until saving |
| Save | Step 23 `book done`: `saved:true`, `confirmed:true`, exact pages confirmed by server inventory update | Both pages saved; editor closed |
| Locate recipient | Step 27 `findplayer`, step 28 `goto 24 101 115`, step 30 precise look hit the human player entity | Agent approached and faced the recipient |
| Drop | Step 31 `drop writable_book`: requested one book from slot 44, inventory delta -1, server inventory snapshot evidence | Carried loss confirmed; not proof of a particular player's pickup |
| Content check | Drop feedback retained the two saved page components; human screenshot displayed page 1 of 2 matching the first message | Written content and two-page structure corroborated; screenshot alone is not a pickup-attribution trace |

The first page greets the human recipient and says this is a gift book; the second
wishes them a pleasant and safe adventure. Personal player identifiers and raw
runtime logs are not reproduced here. The writable book was not signed; signed-book
coverage is unchanged. This is one successful real workflow, not a success-rate claim.

## Three Inventory Queries: Input/Output Audit

The actual stored request messages, model responses and API call records were
joined by request ID. These are three distinct model requests, not a duplicate
HTTP response or one command accidentally executed three times.

| Step | Evidence already in model input | Model output |
| --- | --- | --- |
| 24 | Exact successful `book done`; no recent inventory query | `inventory` |
| 25 | Same save confirmation plus step 24's complete inventory result, including selected writable book | `inventory` |
| 26 | Save confirmation plus both preceding inventory results | `inventory` |
| 27 | Save confirmation plus all three inventory results | `findplayer ...` |

Verified observations:

- Goal unchanged and present in all three inputs; no user follow-up text added.
- Each request contained `system` and `user`; the system text was identical.
- Relevant input records were not truncated. History still contained the save
  confirmation and accumulated query results; they were not evicted.
- The three API inventory results were identical and successful, showing one
  selected writable book with `special-data`. No intervening action appears
  between these three calls.
- `drop` was discoverable in each supplied command catalog. The model was not
  blocked by missing tool visibility.
- Prompt token counts for steps 24/25/26 were 4904/5007/5086. Inputs changed as
  results accumulated; prompt-cache hits are not replay of an old model answer.
- Inventory summary intentionally omits page text. Repeating the same summary
  does not verify book contents; saving had already supplied exact-page evidence.

## Interpretation, Not a Proven Causal Diagnosis

The first inventory query is a reasonable post-save check. The next two gathered
no new information in this run: the model reselected a query despite having its
previous results. There is no evidence here of missing API feedback, input overflow
or a failed save. Continue explains why another decision was requested, not why
the model chose `inventory` again.

Possible contributors include the flat recent-history format, absence of an
explicit progress/workspace record, and caution encouraged by the existing
historical-observation warning. These are hypotheses, not established causes.
The recorded output is a command, not a decision rationale; the model's private
reasoning cannot be inferred with certainty. A desire to inspect book details is
also only a hypothesis, not an observed explanation.

Do not add a book-specific plan, auto-drop policy, inventory-query ban or a Brain
patch on the strength of this run. Record the phenomenon as general evidence-use
and progress-maintenance behavior; any causal improvement claim needs a separate
controlled experiment. Manual task pauses are not autonomous stalls or proof of
failure to finish. Current API acceptance and model action efficiency are separate.

## Remaining Coverage

Recipient-specific pickup confirmation, signed books, long/filtered text,
disconnect during save, concurrent item replacement, and cross-agent interference
remain outside this workflow's acceptance. Earlier coverage is retained in
[Chat and book validation](chat-book-validation.md).
