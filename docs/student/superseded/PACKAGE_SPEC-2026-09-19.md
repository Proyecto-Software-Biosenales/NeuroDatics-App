> **SUPERSEDED 2026-09-20.** Withdrawn proposal kept for reference only; none of it is a requirement. Current plan: [../PLAN.md](../PLAN.md).

# NeuroDatics student package — proposed v1 contract

Status: **SUPERSEDED PROPOSAL — NOT AN IMPLEMENTATION CONTRACT**, 2026-09-19.
Companion documents: [PLAN.md](PLAN.md), [LEDGER.md](LEDGER.md).
The owner clarified that this is a simple local viewer for already-processed projects,
without accounts or a backend verification workflow. Mandatory signing/trusted issuers
and export-certification gates below are withdrawn requirements. The input format is
still a product question. Retain this earlier proposal only as background; do not
implement it or treat it as awaiting approval in its current form.

## Container and compatibility

One immutable project per ZIP-based `.ndpkg`. Files:

```text
manifest.json
signature.json                    # required under the proposed trusted-signature policy
project.json
data/<opaque-participant-id>.parquet
media/<opaque-media-id>.<allowed-extension>
```

Use ZIP STORE for already-compressed Parquet/media; allow STORE or DEFLATE for JSON.
No source ZIP/CSV, executable/script, pickle, SQL database dump, remote URL, or arbitrary
embedded HTML. IDs are package-local UUIDs; archive paths are ASCII, forward-slash
relative paths. Display text is UTF-8. Media types and Parquet contracts are validated
by the student importer, not inferred from filenames alone.

Container `format_version`, catalog `catalog_version`, scientific `analytics_contract`,
and producer app version are distinct. Initial readers accept only format 1/catalog 1
and explicitly supported scientific contracts. Reject v0/unknown future formats and
unsupported required features before extraction. An older app-created package with
supported contracts remains valid; do not reject merely because its producer is older.
No implicit migration/re-ingestion on the student. The teacher re-exports unsupported
packages. Schema evolution requires a reviewed compatibility fixture matrix.

## Manifest

T1 must supply a machine-readable schema and valid/invalid fixtures for these fields.
Unknown fields are rejected in v1; no unbounded arbitrary metadata extension map.

| Field | Type / rule |
| --- | --- |
| `format` | Literal `neurodatics-student`. |
| `format_version` | Integer `1`. |
| `package_id` | Random UUID for this immutable export; no teacher database ID. |
| `created_at` | UTC timestamp in RFC3339 `Z` form. Informational, not proof of freshness. |
| `producer` | Object: `app_version`, `source_revision`, `dependency_profile_sha256`; no machine paths or usernames. |
| `catalog_version` | Integer `1`. |
| `analytics_contract` | Literal `student-analytics-v1`, a new compatibility profile to freeze against the approved teacher baseline. |
| `required_features` | Unique list from a fixed registry; v1 proposal: `core-analytics-v1`, plus `video-preview-v1` when video bytes are included. |
| `privacy_profile` | Literal `classroom-pseudonymised-v1` under the proposed data policy. |
| `media_policy` | `included`, `omitted`, or `mixed`; must agree with every scenario's explicit media state. |
| `files` | Sorted list of `{path, kind, size_bytes, sha256}` for every payload file, including `project.json`. |
| `total_uncompressed_bytes` | Sum of payload sizes; also enforced independently while streaming. |
| `signing` | `{algorithm: "Ed25519", key_id: <trusted-key-id>}` under the proposed signing policy. |

`kind` is `catalog`, `participant_parquet`, `stimulus_image`, or `stimulus_video`.
SHA-256 values are 64 lowercase hex characters over exact uncompressed file bytes.
All paths, IDs and file references must be unique, and every reference must resolve.
There must be exactly one catalog entry and one whole-user Parquet per participant.
Directory entries are unnecessary. Extra/unlisted archive members are rejected.

The manifest and signature envelope are the only members excluded from `files`.
Serialize the manifest as UTF-8 JSON without BOM. Sign its **exact stored bytes**;
verification must not parse/re-serialize it. Reject duplicate JSON keys, non-finite
numbers and malformed UTF-8. Stable sorted serialization makes producer output
predictable, but does not promise byte-identical exports with different UUIDs/dates.

## Project catalog and scientific payload

`project.json` is a portable read model, not a dump of ORM entities. It contains:

| Object | Required information |
| --- | --- |
| Project | Package-local ID, teacher-reviewed classroom title/description and ordered sensor inventory. |
| Participants | Ordered records with UUID, pseudonym `P001` etc., and exact Parquet path. No original code, exact age or sex by default. |
| Scenarios | UUID, safe classroom label, canonical package scenario key, type, intrinsic dimensions, optional duration/fps, media ID/state, ordered AOIs and acquisition placement. |
| AOIs | Remapped UUID, safe label, color, rect/circle/polygon type and unmodified numerical shape coordinates. |
| Placement | The supported `screen-stimulus-v1` contract, screen/stimulus dimensions, viewport/scroll, display mode, stability and provenance/fingerprint where present. |
| Media | UUID, path when included, allowed MIME/type, dimensions/timing. If omitted, explicit reason and retained geometry. |
| Provenance | Supported fixation/transform/EEG data-contract evidence and supported fixation durations, projected from acquisition metadata; never fabricated from an app version/date. |

