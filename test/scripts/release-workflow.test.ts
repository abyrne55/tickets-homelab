import { assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { expectIncludesAll } from "#test-utils/assertions.ts";
import { walkSourceFiles } from "#test-utils/walk-src.ts";

const imagePath = ".github/workflows/publish-image.yml";
const releasePath = ".github/workflows/release.yml";
const readImage = (): string => Deno.readTextFileSync(imagePath);

describe("Image publication workflow", () => {
  test("runs on pushes to main and by hand only", () => {
    const triggers = readImage().match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1];
    expect(triggers?.trim()).toBe(
      ["push:", "    branches: [main]", "  workflow_dispatch:"].join("\n"),
    );
  });

  test("builds each platform on a runner of the same architecture", () => {
    expectIncludesAll(readImage(), [
      "platform: linux/amd64\n            runner: ubuntu-24.04\n",
      "platform: linux/arm64\n            runner: ubuntu-24.04-arm\n",
    ]);
  });

  test("checks the loaded image before it pushes anything", () => {
    const workflow = readImage();
    const check = workflow.indexOf("run: scripts/container-check.sh");
    expect(check).toBeGreaterThan(workflow.indexOf("load: true"));
    expect(check).toBeLessThan(workflow.indexOf("push-by-digest=true"));
    assertStringIncludes(workflow, "CONTAINER_IMAGE: tickets-check");
  });

  test("pushes each platform by digest, then tags one manifest", () => {
    const workflow = readImage();
    expectIncludesAll(workflow, [
      "push-by-digest=true,name-canonical=true,push=true",
      `-t "\${image}:latest"`,
      `-t "\${image}:sha-\${GITHUB_SHA}"`,
      "IMAGE_NAME: abyrne55/tickets-homelab",
    ]);
    expect(workflow.match(/docker buildx imagetools create/g)).toHaveLength(1);
  });

  test("keeps the least-privilege permissions", () => {
    expectIncludesAll(readImage(), [
      "\npermissions:\n  contents: read\n  packages: write\n",
    ]);
  });

  test("pins every action to a commit", () => {
    const uses = readImage().match(/uses: \S+/g) ?? [];
    expect(uses.filter((line) => !/@[0-9a-f]{40}$/.test(line))).toEqual([]);
  });

  test("needs neither Nix nor devenv", () => {
    expect(readImage()).not.toMatch(/devenv|container-build|container-load/);
  });
});

describe("Create Release workflow", () => {
  test("no longer calls the image workflow", () => {
    const callers = walkSourceFiles(".github/workflows", [
      ".yml",
      ".yaml",
    ]).filter((path) =>
      Deno.readTextFileSync(path).includes(`uses: ./${imagePath}`),
    );
    expect(callers).toEqual([]);
  });

  test("grants no registry write", () => {
    const workflow = Deno.readTextFileSync(releasePath);
    expectIncludesAll(workflow, [
      "\npermissions:\n  contents: read\n",
      "  release:\n    permissions:\n      contents: write\n",
    ]);
    expect(workflow).not.toContain("packages: write");
  });
});
