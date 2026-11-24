import { describe, it as test } from "@std/testing/bdd";
import { contentEntityEditPanel } from "#templates/admin/site-content.tsx";
import { setupAdminPageTest } from "#test-utils/admin-page-test.ts";
import { expectIncludesAll } from "#test-utils/assertions.ts";

describe("contentEntityEditPanel", () => {
  setupAdminPageTest();

  test("renders one entity's edit form posting to its update route", () => {
    type Post = { id: number; name: string };
    const editForm = {
      render: (values: { name: string }) =>
        `<input name="name" value="${values.name}">`,
    };
    const panel = contentEntityEditPanel<Post, { name: string }>(
      "/admin/site/news",
      editForm,
      (post) => ({ name: post.name }),
    );

    const html = String(panel({ id: 17, name: "Launch &amp; Learn" }));
    expectIncludesAll(html, [
      'action="/admin/site/news/17/edit"',
      'value="Launch &amp; Learn"',
      "Save Changes",
    ]);
  });
});