Exact field names for the read DTOs and placement projection are frozen together in
T3 before T2 implementation; the content obligations above are part of M0 approval.
Keep teacher API compatibility in DTO serializers rather than carrying teacher-only
fields into the package. The package has no owner/account/Drive IDs or URLs.
The importer computes the content revision from the manifest digest and stores it
only in its local catalog/read DTO, outside `project.json`. This avoids a cycle in
which the manifest hashes a payload that embeds the manifest's own hash.

Use current **whole-user Parquets**, not a redundant bundle of all scenario partitions.
Preserve sample order, dtypes, numerical precision, nulls, row-to-scenario membership,
timing, channel order, signal units and acquisition rates. Preserve persisted
fixation-v2 outputs, available duration variants (100/150/200/250/300 ms), transform
columns/status/version/fingerprint, geometry and EEG unit/rate metadata, including
necessary schema metadata and `PANDAS_ATTRS`/DataFrame attrs.

The current EEG provenance includes `eeg_acquisition.source_units`, `scale_to_uV`,
`excluded_channels`, `assumed_uV_channels` and `declared_rates_hz`; retain these and
their consistent `recording_units.eeg`/`PANDAS_ATTRS` representations. For a channel
whose source unit is `kilo`, the recorded scale must be 1000. A displayed “scale
corrected” warning alone is insufficient evidence. S3 freezes validation of all
supported unit/scale combinations and absence/contradiction cases before T2/T4.
Provenance records what ingestion did; it is not an independent recalibration of
the underlying recordings.

Export must project an explicit column/metadata allowlist from the approved data
contract and rewrite participant/scenario identities consistently. Arbitrary extra
CSV columns and free-form acquisition metadata cannot pass through. Rewriting
Parquet requires a PyArrow-aware teacher adapter with tests for dtype/attrs/provenance
preservation; the container library only hashes and transports bytes. Import validates
the projected Parquet schema/semantics before publishing the package.

Scenario identity and transform metadata can contain identity-derived fingerprints.
Rewrite only identity-bearing fields defined by the projection and recompute their
documented hashes consistently. Numerical transforms/geometry must remain unchanged.
The export test oracle retains the identity map privately for comparison; it is not
shipped to students. Teacher responses versus student responses use an explicit list
of identity/fingerprint normalizations, never a blanket metadata exclusion.

## Export eligibility and coherent snapshot

READY is a necessary UI entry condition. The exporter also checks:

1. Current user owns the project and may export; ingestion is not being replaced.
2. All selected participants have unique, explicit mappings to readable whole-user
   Parquets; reject ambiguous legacy filename/position-based resolution.
3. Selected scenarios, sensors, AOIs, placement, data membership and media references
   are consistent. A sensor/scenario may lack data only if the accepted contract
   explicitly models it as unavailable and the UI displays that state.
4. Data provenance satisfies the scientific profile. Old EEG scale/unit fixes cannot
   be inferred from READY or generation. Missing required evidence yields
   `REINGEST_REQUIRED`; record concrete acceptable markers during the metadata spike.
5. Every selected media file exists and is allowed. Explicit media omission is a
   separate teacher choice; a missing selected file cannot silently become omitted.
6. Names/description/media selection are shown for classroom review. Package data
   uses the safe projection even when original participant codes look anonymous.

Capture one coherent snapshot across metadata and bytes. A generation check alone
does not catch AOI edits. Proposed implementation: a per-project export/mutation lock
shared by every relevant writer, capture a metadata revision/fingerprint, read the
referenced generation into staging, and recheck metadata and source-file identity
before publication. If locking all writers is infeasible, use a documented snapshot
and revision protocol covering **all** mutable metadata. Fail/retry on change; never
publish a mixture. Do not hold a database transaction open while downloading media.

Build into a teacher-private staging directory, finish privacy/semantic validation,
hash payloads, sign, then publish the finished download. Failed/cancelled exports
clean their staging data. Do not regenerate signals or fixation outputs during export.

## Pseudonymisation and media

Create a fresh participant mapping per export; do not expose the original mapping.
Remap entity IDs, filenames, Parquet identities and metadata references together.
Use neutral labels by default; any descriptive classroom labels are explicitly
teacher-reviewed. Remove source paths/folder names, original filenames, free-form
recording labels, original codes and cloud/account identifiers. Do not export cache
tokens containing those identities; derive local tokens from validated content.

This is pseudonymisation, not a promise of anonymity. Stimulus pixels/audio may
identify people even after metadata is stripped. The teacher selects distributable
media; distribution consent/policy remains a deployment input. v1 supports only
reviewed raster image formats and, if approved, MP4 video supported by the frozen
preview stack. SVG/HTML and other active formats are rejected in package v1; existing
teacher goldens using synthetic SVG remain unchanged and package fixtures use separate
raster stimuli. Strip nonessential identifying metadata without changing dimensions,
timing or scientific geometry; fail if the chosen conversion cannot preserve the contract.

