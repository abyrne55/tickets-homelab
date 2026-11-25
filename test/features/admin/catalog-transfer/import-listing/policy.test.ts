import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { getAllListings } from "#db/listings/records.ts";
import { importCatalog } from "#routes/admin/catalog-transfer/import.ts";
import { describeWithEnv } from "#test-utils/db.ts";

const importPolicyListing = async (
  name: string,
  adminLevel?: "editor" | "owner",
) => {
  const result = await importCatalog(
    {
      kind: "listing",
      listing: {
        maxAttendees: 5,
        name,
        useDefaults: true,
        usesLogistics: true,
        webhookUrl: "https://hooks.example.test/orders",
      },
      version: 1,
    },
    adminLevel,
  );
  if (!result.ok) throw new Error(result.error);
  const listing = (await getAllListings()).find((row) => row.name === name);
  if (!listing) throw new Error("imported listing not found");
  return listing;
};

describeWithEnv("catalog import policy", { db: true }, () => {
  test("an editor cannot import protected listing settings", async () => {
    const listing = await importPolicyListing("Editor policy", "editor");

    expect(listing.webhook_url).toBe("");
    expect(listing.use_defaults).toBe(false);
  });

  test("an owner keeps protected listing settings", async () => {
    const listing = await importPolicyListing("Owner policy", "owner");

    expect(listing.webhook_url).toBe("https://hooks.example.test/orders");
    expect(listing.use_defaults).toBe(true);
  });

  test("an old export's retired usesLogistics key is accepted and ignored", async () => {
    // importPolicyListing sends usesLogistics: true, as exports made before
    // logistics was removed do. The import must still succeed.
    const listing = await importPolicyListing("Old export");

    expect(listing.name).toBe("Old export");
    expect("uses_logistics" in listing).toBe(false);
  });
});
