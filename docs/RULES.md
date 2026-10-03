# Rules

Rules are the Layer-2 access overlay of the ContextForge RBAC model. The
gateway owns the rule catalog at `/rbac/rules`. This document describes the 3
rule surfaces in the Web UI and how to work with them.

Token scopes (Layer 1) still apply to every check. A rule can deny a call that
the token allows. A rule cannot allow a call that the token denies.

For the server-side contract, see the gateway RBAC documentation:
<https://github.com/IBM/mcp-context-forge/blob/main/docs/docs/manage/rbac.md>

## The 3 rule surfaces

### Settings → Rules tab

Open **Settings** and select the **Rules** tab. The tab lists every rule in
the catalog. A capability filter narrows the list to 1 capability type. Each
row has an activity toggle. From this tab you can create a rule, edit a rule,
and delete a rule. Delete asks for confirmation before it removes the rule.

### Per-entity Rules tab

Open the detail panel of a tool, resource, prompt, server, gateway, A2A agent,
or route. Select the **Rules** tab. The tab shows 3 groups:

- **Entity rules.** Rules that name this entity.
- **Inherited type rules.** Rules that apply to every entity of the type.
  Manage them in Settings.
- **Built-in defaults.** The system defaults that apply when no rule matches.

The tab also shows the Layer-1 note. Token scopes still apply on top of the
rules.

### Predicate builder

The create and edit form has 2 modes for the predicate.

- **Builder.** Compose the predicate from rows. Each row has an attribute, an
  optional operator, and a value. A join selector combines the rows with `&`
  or `|`. The form shows the compiled predicate under the rows.
- **Raw.** Edit the predicate as plain text. Use this mode when the builder
  cannot show the predicate as rows. The form tells you when this happens.

## Rule fields

| Field           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| Name            | Unique label for the rule.                                             |
| Capability type | 1 of tool, resource, prompt, server, gateway, a2a_agent, route.        |
| Entity          | Optional entity id. Empty matches every entity of the capability type. |
| Permission      | Optional permission narrow. Empty matches every permission.            |
| Phase           | Before invocation or after invocation.                                 |
| Predicate       | CPEX APL expression that decides when the rule applies.                |
| Effect          | Allow or deny.                                                         |
| Priority        | Number. The gateway evaluates lower numbers first.                     |
| Active          | Toggle. Inactive rules stay in the catalog but do not apply.           |

## The predicate language

Predicates use a subset of the CPEX APL language. The builder covers the
common forms:

- **Truthiness.** `role.viewer` is true when the subject holds the viewer
  role.
- **Comparison.** `delegation.depth > 2` compares an attribute with a value.
  The operators are `==`, `!=`, `>`, `>=`, `<`, `<=`.
- **Membership.** `subject.id in allowed` tests membership in a collection.
  `not in` negates the test.
- **Existence.** A bare attribute tests that the attribute exists.
- **Joins.** `&` requires both sides. `|` accepts either side.

The builder offers 3 attribute families: `role`, `perm`, and `team`. It also
offers the special attributes `authenticated`, `token.is_admin`, and
`subject.id`. Use raw mode for any other attribute.

## Worked example: deny viewers a tool

Goal: deny the tool `web-search` to every subject with the viewer role.

1. Open **Settings → Rules** and select **Create rule**.
2. Enter the name `deny-viewer-web-search`.
3. Set the capability type to **Tool**.
4. Set the entity to `web-search`.
5. Leave the permission empty. The rule then matches every permission.
6. Set the phase to **Before invocation**.
7. Set the effect to **Deny**.
8. Stay in **Builder** mode for the predicate.
9. In the condition row, set the attribute to `role` and the name to `viewer`.
10. Leave the operator at `—`. Leave the value empty.

The row compiles as follows:

| Attribute | Name   | Operator | Value  | Compiles to   |
| --------- | ------ | -------- | ------ | ------------- |
| role      | viewer | —        | (none) | `role.viewer` |

The operator `—` means truthiness. The compiled predicate is `role.viewer`.
The form shows it under the rows.

Select **Create**. The gateway stores the rule. From now on the gateway denies
`web-search` to every subject whose roles include viewer.

To widen the rule, add a 2nd condition row and pick a join. For example, add
the row `role` / `admin` with operator `—` and pick `|` as the join. The
predicate compiles to `role.viewer | role.admin`.

## Permission model

Create, edit, and delete need the `rbac.rules.manage` permission. The Rules
tab hides when you do not hold it. The gateway enforces the same permission on
the endpoints.

The UI locks system rows. It marks them as system rules. You cannot edit or
delete them from the UI. The gateway also refuses to delete them.

## Failure behavior

The gateway validates every predicate on create and on update. An invalid
predicate answers `422 Unprocessable Entity`. The response carries a detail
message. The form renders the detail inline under the predicate field. Fix the
predicate and submit again.
