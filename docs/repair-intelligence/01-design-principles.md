# Repair Intelligence — Design Principles

> Binding for every phase. If a phase plan conflicts with a principle, the plan is wrong —
> stop and ask Brad (see `03-working-rules.md` R8).

## Problem

- Parts such as laptop panels and mainboard ICs are **many-to-many** with devices. Today there is
  no way to record "this panel fits these models" or "this chip sits on this board".
- Parts harvested from repairs or scrapped units are hard to register and hard to find again.
- Past repair experience is not searchable, so we re-buy parts we already have.
- Tickets (`repair_tickets`) have **no fields for repair content** — only free-text `symptoms`
  from intake. Diagnosis, measurements, work done and results are lost (or buried in `ticket_logs`).

## Principles

**P1. Part spec ≠ stock unit.**
A part spec (what a part *is*) and a stock unit (a physical item on a shelf) are different entities.
Physical stock stays in the EXISTING inventory tables
(`inventory_categories → inventory_specs → inventory_products → inventory_items`,
movements in `inventory_transactions`). Never create a parallel inventory table.

**P2. Compatibility targets.**
A compatibility row targets exactly one of: `device_model` | `device_variant` | `board`.
Chips/ICs attach to boards (board numbers like `NM-xxxx`, `LA-xxxxP`, `DA0xxx`, `BA92-xxxxx`).
Panels attach to models/variants.

**P3. Status and confidence are separate columns.**
- `status` = `compatible | conditional | incompatible | unknown`
- `confidence` = `verified | documented | inferred`

Any combination is valid (e.g. `incompatible + verified`, `compatible + inferred`).
`conditional` rows require a `limitation_note` (e.g. "밝기 조절 불가", "브래킷 가공 필요").
Every status/confidence change is backed by a `compatibility_evidence` row.

**P4. "verified" is human-only.**
`verified` is set ONLY by an explicit human confirmation after physical installation.
Never inferred from ticket completion alone. Never set by AI.

**P5. Donor devices are potential stock.**
Parts are extracted lazily, when needed, and then pass through the EXISTING extracted-part
registration flow (today: `registerReturnMaterialAction` → `approveReturnMaterialAction`,
see `00-current-state.md` §3.5). Per decision Q3 that flow is being moved into a single-transaction
RPC (Phase 2) that also works without a `ticket_materials` row; once switched, "the existing
extracted-part registration flow" means that RPC.

**P6. No double entry.**
Parts used in a repair are read from the existing dispatch/checkout records (`ticket_materials`).
Staff never re-type them into the repair record.

**P7. One transaction for inventory.**
All inventory-affecting operations run inside a single DB transaction (Postgres function/RPC).
Manual cost entries (`repair_tickets.material_cost_details`, `ticket_materials.override_unit_price`)
are never overwritten. Existing dispatch approval, cancellation-with-admin-approval, and
reverse-logistics rollback behaviour must not change.¹

¹ Approved exceptions (2026-09-27): Q3 — extracted-part registration and admin-approved
return/rollback are re-implemented as transactional RPCs, with results proven identical by test
before the UI is switched (plus the capacity fix). Q11 — Phase 0.5 changes only the *purchase*
branch of dispatch approval; the dispatch path must stay identical.

**P8. AI access is read-only via RPC; AI writes go to a queue.**
AI agents (including the in-house mainboard support agent **VECTOR**) read only through dedicated
RPC functions. AI writes go to an approval queue (`ai_candidates`), never directly into knowledge or
inventory tables. No `service_role` key is ever given to an agent.

**P9. AI lookup priority.**
internal repair cases > verified compatibility > inventory > donors > documented > internet > AI inference.

**P10. New enforcement ships dark.**
New enforcement (e.g. the ticket close gate) ships behind a setting flag, default OFF,
so staff can be trained before it is enforced.
