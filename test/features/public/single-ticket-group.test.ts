/**
 * A group with "one ticket per order" on: the group page offers radio cards,
 * and every public order is held to one ticket across the group's listings.
 */

import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { assignListingsToGroup } from "#db/groups/membership/package-writes.ts";
import { renderTicketPage } from "#routes/public/ticket-form.ts";
import { resolvePageQuantities } from "#routes/public/ticket-submit/parse.ts";
import { prepareOrder } from "#routes/public/ticket-submit/prepare.ts";
import { FormParams } from "#shared/form-data.ts";
import { setSavedFormData } from "#shared/forms/saved-data.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestGroup } from "#test-utils/db-helpers/groups.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { withRequestContext } from "#test-utils/request-context.ts";
import {
  pageBookingTree,
  quantityForm,
  ticketContext,
} from "#test-utils/ticket-ctx.ts";

const flaggedGroup = async () => {
  const group = await createTestGroup({
    name: "Dinner",
    singleTicketPerOrder: true,
  });
  const a = await createTestListing({
    maxAttendees: 10,
    maxQuantity: 5,
    name: "Starter",
  });
  const b = await createTestListing({
    maxAttendees: 10,
    maxQuantity: 5,
    name: "Main",
  });
  await assignListingsToGroup([a.id, b.id], group.id);
  const { groups } = await import("#db/groups.ts");
  groups.cache.invalidate();
  const stored = (await groups.cache.getAll()).find((g) => g.id === group.id)!;
  return { a, b, group: stored };
};

const radioForm = (listingId: number | null) => {
  const form = new FormParams();
  if (listingId !== null) form.set("single_ticket", String(listingId));
  return form;
};

describeWithEnv("one ticket per order groups", { db: true }, () => {
  test("the group page offers radios and no quantity selects", async () => {
    const { a, b, group } = await flaggedGroup();
    const ctx = await ticketContext([a.id, b.id], group);
    expect(ctx.singleTicketGroupId).toBe(group.id);

    const html = renderTicketPage(ctx);
    expect(html).toContain(`name="single_ticket" value="${a.id}"`);
    expect(html).toContain(`name="single_ticket" value="${b.id}"`);
    expect(html).not.toContain(`name="quantity_${a.id}"`);
    expect(html).toContain("One ticket per order");
    expect(html).not.toMatch(/name="single_ticket"[^>]* checked/);
  });

  test("restores the chosen radio when the page re-renders", async () => {
    const { a, b, group } = await flaggedGroup();
    const ctx = await ticketContext([a.id, b.id], group);
    await withRequestContext(() => {
      setSavedFormData(radioForm(b.id));
      const html = renderTicketPage(ctx);
      expect(html).toMatch(
        new RegExp(`name="single_ticket" value="${b.id}"[^>]* checked`),
      );
      expect(html).not.toMatch(
        new RegExp(`name="single_ticket" value="${a.id}"[^>]* checked`),
      );
    });
  });

  test("an unflagged group page keeps its selects", async () => {
    const group = await createTestGroup({ name: "Plain" });
    const a = await createTestListing({ maxAttendees: 10, maxQuantity: 5 });
    const b = await createTestListing({ maxAttendees: 10, maxQuantity: 5 });
    await assignListingsToGroup([a.id, b.id], group.id);
    const html = renderTicketPage(await ticketContext([a.id, b.id], group));
    expect(html).toContain(`name="quantity_${a.id}"`);
    expect(html).not.toContain("single_ticket");
  });

  test("the chosen radio books one ticket of that listing", async () => {
    const { a, b, group } = await flaggedGroup();
    const ctx = await ticketContext([a.id, b.id], group);
    const { quantities } = resolvePageQuantities(
      radioForm(b.id),
      ctx,
      pageBookingTree(ctx),
    );
    expect(quantities.get(b.id)).toBe(1);
    expect(quantities.get(a.id) ?? 0).toBe(0);
    const result = await prepareOrder(ctx, radioForm(b.id));
    expect(result.ok).toBe(true);
  });

  test("no radio chosen is refused", async () => {
    const { a, b, group } = await flaggedGroup();
    const ctx = await ticketContext([a.id, b.id], group);
    const result = await prepareOrder(ctx, radioForm(null));
    expect(result).toEqual({
      error: "Please select at least one ticket",
      ok: false,
    });
  });

  test("a foreign radio value books nothing", async () => {
    const { a, b, group } = await flaggedGroup();
    const ctx = await ticketContext([a.id, b.id], group);
    const result = await prepareOrder(ctx, radioForm(999999));
    expect(result.ok).toBe(false);
  });

  test("a crafted cart with one ticket each is refused", async () => {
    const { a, b } = await flaggedGroup();
    const ctx = await ticketContext([a.id, b.id]);
    const result = await prepareOrder(
      ctx,
      quantityForm({ [a.id]: 1, [b.id]: 1 }),
    );
    expect(result).toEqual({
      error: "Dinner allows one ticket per order.",
      ok: false,
    });
  });

  test("a listing page with two tickets of a member is refused", async () => {
    const { a } = await flaggedGroup();
    const ctx = await ticketContext([a.id]);
    const result = await prepareOrder(ctx, quantityForm({ [a.id]: 2 }));
    expect(result.ok).toBe(false);
    const one = await prepareOrder(ctx, quantityForm({ [a.id]: 1 }));
    expect(one.ok).toBe(true);
  });

  test("an unflagged group allows many tickets", async () => {
    const group = await createTestGroup({ name: "Plain" });
    const a = await createTestListing({ maxAttendees: 10, maxQuantity: 5 });
    await assignListingsToGroup([a.id], group.id);
    const ctx = await ticketContext([a.id]);
    expect((await prepareOrder(ctx, quantityForm({ [a.id]: 3 }))).ok).toBe(
      true,
    );
  });
});