Video requires bundled FFmpeg/FFprobe and participant/scenario time mapping equivalent
to teacher preview. No network fetch, silent transcoding or preview-time ingestion.
If video is deferred, packages containing included video are rejected as unsupported;
image-only packages and explicitly omitted media remain valid.

## Signing and trust — owner decision still required

Proposed policy: Ed25519 signature, mandatory verification with an institution-managed
trust store shipped separately with the app. SHA-256 checks corruption; the signature
authenticates the manifest and therefore its payload hash list. Use the established
`cryptography` implementation, not handwritten cryptography. Its documented API signs
and verifies bytes: [Ed25519 documentation](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/).

`signature.json` contains only `{algorithm, key_id, signature_base64}`. The algorithm
and key ID must agree with the signed manifest. Sign:
`b"NeuroDatics student package v1\x00" + manifest_bytes`.
Only a pretrusted public key can validate the package. A key carried in the package
does not establish trust. Unknown keys, unsigned packages and altered manifests,
payloads or signatures fail closed with actionable errors.

Key operations are part of the feature: appoint an issuer/operator, generate a key
outside student builds, protect and back up the private key on the teacher side,
configure the exporter, ship only public keys, and test rotation with a new student
trust-store/app release. Offline clients cannot discover remote revocation; a revoked
key stops being accepted after an explicit trust-store/app update. Do not promise
online freshness, automatic expiry or protection against an issuer signing bad data.

If the owner selects integrity-only distribution, revise this spec before T1: remove
mandatory signing, describe issuer trust as out-of-band, and narrow tamper claims to
accidental corruption. Do not implement an undocumented “accept unsigned” fallback.
Package signatures and Windows installer Authenticode signing are separate decisions;
no certificate or signing credential has been provisioned by M0.

## Reader/import transaction and resource bounds

Provisional v1 limits: 1 MiB manifest, 1 KiB signature envelope, 16 MiB project catalog,
4,096 payload entries, 2 GiB compressed archive, 8 GiB expanded payload and 4 GiB per
payload file. JSON nesting <=32. Validate integer ranges and the sum of sizes; enforce
actual streamed bytes and disk quota even when ZIP headers lie. These are technical
ceilings, not the 500 MiB reference-workload promise. Confirm in S2/T8 before release.

1. Accept a local archive upload, not a URL or arbitrary server path. Apply body-size
   admission before parsing. One import at a time; stream to private staging.
2. Inspect archive members and bounded manifest/signature; reject duplicates, ZIP
   encryption, unsupported compression, links/devices, absolute/UNC/drive paths,
   `..`, backslashes, NULs, alternate streams, Windows reserved names, trailing dots/
   spaces and case-insensitive path collisions. Resolve every extraction target
   inside the dedicated staging directory. Never use unrestricted `extractall`.
3. Enforce supported versions/features and trust policy. Validate exact member set
   and declared limits before extracting; verify size/hash while extracting.
4. Validate catalog references, media types/geometry, Parquet schema/attrs and data
   identity consistency without evaluating executable content or contacting a network.
5. Derive immutable content revision from the validated manifest digest. Atomically
   rename staging to the package directory, then commit the SQLite catalog entry;
   reconcile orphan directories after crashes. Never expose a catalog entry first.
6. Same package ID + same manifest digest is an idempotent duplicate. Same ID with a
   different digest is a conflict. A new export is a separate library item; no silent
   replacement. Keep library data and imports outside the installation directory.
7. Cancellation/failure removes only that staging area. Recheck content integrity
   on library reopen or through a verified-cache policy; cached results cannot hide
   changed files. Local copies are immutable through the app, not filesystem tamper-proof.

Stable importer errors: `INVALID_ARCHIVE`, `LIMIT_EXCEEDED`, `UNSUPPORTED_FORMAT`,
`UNSUPPORTED_ANALYTICS`, `UNSUPPORTED_MEDIA`, `UNKNOWN_SIGNER`, `INVALID_SIGNATURE`,
`HASH_MISMATCH`, `INVALID_CATALOG`, `INVALID_PARQUET`, `DUPLICATE_CONFLICT`,
`INSUFFICIENT_DISK`, `CANCELLED`. Teacher export also uses `PROJECT_CHANGED`,
`EXPORT_INCOMPLETE`, `REINGEST_REQUIRED`. User-facing explanations are Spanish;
logs must not expose original participant identity or private filesystem paths.

## Required tests

T1: schema/version/feature fixtures; reader/writer round trip; malformed/duplicate JSON;
tampered manifest/payload/signature; untrusted key; archive path/case/link/size attacks;
streamed bound enforcement. Keep container tests independent of FastAPI/SQL/Drive.

T2/T4: real processed Parquet projection preserves scientific columns/attrs; privacy
sentinels cannot survive in catalog/paths/metadata; identity remapping is complete;
snapshot mutation is detected; media omission differs from missing selected media;
atomic import/crash/duplicate/restart behavior. Add version/legacy-provenance fixtures.

T5: full teacher-before-export and teacher/student-package comparison from the plan.
Neither current golden fixtures nor snapshots are regenerated to accept a difference.
