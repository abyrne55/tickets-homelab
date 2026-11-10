import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import {
  singleTicketGroupError,
  singleTicketMemberError,
  singleTicketRefusal,
} from "#booking/single-ticket-groups.ts";
import { describeWithEnv } from "#test-utils/db.ts";

const group = (id: number, name: string, listingIds: number[]) => ({
  id,
  listingIds,
  name,
});

describeWithEnv("singleTicketRefusal", { db: true }, () => {
  test("allows no tickets and one ticket in a flagged group", () => {
    const groups = [group(1, "Dinner", [10, 11])];
    expect(singleTicketRefusal(new Map(), groups)).toBeNull();
    expect(singleTicketRefusal(new Map([[10, 1]]), groups)).toBeNull();
  });

  test("refuses two tickets across two member listings", () => {
    const groups = [group(1, "Dinner", [10, 11])];
    expect(
      singleTicketRefusal(
        new Map([
          [10, 1],
          [11, 1],
        ]),
        groups,
      ),
    ).toBe("Dinner allows one ticket per order.");
  });

  test("refuses two tickets of one listing", () => {
    expect(
      singleTicketRefusal(new Map([[10, 2]]), [group(1, "Dinner", [10])]),
    ).toContain("Dinner");
  });

  test("names the first flagged group that is over", () => {
    const groups = [group(1, "A", [10]), group(2, "B", [10, 11])];
    expect(
      singleTicketRefusal(
        new Map([
          [10, 1],
          [11, 1],
        ]),
        groups,
      ),
    ).toContain("B");
  });

  test("ignores listings outside the flagged group and unflagged groups", () => {
    expect(
      singleTicketRefusal(new Map([[99, 5]]), [group(1, "Dinner", [10])]),
    ).toBeNull();
    expect(singleTicketRefusal(new Map([[10, 5]]), [])).toBeNull();
  });

  test("member and group config errors", () => {
    expect(singleTicketMemberError({ min_quantity: 1, name: "A" })).toBeNull();
    expect(singleTicketMemberError({ min_quantity: 2, name: "A" })).toContain(
      "A",
    );
    expect(singleTicketGroupError(true, [])).not.toBeNull();
    expect(
      singleTicketGroupError(false, [{ min_quantity: 3, name: "B" }]),
    ).toContain("B");
    expect(
      singleTicketGroupError(false, [{ min_quantity: 1, name: "B" }]),
    ).toBeNull();
  });
});
